/**
 * Browser interop hook / 账号 ↔ 浏览器互通编排（互通 I1 出向 / I2 入向）。
 *
 * 编排规则：
 *  - 打开弹窗即拉取可用浏览器列表与当前实例状态（只读，不落库）。
 *  - 「以该账号身份打开」= injectSession=true；「打开站点并手动登录」
 *    = injectSession=false（供浏览器内扫码 / 2FA / SSO 后回采）。
 *  - 回采默认 confirmed=false：后端在「Bench 已有不早于本次的会话」时返回
 *    outcome="conflict" 且不写入；UI 展示冲突详情，用户确认后才以 force 重试。
 *    不存在静默覆盖更新鲜会话的路径。
 *  - 防重入：busy 非 null 期间所有动作按钮禁用。
 */
import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { TFunction } from "i18next"
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"
import { translateError } from "@/lib/tauri/errors"
import type {
  BrowserCaptureOutcome,
  BrowserOpenOutcome,
  BrowserOptionDto,
  BrowserProbeOutcome,
  BrowserStatusOutcome,
  SessionOrigin,
  StationAccount,
} from "@/lib/tauri/types/account-manager"

/** 当前进行中的动作（用于防重入与按钮禁用）。 */
export type BrowserInteropBusy = "open" | "login" | "capture" | "close" | "clear" | "probe" | null

export function useBrowserInterop(options?: { onCaptured?: () => void }) {
  const { t } = useTranslation()
  const onCaptured = options?.onCaptured
  const [open, setOpen] = useState(false)
  const [account, setAccount] = useState<StationAccount | null>(null)
  const [browsers, setBrowsers] = useState<BrowserOptionDto[]>([])
  const [browserId, setBrowserId] = useState<string | null>(null)
  const [status, setStatus] = useState<BrowserStatusOutcome | null>(null)
  const [busy, setBusy] = useState<BrowserInteropBusy>(null)
  /**
   * 防重入的权威判据。React 的 state 更新是异步的，同一 tick 内的重复调用
   * （快速双击、同一事件里连点）读到的 busy 仍是旧值，因此改用 ref 同步置位：
   * state 只负责禁用 UI，ref 负责拦截。两者始终同步更新。
   */
  const busyRef = useRef<BrowserInteropBusy>(null)
  /** outcome="conflict" 时的后端结果（含 Bench 侧已有会话的时间与来源）。 */
  const [conflict, setConflict] = useState<BrowserCaptureOutcome | null>(null)
  /** 最近一次「打开」的结果：用于在弹窗内交代到底注入了什么，而不是只弹一个 toast。 */
  const [lastOpen, setLastOpen] = useState<BrowserOpenOutcome | null>(null)
  /** 最近一次「检测登录态」的结果（只读预检）。 */
  const [probe, setProbe] = useState<BrowserProbeOutcome | null>(null)

  const begin = useCallback((kind: Exclude<BrowserInteropBusy, null>) => {
    if (busyRef.current) return false
    busyRef.current = kind
    setBusy(kind)
    return true
  }, [])

  const end = useCallback(() => {
    busyRef.current = null
    setBusy(null)
  }, [])

  const refreshStatus = useCallback(async (accountId: string) => {
    try {
      setStatus(await accountManagerUseCases.browserSessionStatus(accountId))
    } catch {
      // 状态查询失败不阻塞主流程：按「未运行」展示，动作仍可尝试。
      setStatus({ running: false })
    }
  }, [])

  const openDialog = useCallback(
    (target: StationAccount) => {
      setAccount(target)
      setConflict(null)
      setOpen(true)
      void (async () => {
        try {
          const list = await accountManagerUseCases.listBrowsers()
          setBrowsers(list)
          setBrowserId((current) => current ?? list[0]?.id ?? null)
        } catch (error) {
          setBrowsers([])
          toast.error(translateError(t, error, t("accountManager.toasts.browserListFailed")))
        }
        await refreshStatus(target.id)
      })()
    },
    [refreshStatus, t],
  )

  const closeDialog = useCallback(() => setOpen(false), [])

  /** 打开（或复用）该账号的浏览器实例。injectSession=false 走手动登录分支。 */
  const handleOpen = useCallback(
    (injectSession: boolean) => {
      if (!account) return
      if (!begin(injectSession ? "open" : "login")) return
      setConflict(null)
      setProbe(null)
      setLastOpen(null)
      accountManagerUseCases
        .openBrowserSession(account.id, {
          browserId,
          injectSession,
          resetProfile: false,
        })
        .then((outcome) => {
          setLastOpen(outcome)
          if (!injectSession) {
            toast.info(t("accountManager.toasts.browserOpenedForLogin"))
            return refreshStatus(account.id)
          }
          if (!outcome.hasStoredSession) {
            // 最关键的一条提示：Bench 里根本没有这个账号的会话，注入必然是空转。
            toast.warning(t("accountManager.toasts.browserNoStoredSession"))
          } else if (outcome.injectedCookies === 0) {
            toast.error(
              t("accountManager.toasts.browserNothingInjected", {
                skipped: outcome.skippedPartitioned,
                rejected: outcome.rejectedCookies,
              }),
            )
          } else {
            toast.success(
              t("accountManager.toasts.browserSessionInjected", {
                count: outcome.injectedCookies,
                origins: outcome.storageOrigins,
              }),
            )
          }
          return refreshStatus(account.id)
        })
        .catch((error) => {
          toast.error(translateError(t, error, t("accountManager.toasts.browserOpenFailed")))
        })
        .finally(end)
    },
    [account, begin, browserId, end, refreshStatus, t],
  )

  /** 只读预检：浏览器里是否已存在该站点的登录态（不写入任何数据）。 */
  const handleProbe = useCallback(() => {
    if (!account) return
    if (!begin("probe")) return
    setProbe(null)
    accountManagerUseCases
      .probeBrowserSession(account.id)
      .then((outcome) => {
        setProbe(outcome)
        if (!outcome.running) {
          toast.warning(t("accountManager.toasts.browserProbeNotRunning"))
        } else if (outcome.cookieCount === 0) {
          toast.info(t("accountManager.toasts.browserProbeNoSession"))
        } else {
          toast.success(
            t("accountManager.toasts.browserProbeFound", { count: outcome.cookieCount }),
          )
        }
      })
      .catch((error) => {
        toast.error(translateError(t, error, t("accountManager.toasts.browserProbeFailed")))
      })
      .finally(end)
  }, [account, begin, end, t])

  /**
   * 回采浏览器会话。`confirmed=false` 时若 Bench 已有不早于本次的会话，
   * 后端返回 conflict 且不写入；此时把结果交给 UI 二次确认。
   */
  const handleCapture = useCallback(
    (confirmed = false) => {
      if (!account) return
      if (!begin("capture")) return
      accountManagerUseCases
        .captureFromBrowser(account.id, confirmed)
        .then((outcome) => {
          if (outcome.outcome === "conflict") {
            setConflict(outcome)
            return
          }
          setConflict(null)
          if (outcome.outcome === "empty") {
            toast.info(t("accountManager.toasts.browserCaptureEmpty"))
          } else {
            toast.success(
              t("accountManager.toasts.browserCaptureSaved", {
                count: outcome.cookieCount,
                origins: outcome.storageOrigins,
              }),
            )
            // 读后写：会话已落库，刷新列表让状态 / 登录时间同步反映。
            onCaptured?.()
          }
        })
        .catch((error) => {
          toast.error(translateError(t, error, t("accountManager.toasts.browserCaptureFailed")))
        })
        .finally(end)
    },
    [account, begin, end, onCaptured, t],
  )

  const handleCloseInstance = useCallback(() => {
    if (!account) return
    if (!begin("close")) return
    accountManagerUseCases
      .closeBrowserSession(account.id)
      .then(() => refreshStatus(account.id))
      .catch((error) => {
        toast.error(translateError(t, error, t("accountManager.toasts.browserCloseFailed")))
      })
      .finally(end)
  }, [account, begin, end, refreshStatus, t])

  /** 「重新登录」：关闭实例并清空浏览器 profile。 */
  const handleClearProfile = useCallback(() => {
    if (!account) return
    if (!begin("clear")) return
    setConflict(null)
    accountManagerUseCases
      .clearBrowserProfile(account.id)
      .then(() => {
        toast.success(t("accountManager.toasts.browserProfileCleared"))
        return refreshStatus(account.id)
      })
      .catch((error) => {
        toast.error(translateError(t, error, t("accountManager.toasts.browserClearFailed")))
      })
      .finally(end)
  }, [account, begin, end, refreshStatus, t])

  return {
    open,
    account,
    browsers,
    browserId,
    status,
    busy,
    conflict,
    lastOpen,
    probe,
    setBrowserId,
    openDialog,
    closeDialog,
    handleOpen,
    handleCapture,
    handleCloseInstance,
    handleClearProfile,
    handleProbe,
  }
}

/** SessionOrigin → 本地化展示文案（后端只给稳定字符串，映射在前端）。 */
export function sessionOriginLabel(t: TFunction, origin?: SessionOrigin | null): string {
  const key = `accountManager.sessionOrigin.${origin ?? "unknown"}`
  const label = t(key)
  return label === key ? t("accountManager.sessionOrigin.unknown") : label
}
