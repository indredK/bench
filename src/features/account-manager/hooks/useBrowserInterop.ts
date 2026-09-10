/**
 * Browser interop hook / 账号 ↔ 浏览器互通编排（互通出向：把 Bench 里的登录态同步到浏览器）。
 *
 * 两个同步目标（用户显式选择）：
 *  - **隔离实例**：Bench 拉起「用户选的浏览器 + Bench 专属档案」的独立进程，会话经 CDP
 *    注入。不碰用户日常浏览器的任何数据。
 *  - **日常浏览器**：在用户自己的浏览器实例里打开站点，会话由 Bench Companion 扩展写入
 *    （浏览器安全模型不允许 Bench 直接写日常 profile 的 cookie）。
 *
 * 关键行为：**Bench 内置登录态的自动补采**。
 * 在 Bench 内置登录窗口里手动登录的会话历史上只存在于账号专属 WebView 档案中、
 * 从不落 canonical store —— 结果是账号状态 Ready 但出向注入报「没有已保存的登录态」。
 * 后端现在会在注入前从该档案补采（见 `account_manager::webview_sync`），本 hook 依据
 * `sessionRecovered` 区分「真的没有登录态」与「已当场补采并同步」两种结局。
 *
 * 编排规则：
 *  - 打开弹窗即拉取可用浏览器列表与当前实例状态（只读，不落库）。
 *  - 防重入：busy 非 null 期间所有动作按钮禁用。
 */
import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"
import { describeSyncReason } from "@/features/account-manager/model/browser-interop"
import { translateError } from "@/lib/tauri/errors"
import type {
  BrowserDailySyncOutcome,
  BrowserOpenOutcome,
  BrowserOptionDto,
  BrowserStatusOutcome,
  StationAccount,
} from "@/lib/tauri/types/account-manager"

/** 同步目标：Bench 隔离实例 / 用户日常浏览器。 */
export type BrowserInteropTarget = "isolated" | "daily"

/** 当前进行中的动作（用于防重入与按钮禁用）。 */
export type BrowserInteropBusy = "open" | "close" | null

export function useBrowserInterop() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [account, setAccount] = useState<StationAccount | null>(null)
  const [browsers, setBrowsers] = useState<BrowserOptionDto[]>([])
  const [browserId, setBrowserId] = useState<string | null>(null)
  const [status, setStatus] = useState<BrowserStatusOutcome | null>(null)
  const [target, setTarget] = useState<BrowserInteropTarget>("isolated")
  const [busy, setBusy] = useState<BrowserInteropBusy>(null)
  /**
   * 防重入的权威判据。React 的 state 更新是异步的，同一 tick 内的重复调用
   * （快速双击、同一事件里连点）读到的 busy 仍是旧值，因此改用 ref 同步置位：
   * state 只负责禁用 UI，ref 负责拦截。两者始终同步更新。
   */
  const busyRef = useRef<BrowserInteropBusy>(null)
  /** 最近一次「同步到隔离实例」的结果：用于在弹窗内交代到底注入了什么，而不是只弹一个 toast。 */
  const [lastOpen, setLastOpen] = useState<BrowserOpenOutcome | null>(null)
  /** 最近一次「同步到日常浏览器」的结果。 */
  const [lastDaily, setLastDaily] = useState<BrowserDailySyncOutcome | null>(null)

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

  /** 补采失败原因 → 人话（用于「Bench 里没有登录态」这条提示的括号内说明）。 */
  const describeReason = useCallback((reason?: string | null) => describeSyncReason(t, reason), [t])

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

  /** 同步到隔离实例：打开（或复用）该账号的浏览器实例并注入会话。 */
  const syncToIsolated = useCallback(
    (accountId: string) =>
      accountManagerUseCases
        .openBrowserSession(accountId, {
          browserId,
          injectSession: true,
          resetProfile: false,
        })
        .then((outcome) => {
          setLastOpen(outcome)
          if (!outcome.hasStoredSession) {
            // Bench 内置档案里也没有登录态 —— 这才需要用户先去登录。
            toast.warning(
              t("accountManager.toasts.browserNoStoredSession", {
                reason: describeReason(outcome.recoveryReason),
              }),
            )
          } else if (outcome.injectedCookies === 0) {
            toast.error(
              t("accountManager.toasts.browserNothingInjected", {
                skipped: outcome.skippedPartitioned,
                rejected: outcome.rejectedCookies,
              }),
            )
          } else if (outcome.sessionRecovered) {
            toast.success(
              t("accountManager.toasts.browserSessionRecovered", {
                count: outcome.injectedCookies,
                origins: outcome.storageOrigins,
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
          return refreshStatus(accountId)
        }),
    [browserId, describeReason, refreshStatus, t],
  )

  /** 同步到日常浏览器：确保会话就绪 + 在所选浏览器打开站点（写入由扩展完成）。 */
  const syncToDaily = useCallback(
    (accountId: string) =>
      accountManagerUseCases.syncToDailyBrowser(accountId, { browserId }).then((outcome) => {
        setLastDaily(outcome)
        if (outcome.outcome === "noSession") {
          toast.warning(
            t("accountManager.toasts.browserNoStoredSession", {
              reason: describeReason(outcome.recoveryReason),
            }),
          )
        } else if (outcome.sessionRecovered) {
          toast.success(
            t("accountManager.toasts.browserDailyRecovered", {
              count: outcome.cookieCount,
              origins: outcome.storageOrigins,
            }),
          )
        } else {
          toast.success(
            t("accountManager.toasts.browserDailyReady", {
              count: outcome.cookieCount,
              origins: outcome.storageOrigins,
            }),
          )
        }
      }),
    [browserId, describeReason, t],
  )

  /** 按所选目标同步登录态。 */
  const handleSync = useCallback(() => {
    if (!account) return
    if (!begin("open")) return
    setLastOpen(null)
    setLastDaily(null)
    const run = target === "daily" ? syncToDaily(account.id) : syncToIsolated(account.id)
    run
      .catch((error) => {
        toast.error(translateError(t, error, t("accountManager.toasts.browserOpenFailed")))
      })
      .finally(end)
  }, [account, begin, end, syncToDaily, syncToIsolated, t, target])

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

  return {
    open,
    account,
    browsers,
    browserId,
    status,
    target,
    busy,
    lastOpen,
    lastDaily,
    setBrowserId,
    setTarget,
    openDialog,
    closeDialog,
    handleSync,
    handleCloseInstance,
  }
}
