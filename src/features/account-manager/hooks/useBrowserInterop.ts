/**
 * Browser interop hook / 账号 ↔ 浏览器互通编排（互通 I1 出向，仅注入）。
 *
 * 收敛说明（站点维度互通上线后）：
 *  - 本 hook / 弹窗只保留「以该账号身份打开（注入会话）」与实例管理（关闭）。
 *  - 「手动登录 + 回采」已整体迁移到站点维度（useStationBrowserInterop），
 *    因此回采 / 冲突 / 只读预检（probe）从此处移除，避免两条并行入口。
 *  - 「清空浏览器数据」于 2026-09-10 移除（账号档案本就是隔离目录，删账号时整体
 *    清理；单按钮收益低于认知成本）。
 *
 * 编排规则：
 *  - 打开弹窗即拉取可用浏览器列表与当前实例状态（只读，不落库）。
 *  - 「以该账号身份打开」= injectSession=true，注入账号会话后导航到站点。
 *  - 防重入：busy 非 null 期间所有动作按钮禁用。
 */
import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"
import { translateError } from "@/lib/tauri/errors"
import type {
  BrowserOpenOutcome,
  BrowserOptionDto,
  BrowserStatusOutcome,
  StationAccount,
} from "@/lib/tauri/types/account-manager"

/** 当前进行中的动作（用于防重入与按钮禁用）。 */
export type BrowserInteropBusy = "open" | "close" | null

export function useBrowserInterop() {
  const { t } = useTranslation()
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
  /** 最近一次「打开」的结果：用于在弹窗内交代到底注入了什么，而不是只弹一个 toast。 */
  const [lastOpen, setLastOpen] = useState<BrowserOpenOutcome | null>(null)

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

  /** 打开（或复用）该账号的浏览器实例并注入会话。 */
  const handleOpen = useCallback(() => {
    if (!account) return
    if (!begin("open")) return
    setLastOpen(null)
    accountManagerUseCases
      .openBrowserSession(account.id, {
        browserId,
        injectSession: true,
        resetProfile: false,
      })
      .then((outcome) => {
        setLastOpen(outcome)
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
  }, [account, begin, browserId, end, refreshStatus, t])

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
    busy,
    lastOpen,
    setBrowserId,
    openDialog,
    closeDialog,
    handleOpen,
    handleCloseInstance,
  }
}
