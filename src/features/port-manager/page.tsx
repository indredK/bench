/**
 * Page View / 页面视图: compose screen only; 只组合页面.
 */
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { Zap } from "lucide-react"
import { RuntimeFeatureGate } from "@/components/common/RuntimeFeatureGate"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { PortManagerPageContent } from "@/features/port-manager/components/PortManagerPageContent"
import { usePortManagerController } from "@/features/port-manager/hooks/usePortManagerController"
import { usePortOccupationAlerts } from "@/features/port-manager/hooks/usePortOccupationAlerts"

type KillConfirmState = { kind: "one"; port: number; pids: number[] } | { kind: "all" } | null

function PortManager({ feature }: { feature?: { desktopOnly?: boolean } }) {
  const { t } = useTranslation()
  const controller = usePortManagerController()
  const [killConfirm, setKillConfirm] = useState<KillConfirmState>(null)

  usePortOccupationAlerts()

  const closeKillConfirm = useCallback(() => setKillConfirm(null), [])

  const handleKillPortRequest = useCallback((port: number, pids: number[]) => {
    setKillConfirm({ kind: "one", port, pids })
  }, [])

  const handleKillAllRequest = useCallback(() => {
    setKillConfirm({ kind: "all" })
  }, [])

  const handleKillConfirm = useCallback(async () => {
    if (!killConfirm) return
    if (killConfirm.kind === "one") {
      await controller.killPort(killConfirm.port, killConfirm.pids)
    } else {
      await controller.killAll()
    }
    setKillConfirm(null)
  }, [controller, killConfirm])

  const killDialogProps =
    killConfirm?.kind === "one"
      ? {
          title: t("portManager.confirmKillPortTitle", { port: killConfirm.port }),
          description: t("portManager.confirmKillPortDescription", {
            port: killConfirm.port,
            count: killConfirm.pids.length,
          }),
          consequence: t("portManager.confirmKillPortConsequence"),
        }
      : killConfirm?.kind === "all"
        ? {
            title: t("portManager.confirmKillAllTitle"),
            description: t("portManager.confirmKillAllDescription", {
              count: controller.occupiedCount,
            }),
            consequence: t("portManager.confirmKillAllConsequence"),
          }
        : null

  return (
    <RuntimeFeatureGate
      feature={feature}
      title={t("portManager.title")}
      icon={<Zap size={32} className="opacity-40" />}
    >
      <PortManagerPageContent
        inputRef={controller.inputRef}
        scrollContainerRef={controller.scrollContainerRef}
        rowVirtualizer={controller.rowVirtualizer}
        portHistory={controller.portHistory}
        inputValue={controller.inputValue}
        showInvalidToast={controller.showInvalidToast}
        inputError={controller.inputError}
        portStates={controller.portStates}
        portDetails={controller.portDetails}
        portKillMessages={controller.portKillMessages}
        error={controller.error}
        killing={controller.killing}
        isScanning={controller.isScanning}
        showEmptyPorts={controller.showEmptyPorts}
        highlightPort={controller.highlightPort}
        occupiedCount={controller.occupiedCount}
        displayedDetails={controller.displayedDetails}
        scanMode={controller.scanMode}
        remoteHost={controller.remoteHost}
        alertsEnabled={controller.alertsEnabled}
        onScanModeChange={controller.setScanMode}
        onRemoteHostChange={controller.handleRemoteHostChange}
        onToggleAlerts={controller.handleToggleAlerts}
        onInputChange={controller.handleInputChange}
        onInputKeyDown={controller.handleInputKeyDown}
        onScan={controller.handleScan}
        onClearInput={controller.handleClearInput}
        onClearAll={controller.clearAll}
        onAddCommonPort={controller.addCommonPort}
        onToggleShowEmptyPorts={() => controller.setShowEmptyPorts(!controller.showEmptyPorts)}
        onRescanAll={controller.rescanAll}
        onRescanPort={controller.handleRescanPort}
        onKillAll={handleKillAllRequest}
        onScrollToPort={controller.scrollToPort}
        onKillPort={handleKillPortRequest}
        onRemovePort={controller.removePort}
        onClearError={controller.clearError}
        statusIconFor={controller.statusIconFor}
      />

      {killDialogProps && (
        <DestructiveConfirmDialog
          open={killConfirm !== null}
          onOpenChange={(open) => {
            if (!open) closeKillConfirm()
          }}
          title={killDialogProps.title}
          description={killDialogProps.description}
          consequence={killDialogProps.consequence}
          confirmLabel={t("portManager.confirmKillAction")}
          cancelLabel={t("common.cancel")}
          onConfirm={handleKillConfirm}
          loading={controller.killing}
        />
      )}
    </RuntimeFeatureGate>
  )
}

export default PortManager
