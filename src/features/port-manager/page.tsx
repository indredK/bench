import { Zap } from "lucide-react";
import { DesktopOnly } from "@/components/common/DesktopOnly";
import { PortManagerPageContent } from "@/features/port-manager/components/PortManagerPageContent";
import { usePortManagerController } from "@/features/port-manager/hooks/usePortManagerController";

function PortManager() {
  const controller = usePortManagerController();

  if (!controller.isTauriEnv) {
    return <DesktopOnly title={controller.t("portManager.title")} icon={<Zap size={32} className="opacity-40" />} />;
  }

  return (
    <PortManagerPageContent
      t={controller.t}
      inputRef={controller.inputRef}
      scrollContentRef={controller.scrollContentRef}
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
      onInputChange={controller.handleInputChange}
      onInputKeyDown={controller.handleInputKeyDown}
      onScan={controller.handleScan}
      onClearInput={controller.handleClearInput}
      onClearAll={controller.clearAll}
      onAddCommonPort={controller.addCommonPort}
      onToggleShowEmptyPorts={() => controller.setShowEmptyPorts(!controller.showEmptyPorts)}
      onRescanAll={controller.rescanAll}
      onRescanPort={controller.handleRescanPort}
      onKillAll={controller.handleKillAll}
      onScrollToPort={controller.scrollToPort}
      onKillPort={controller.handleKillPort}
      onRemovePort={controller.removePort}
      onSetError={controller.setError}
      statusIconFor={controller.statusIconFor}
    />
  );
}

export default PortManager;
