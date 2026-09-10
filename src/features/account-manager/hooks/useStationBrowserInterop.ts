/**
 * Station-dimension browser interop hook / 站点维度浏览器互通编排。
 *
 * 流程（与账号维度 I1/I2 互为补充）：
 *  1. 用户在账号栏头部点「浏览器互通」→ 弹流程说明确认框（confirm 视图）。
 *  2. 点「开始」→ 以站点维度开一个独立浏览器实例并导航到站点首页。
 *  3. 弹窗进入主视图，轮询 `previewStationBrowserSession` 实时展示浏览器登录态
 *     （cookie 名称 / 计数 / 本地存储 / UA / 指纹命中），并提供「刷新获取」按钮。
 *  4. 点「信息回采」→ 后端关闭实例并采集登录态，落到目标账号（新建或已有）。
 *     写入已有账号且 Bench 已有更新会话时返回 conflict，UI 二次确认后 force 重试。
 *
 * 防重入：busyRef 同步置位，state 仅用于禁用 UI，二者始终一致。
 * 轮询：主视图打开期间按 `PREVIEW_POLL_MS` 拉一次预览；busy 期间暂停；
 *       **实例已停止时立即停表**（不再固定 2s 空转）；关闭/回采后停止。
 *
 * 注意：轮询走的 `previewStationBrowserSession` 是**只读且不打扰用户页面**的
 * （后端 `allow_navigate = false`，且不会为预览新建标签页）。历史上的「浏览器不断
 * 新增同一页面」由后端 `attach_page` 的页面选择策略修复，见
 * `browser_session/cdp.rs::pick_page_target`。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"
import { translateError } from "@/lib/tauri/errors"
import type {
  BrowserOptionDto,
  BrowserSessionPreview,
  BrowserStationCaptureOutcome,
  BrowserStatusOutcome,
  RelayStation,
  StationAccount,
} from "@/lib/tauri/types/account-manager"
import type { BrowserExtensionStatus } from "@/lib/tauri/types/browser-ext"

/** 当前进行中的动作（用于防重入与按钮禁用）。 */
export type StationInteropBusy = "open" | "capture" | "close" | null

/**
 * 预览轮询间隔。取 3s 而非 2s：单次预览要经 CDP 附加页面 + 求值脚本，
 * 更密只增加对浏览器与站点的打扰，不提升可读性。
 */
const PREVIEW_POLL_MS = 3000

export function useStationBrowserInterop(options?: { onCaptured?: () => void }) {
  const { t } = useTranslation()
  const onCaptured = options?.onCaptured

  const [confirming, setConfirming] = useState(false)
  const [station, setStation] = useState<RelayStation | null>(null)
  const [accounts, setAccounts] = useState<StationAccount[]>([])
  const [open, setOpen] = useState(false)
  const [browsers, setBrowsers] = useState<BrowserOptionDto[]>([])
  const [browserId, setBrowserId] = useState<string | null>(null)
  const [status, setStatus] = useState<BrowserStatusOutcome | null>(null)
  const [preview, setPreview] = useState<BrowserSessionPreview | null>(null)
  const [busy, setBusy] = useState<StationInteropBusy>(null)
  const [conflict, setConflict] = useState<BrowserStationCaptureOutcome | null>(null)
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new")
  const [targetAccountId, setTargetAccountId] = useState<string | null>(null)
  const [newUsername, setNewUsername] = useState("")
  /** 扩展通道状态（是否已导出 / NM 是否已注册 / 本地桥是否就绪）。 */
  const [extensionStatus, setExtensionStatus] = useState<BrowserExtensionStatus | null>(null)
  const [extensionBusy, setExtensionBusy] = useState(false)

  const busyRef = useRef<StationInteropBusy>(null)
  const stationIdRef = useRef<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewInFlight = useRef(false)

  const begin = useCallback((kind: Exclude<StationInteropBusy, null>) => {
    if (busyRef.current) return false
    busyRef.current = kind
    setBusy(kind)
    return true
  }, [])

  const end = useCallback(() => {
    busyRef.current = null
    setBusy(null)
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  const refreshStatus = useCallback(async (stationId: string) => {
    try {
      setStatus(await accountManagerUseCases.stationBrowserStatus(stationId))
    } catch {
      // 状态查询失败不阻塞：按「未运行」展示，动作仍可尝试。
      setStatus({ running: false })
    }
  }, [])

  const refreshPreview = useCallback(
    async (stationId: string) => {
      if (previewInFlight.current) return
      previewInFlight.current = true
      try {
        const next = await accountManagerUseCases.previewStationBrowserSession(stationId)
        setPreview(next)
        // 实例已停止 → 立刻停表，避免弹窗开着时无限空转。
        // 重新拉起由 `reopen()` 负责，恢复后会重新 startPolling。
        if (!next.running) stopPolling()
      } catch {
        // 预览失败非致命：保留上一次快照，不中断轮询。
      } finally {
        previewInFlight.current = false
      }
    },
    [stopPolling],
  )

  const startPolling = useCallback(() => {
    if (pollTimer.current) return
    pollTimer.current = setInterval(() => {
      const id = stationIdRef.current
      if (id && busyRef.current === null) void refreshPreview(id)
    }, PREVIEW_POLL_MS)
  }, [refreshPreview])

  /** 刷新扩展通道状态（导出/注册/本地桥）。 */
  const refreshExtensionStatus = useCallback(async () => {
    try {
      setExtensionStatus(await accountManagerUseCases.browserExtensionStatus())
    } catch {
      // 状态查询失败不阻塞主流程：按「未就绪」展示。
      setExtensionStatus(null)
    }
  }, [])

  /** 打开流程确认框，并预拉浏览器列表（确认框内可选浏览器）。 */
  const confirmOpen = useCallback(
    (target: RelayStation, stationAccounts: StationAccount[]) => {
      setStation(target)
      setAccounts(stationAccounts)
      stationIdRef.current = target.id
      setConflict(null)
      setPreview(null)
      setTargetMode("new")
      setTargetAccountId(null)
      setNewUsername("")
      setConfirming(true)
      void (async () => {
        try {
          const list = await accountManagerUseCases.listBrowsers()
          setBrowsers(list)
          setBrowserId((current) => current ?? list[0]?.id ?? null)
        } catch {
          setBrowsers([])
          toast.error(translateError(t, null, t("accountManager.toasts.browserListFailed")))
        }
      })()
      void refreshExtensionStatus()
    },
    [refreshExtensionStatus, t],
  )

  /**
   * 一键导出扩展 + 打开扩展管理页。
   *
   * 为什么要手动一步：Chrome 137 已从正式构建移除 `--load-extension`，而
   * `--remote-debugging-pipe` + `Extensions.loadUnpacked` 会把 `navigator.webdriver`
   * 置为 true 且只对 Bench 新起的实例生效 —— 我们**无法**把扩展自动装进用户
   * 正在使用的日常浏览器。故只能导出到磁盘 + 打开扩展页引导「加载已解压的扩展程序」。
   */
  const handleExportExtension = useCallback(
    async (browserIdOverride?: string | null) => {
      if (extensionBusy) return
      setExtensionBusy(true)
      try {
        await accountManagerUseCases.exportBrowserExtension()
        const target = browserIdOverride ?? browserId ?? browsers[0]?.id ?? null
        if (target) {
          await accountManagerUseCases.openBrowserExtensionsPage(target)
        }
        await refreshExtensionStatus()
        toast.success(t("accountManager.stationInterop.extensionExported"))
      } catch (error) {
        toast.error(
          translateError(t, error, t("accountManager.stationInterop.extensionExportFailed")),
        )
      } finally {
        setExtensionBusy(false)
      }
    },
    [browserId, browsers, extensionBusy, refreshExtensionStatus, t],
  )

  const cancelConfirm = useCallback(() => {
    setConfirming(false)
    setStation(null)
    setAccounts([])
    stationIdRef.current = null
  }, [])

  /** 确认框点「开始」→ 站点维度开浏览器实例 + 进入主视图 + 启动实时预览轮询。 */
  const proceed = useCallback(() => {
    const stationId = stationIdRef.current
    if (!stationId) return
    setConfirming(false)
    setOpen(true)
    void (async () => {
      if (!begin("open")) return
      try {
        await accountManagerUseCases.openStationBrowserSession(stationId, {
          browserId,
          resetProfile: false,
        })
        toast.info(t("accountManager.toasts.stationBrowserOpened"))
      } catch (error) {
        toast.error(translateError(t, error, t("accountManager.toasts.stationBrowserOpenFailed")))
        end()
        return
      }
      end()
      await refreshStatus(stationId)
      await refreshPreview(stationId)
      startPolling()
    })()
  }, [begin, browserId, end, refreshPreview, refreshStatus, startPolling, t])

  const closeDialog = useCallback(() => {
    stopPolling()
    setOpen(false)
    setStation(null)
    setAccounts([])
    setConflict(null)
    stationIdRef.current = null
  }, [stopPolling])

  /** 信息回采：后端关闭实例 + 采集 + 落库（新建或已有账号）。 */
  const handleCapture = useCallback(
    (force = false) => {
      const stationId = stationIdRef.current
      if (!stationId) return
      if (!begin("capture")) return
      accountManagerUseCases
        .captureFromStationBrowser(stationId, {
          targetAccountId: targetMode === "existing" ? targetAccountId : null,
          newUsername: targetMode === "new" ? newUsername.trim() : null,
          newPassword: null,
          force,
        })
        .then((outcome) => {
          if (outcome.outcome === "conflict") {
            setConflict(outcome)
            return
          }
          setConflict(null)
          stopPolling()
          if (outcome.outcome === "empty") {
            toast.info(t("accountManager.toasts.stationCaptureEmpty"))
          } else {
            toast.success(
              t("accountManager.toasts.stationCaptureSaved", {
                count: outcome.cookieCount,
                origins: outcome.storageOrigins,
              }),
            )
            onCaptured?.()
          }
          closeDialog()
        })
        .catch((error) => {
          toast.error(translateError(t, error, t("accountManager.toasts.stationCaptureFailed")))
        })
        .finally(end)
    },
    [begin, closeDialog, end, newUsername, onCaptured, stopPolling, t, targetAccountId, targetMode],
  )

  const handleCloseInstance = useCallback(() => {
    const stationId = stationIdRef.current
    if (!stationId) return
    if (!begin("close")) return
    accountManagerUseCases
      .closeStationBrowserSession(stationId)
      .then(() => refreshStatus(stationId))
      .catch((error) => {
        toast.error(translateError(t, error, t("accountManager.toasts.stationCloseFailed")))
      })
      .finally(end)
  }, [begin, end, refreshStatus, t])

  /** 主视图里实例已关闭时，重新拉起站点实例（不切换弹窗状态）。 */
  const reopen = useCallback(() => {
    const stationId = stationIdRef.current
    if (!stationId) return
    if (!begin("open")) return
    accountManagerUseCases
      .openStationBrowserSession(stationId, { browserId, resetProfile: false })
      .then(() => refreshStatus(stationId))
      .then(() => refreshPreview(stationId))
      .then(() => startPolling())
      .catch((error) => {
        toast.error(translateError(t, error, t("accountManager.toasts.stationBrowserOpenFailed")))
      })
      .finally(end)
  }, [begin, browserId, end, refreshPreview, refreshStatus, startPolling, t])

  // 卸载或关闭时停止轮询，避免游离定时器。
  useEffect(() => {
    if (!open) stopPolling()
  }, [open, stopPolling])
  useEffect(() => stopPolling, [stopPolling])

  return {
    confirming,
    station,
    accounts,
    open,
    browsers,
    browserId,
    status,
    preview,
    busy,
    conflict,
    targetMode,
    targetAccountId,
    newUsername,
    extensionStatus,
    extensionBusy,
    setBrowserId,
    setTargetMode,
    setTargetAccountId,
    setNewUsername,
    confirmOpen,
    cancelConfirm,
    proceed,
    refreshExtensionStatus,
    handleExportExtension,
    refreshPreview: () => {
      const id = stationIdRef.current
      if (id) void refreshPreview(id)
    },
    handleCapture,
    handleCloseInstance,
    reopen,
    closeDialog,
  }
}
