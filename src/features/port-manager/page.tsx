/**
 * Page View / 页面视图: compose screen only; 只组合页面.
 */
import { useCallback, useState } from "react"
import { Zap } from "lucide-react"
import { RuntimeFeatureGate } from "@/components/common/RuntimeFeatureGate"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { PortManagerPageContent } from "@/features/port-manager/components/PortManagerPageContent"
import { usePortManagerController } from "@/features/port-manager/hooks/usePortManagerController"
import { usePortOccupationAlerts } from "@/features/port-manager/hooks/usePortOccupationAlerts"

type KillConfirmState = { kind: "one"; port: number; pids: number[] } | { kind: "all" } | null

function PortManager({ feature }: { feature?: { desktopOnly?: boolean } }) {
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
          title: controller.t("portManager.confirmKillPortTitle", { port: killConfirm.port }),
          description: controller.t("portManager.confirmKillPortDescription", {
            port: killConfirm.port,
            count: killConfirm.pids.length,
          }),
          consequence: controller.t("portManager.confirmKillPortConsequence"),
        }
      : killConfirm?.kind === "all"
        ? {
            title: controller.t("portManager.confirmKillAllTitle"),
            description: controller.t("portManager.confirmKillAllDescription", {
              count: controller.occupiedCount,
            }),
            consequence: controller.t("portManager.confirmKillAllConsequence"),
          }
        : null

  return (
    <RuntimeFeatureGate
      feature={feature}
      title={controller.t("portManager.title")}
      icon={<Zap size={32} className="opacity-40" />}
    >
      <PortManagerPageContent
        t={controller.t}
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
          confirmLabel={controller.t("portManager.confirmKillAction")}
          cancelLabel={controller.t("common.cancel")}
          onConfirm={handleKillConfirm}
          loading={controller.killing}
        />
      )}
    </RuntimeFeatureGate>
  )
}

export default PortManager
