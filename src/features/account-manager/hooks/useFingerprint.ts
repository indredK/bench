/**
 * Fingerprint hooks / 登录指纹编排 (F2):
 *   采集 → 打开确认弹窗(展示特征计数+佐证) → 用户确认 → 标记 Ready + 自动刷新该站点。
 * 防重入使用 useGuardedAsync;错误统一走 region error / toast。
 */
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"
import { makeRegionError } from "@/features/account-manager/errors"
import { useAccountManagerStore } from "@/features/account-manager/store"
import { useGuardedAsync } from "@/hooks/useGuardedAsync"
import { translateError } from "@/lib/tauri/errors"

export function useFingerprint({ loadInitialData }: { loadInitialData: () => Promise<void> }) {
  const { t } = useTranslation()
  const { pending: capturingFingerprint, run: runCapture } = useGuardedAsync()
  const { pending: confirmingFingerprint, run: runConfirm } = useGuardedAsync()

  /** F2.采集:站点 + 采样账号 → 后端采集(顺带刷新 authProfile)→ 打开确认弹窗。 */
  function handleCaptureFingerprint(stationId: string, accountId: string) {
    return runCapture(async () => {
      const s = useAccountManagerStore.getState()
      try {
        const summary = await accountManagerUseCases.captureLoginFingerprint(stationId, accountId)
        s.setFingerprintSummary(summary)
        s.setFingerprintTarget({ stationId, accountId })
        s.setFingerprintConfirmOpen(true)
        // 刷新站点列表以获得 authProfile / loginFingerprint 摘要的最新状态。
        await loadInitialData()
      } catch (error) {
        useAccountManagerStore.getState().setRegionError(
          "detail",
          makeRegionError(error, "accountManager.errors.fingerprintCapture", {
            retry: () => handleCaptureFingerprint(stationId, accountId),
          }),
        )
      }
    })
  }

  /** F2.确认:用户显式将当前账号识别为站点活跃状态 → 标记 Ready → 自动刷新该站点全部账号。 */
  function handleConfirmFingerprint() {
    return runConfirm(async () => {
      const s = useAccountManagerStore.getState()
      const target = s.fingerprintTarget
      if (!target) return
      try {
        const updated = await accountManagerUseCases.confirmLoginFingerprint(
          target.stationId,
          target.accountId,
        )
        s.setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
        s.setFingerprintConfirmOpen(false)
        s.setFingerprintSummary(null)
        s.setFingerprintTarget(null)
        toast.success(t("accountManager.toasts.fingerprintConfirmed"))
        // 确认后自动刷新:同站其它账号按 L0 预检判定 —— 指纹缺失者确定性判未登录。
        const report = await accountManagerUseCases.refreshStation(target.stationId)
        const byId = new Map(report.succeeded.map((a) => [a.id, a] as const))
        useAccountManagerStore
          .getState()
          .setAccounts((prev) => prev.map((a) => byId.get(a.id) ?? a))
        if (report.failed.length > 0) {
          useAccountManagerStore.getState().setRegionError(
            "account",
            makeRegionError(
              { code: "PARTIAL_REFRESH", message: "" },
              "accountManager.errors.partialRefresh",
              {
                values: { failed: report.failed.length, total: report.total },
                retry: () => handleConfirmFingerprint(),
              },
            ),
          )
        }
      } catch (error) {
        toast.error(translateError(t, error, t("accountManager.toasts.fingerprintConfirmFailed")))
      }
    })
  }

  return {
    capturingFingerprint,
    confirmingFingerprint,
    handleCaptureFingerprint,
    handleConfirmFingerprint,
  }
}
