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

export function useFingerprint({
  refreshStation,
}: {
  /** 站点刷新入口(复用刷新编排,自带 loading 状态)。确认后据此刷新全组账号。 */
  refreshStation: (stationId: string) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const { pending: capturingFingerprint, run: runCapture } = useGuardedAsync()
  const { pending: confirmingFingerprint, run: runConfirm } = useGuardedAsync()

  /** F2.采集:点击后立即弹窗(后台采样),采样完成更新摘要与站点画像。 */
  function handleCaptureFingerprint(stationId: string, accountId: string) {
    return runCapture(async () => {
      const s = useAccountManagerStore.getState()
      // 先弹窗:用户点击即获得反馈,弹窗内展示「采样中」,避免等窗口加载才响应。
      s.setFingerprintTarget({ stationId, accountId })
      s.setFingerprintSummary(null)
      s.setFingerprintConfirmOpen(true)
      try {
        const result = await accountManagerUseCases.captureLoginFingerprint(stationId, accountId)
        const summary = result.summary
        // 本地 patch 站点指纹摘要与 authProfile(不重载全量数据,避免选中项被 applyInitialSelection 重置)。
        s.setStations((prev) =>
          prev.map((station) =>
            station.id === stationId
              ? {
                  ...station,
                  authProfile: result.profile,
                  loginFingerprint: {
                    sampledAt: summary.sampledAt,
                    sampledByAccount: accountId,
                    cookieCount: summary.cookieCount,
                    storageKeyCount: summary.storageKeyCount,
                  },
                }
              : station,
          ),
        )
        s.setFingerprintSummary(summary)
      } catch (error) {
        // 采样失败:关闭弹窗并给出区域错误。
        const current = useAccountManagerStore.getState()
        current.setFingerprintConfirmOpen(false)
        current.setFingerprintTarget(null)
        current.setFingerprintSummary(null)
        current.setRegionError(
          "detail",
          makeRegionError(error, "accountManager.errors.fingerprintCapture", {
            retry: () => handleCaptureFingerprint(stationId, accountId),
          }),
        )
      }
    })
  }

  /** F2.确认:用户显式将当前账号识别为站点活跃状态 → 标记 Ready → 刷新该站点全部账号。 */
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
        s.setFingerprintConfirmOpen(false)
        s.setFingerprintSummary(null)
        s.setFingerprintTarget(null)
        toast.success(t("accountManager.toasts.fingerprintConfirmed"))
        // 根据用户的确定,刷新该站点全部账号(刷新按钮进入 loading 态)。
        // 目标账号保持 Ready(用 updated 覆盖刷新结果),其余账号按指纹判定。
        await refreshStation(target.stationId)
        useAccountManagerStore
          .getState()
          .setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
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
