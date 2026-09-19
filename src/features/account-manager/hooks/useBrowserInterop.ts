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
 *  - 「同步到日常浏览器」是**两段式**的：命令只登记注入任务并打开站点，真正写入
 *    由 Bench Companion 扩展在页面加载完成后认领。因此命令返回时什么都不该宣布，
 *    要按 taskId 轮询注入回执（见 [`watchInject`]）直到终态才报成功/失败。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"
import {
  describeInjectOutcome,
  describeStorageRestore,
  describeSyncReason,
} from "@/features/account-manager/model/browser-interop"
import { translateError } from "@/lib/tauri/errors"
import type {
  BrowserDailySyncOutcome,
  BrowserInjectStatus,
  BrowserOpenOutcome,
  BrowserOptionDto,
  BrowserStatusOutcome,
  ChromeStoreAvailability,
  StationAccount,
} from "@/lib/tauri/types/account-manager"

/** 同步目标：Bench 隔离实例 / 用户日常浏览器。 */
export type BrowserInteropTarget = "isolated" | "daily"

/** 当前进行中的动作（用于防重入与按钮禁用）。 */
export type BrowserInteropBusy = "open" | "close" | null

/** 注入回执轮询节奏。扩展由页面加载完成事件唤醒，正常 1–3 秒内领取任务。 */
const INJECT_POLL_MS = 1500
/** 轮询上限。超过即认定这一单不会来了，必须给用户一个交代而不是无限转圈。 */
const INJECT_POLL_LIMIT_MS = 45_000

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
  /** 「同步到日常浏览器」的注入回执（扩展回报的真实终态）。 */
  const [lastInject, setLastInject] = useState<BrowserInjectStatus | null>(null)
  /**
   * 轮询的存活代数：关窗 / 重新同步 / 卸载都会推进它，正在飞的这一次轮询发现
   * 代数变了就自行停手。用代数而不是布尔标志，是因为 `await` 之后布尔值可能被
   * 后启动的那一轮覆盖成 true，从而让上一轮复活。
   */
  const pollGeneration = useRef(0)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 兜底通道（直读本机 Chrome）在本机是否可用；null = 未知/不可用。 */
  const [chromeStore, setChromeStore] = useState<ChromeStoreAvailability | null>(null)

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
        // 兜底通道可用性探测（纯本地文件与钥匙串条目检查，不弹窗、不读 cookie）。
        // 失败按「不可用」处理：入口不显示，比显示了一个点了就错的按钮好。
        try {
          setChromeStore(await accountManagerUseCases.chromeStoreStatus())
        } catch {
          setChromeStore(null)
        }
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
          } else if (outcome.recoveryReason === "staleSession") {
            // 会话数据存在但已失效（补采时探针判定未登录）：注入的是过期数据。
            toast.warning(t("accountManager.toasts.browserStaleSession"), { duration: 10000 })
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
          // cookie 注入成功 ≠ 站点认了这个会话：IndexedDB 没恢复完时页面读到的
          // 仍是空库。终态必须单独说一句，否则「报成功、打开还是未登录」。
          const restoreWarning = describeStorageRestore(t, outcome.storageRestoreStatus)
          if (restoreWarning) {
            toast.warning(restoreWarning, { duration: 12000 })
          }
          return refreshStatus(accountId)
        }),
    [browserId, describeReason, refreshStatus, t],
  )

  /** 中止在跑的注入回执轮询。 */
  const stopInjectWatch = useCallback(() => {
    pollGeneration.current += 1
    if (pollTimer.current) {
      clearTimeout(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  // 关窗或组件卸载即停轮询：用户已经不看这一单了，迟到的 toast 只会像幽灵提示。
  useEffect(() => {
    if (!open) stopInjectWatch()
    return stopInjectWatch
  }, [open, stopInjectWatch])

  /** 把注入终态讲清楚：成功要报出写进去多少，失败要说卡在哪一环。 */
  const reportInject = useCallback(
    (status: BrowserInjectStatus, expectedStorageOrigins: number) => {
      const message = describeInjectOutcome(t, status)
      if (status.outcome === "injected") {
        toast.success(message)
        if (status.cookiesFailed > 0 || status.idbFailed > 0) {
          toast.warning(
            t("accountManager.toasts.browserInjectPartial", {
              cookies: status.cookiesFailed,
              idb: status.idbFailed,
            }),
            { duration: 10000 },
          )
        }
        // 账号登录态里有存储、这次一条都没写进去：多半是站点没授权或扩展过旧。
        // 早先这里是「只要 storageOrigins>0 就提示已跳过」，把写成功也说成跳过。
        if (
          expectedStorageOrigins > 0 &&
          status.storageKeysWritten === 0 &&
          status.idbRestored === 0
        ) {
          toast.warning(
            t("accountManager.toasts.browserInjectStorageMissing", {
              origins: expectedStorageOrigins,
            }),
            { duration: 10000 },
          )
        }
        return
      }
      toast.error(message, { duration: 10000 })
    },
    [t],
  )

  /**
   * 按 taskId 轮询注入回执直到终态。
   *
   * 为什么必须轮：扩展是连接发起方，Bench 既叫不动它也没有回执通道，同步命令
   * 返回的那一刻写入尚未发生。此前命令直接回 `ready` + cookie 条数，前端就据此
   * 弹「会话已就绪」——扩展没装、站点没授权、注入到一半 Service Worker 被回收，
   * 用户读到的都是同一句成功。
   */
  const watchInject = useCallback(
    (taskId: string, expectedStorageOrigins: number) => {
      stopInjectWatch()
      const generation = pollGeneration.current
      const startedAt = Date.now()
      const tick = () => {
        if (pollGeneration.current !== generation) return
        accountManagerUseCases
          .injectStatus(taskId)
          .then((status) => {
            if (pollGeneration.current !== generation) return
            setLastInject(status)
            if (status.outcome === "queued" || status.outcome === "claimed") {
              if (Date.now() - startedAt >= INJECT_POLL_LIMIT_MS) {
                // 到点仍非终态：区分「扩展压根没联系 Bench」与「联系了但这单没走完」，
                // 两者的用户动作完全不同（装/启用扩展 vs 回浏览器看页面与授权）。
                toast.warning(
                  t(
                    status.extensionConnected
                      ? "accountManager.toasts.browserInjectStalled"
                      : "accountManager.toasts.browserInjectNoExtension",
                    {
                      seconds: Math.round(INJECT_POLL_LIMIT_MS / 1000),
                      phase: describeInjectOutcome(t, status),
                    },
                  ),
                  { duration: 12000 },
                )
                return
              }
              pollTimer.current = setTimeout(tick, INJECT_POLL_MS)
              return
            }
            reportInject(status, expectedStorageOrigins)
          })
          .catch(() => {
            // 单次查询失败不打断这一单：任务还在 Bench 内存里，下一拍再试。
            if (pollGeneration.current !== generation) return
            pollTimer.current = setTimeout(tick, INJECT_POLL_MS)
          })
      }
      // 先立刻读一次：让弹窗的状态行马上从「等待扩展」开始滚动，而不是空一拍。
      tick()
    },
    [reportInject, stopInjectWatch, t],
  )

  /** 同步到日常浏览器：确保会话就绪 + 在所选浏览器打开站点，再等扩展回报结果。 */
  const syncToDaily = useCallback(
    (accountId: string) =>
      accountManagerUseCases.syncToDailyBrowser(accountId, { browserId }).then((outcome) => {
        setLastDaily(outcome)
        setLastInject(null)
        if (outcome.outcome === "noSession") {
          toast.warning(
            t("accountManager.toasts.browserNoStoredSession", {
              reason: describeReason(outcome.recoveryReason),
            }),
          )
          return
        }
        if (outcome.recoveryReason === "staleSession") {
          // 会话数据存在但已失效（补采时探针判定未登录）：注入的是过期数据。
          toast.warning(t("accountManager.toasts.browserStaleSession"), { duration: 10000 })
        }
        if (!outcome.taskId) {
          // 后端没给任务 id 就没有回执可等，只能如实说「已打开站点」。
          toast.info(t("accountManager.toasts.browserDailyOpened", { count: outcome.cookieCount }))
          return
        }
        toast.info(
          t(
            outcome.sessionRecovered
              ? "accountManager.toasts.browserDailyQueuedRecovered"
              : "accountManager.toasts.browserDailyQueued",
            {
              count: outcome.cookieCount,
              origins: outcome.storageOrigins,
            },
          ),
        )
        watchInject(outcome.taskId, outcome.storageOrigins)
      }),
    [browserId, describeReason, t, watchInject],
  )

  /**
   * 兜底入向：直读本机 Chrome 的落盘 cookie 导入该账号（不装扩展）。
   *
   * 与出向同步不同，这条命令是**同步完成**的（读库 + 解密 + 落库都在后端一次走完），
   * 所以不需要轮询回执。首次使用会弹一次 macOS 钥匙串授权。
   */
  const handleImportFromChrome = useCallback(() => {
    if (!account) return
    if (!begin("open")) return
    setLastOpen(null)
    setLastDaily(null)
    setLastInject(null)
    accountManagerUseCases
      .importFromChrome(account.id)
      .then(async (outcome) => {
        if (outcome.outcome === "conflict") {
          // 不静默覆盖：Bench 已有不早于本次的会话，覆盖是危险操作，本入口
          // 不提供 force —— 要覆盖请用扩展回采或在 Bench 里重新登录。
          toast.warning(t("accountManager.toasts.browserChromeImportConflict"), {
            duration: 12000,
          })
        } else if (outcome.outcome === "empty") {
          toast.warning(t("accountManager.toasts.browserChromeImportEmpty"), { duration: 12000 })
        } else {
          toast.success(
            t("accountManager.toasts.browserChromeImported", { count: outcome.cookieCount }),
          )
        }
        return refreshStatus(account.id)
      })
      .catch((error) => {
        toast.error(
          translateError(t, error, t("accountManager.toasts.browserChromeImportFailed")),
          { duration: 12000 },
        )
      })
      .finally(end)
  }, [account, begin, end, refreshStatus, t])

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
    lastInject,
    chromeStore,
    setBrowserId,
    setTarget,
    openDialog,
    closeDialog,
    handleSync,
    handleImportFromChrome,
    handleCloseInstance,
  }
}
