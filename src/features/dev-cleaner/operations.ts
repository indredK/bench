import { devCleanerUseCases } from "@/features/dev-cleaner/services/dev-cleaner.use-cases";
import { useDevCleanerStore } from "@/features/dev-cleaner/store";

export const devCleanerOperations = {
  async selectPath() {
    try {
      const selected = await devCleanerUseCases.selectDirectory();
      if (selected && typeof selected === "string") {
        useDevCleanerStore.setState({ selectedPath: selected });
      }
    } catch (error) {
      alert(`Failed to open directory dialog: ${error}`);
    }
  },

  async scan() {
    const { selectedPath } = useDevCleanerStore.getState();
    if (!selectedPath) return;

    useDevCleanerStore.setState({ isScanning: true, showConfirm: false, showFilterOptions: true });

    if (!devCleanerUseCases.isAvailable()) {
      useDevCleanerStore.setState({
        cleanupMessage: {
          type: "error",
          text: "Scanning is only available in the desktop app",
        },
        isScanning: false,
      });
      return;
    }

    try {
      const result = await devCleanerUseCases.scanProjects(selectedPath);
      useDevCleanerStore.setState({
        scanResult: result,
        selectedProjects: {},
        isScanning: false,
        cleanupMessage: devCleanerUseCases.createScanStoppedMessage(result),
      });
    } catch (error) {
      useDevCleanerStore.setState({
        cleanupMessage: {
          type: "error",
          text: `Scan failed: ${error}`,
        },
        isScanning: false,
      });
    }
  },

  async stopScan() {
    try {
      await devCleanerUseCases.stopScan();
    } catch (error) {
      console.error("Failed to stop scan:", error);
    }
  },

  async cleanup() {
    const { selectedProjects, scanResult } = useDevCleanerStore.getState();
    const selectedCount = Object.values(selectedProjects).filter(Boolean).length;
    if (selectedCount === 0) return;

    useDevCleanerStore.setState({ showConfirm: false, isCleaningUp: true, cleanupMessage: null });

    try {
      const projectsToCleanup = devCleanerUseCases.getSelectedProjects(scanResult, selectedProjects);
      const result = await devCleanerUseCases.cleanupProjects(projectsToCleanup);

      if (result.success) {
        useDevCleanerStore.setState({
          cleanupMessage: { type: "success", text: `Cleaned up ${result.cleaned_size} bytes` },
          selectedProjects: {},
        });
        setTimeout(() => {
          void devCleanerOperations.scan();
        }, 1000);
      } else {
        useDevCleanerStore.setState({
          cleanupMessage: {
            type: "error",
            text: result.errors?.join(", ") || "Unknown error",
          },
        });
      }
    } catch (error) {
      useDevCleanerStore.setState({
        cleanupMessage: { type: "error", text: `Cleanup failed: ${error}` },
      });
    } finally {
      useDevCleanerStore.setState({ isCleaningUp: false });
    }
  },
};
