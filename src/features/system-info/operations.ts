/**
 * Operation / 操作层: legacy orchestration; 临时承载流程编排.
 */
import { systemInfoUseCases } from "@/features/system-info/services/system-info.use-cases";
import { useSystemInfoStore } from "@/features/system-info/store";

export const systemInfoOperations = {
  async loadSystemInfo() {
    useSystemInfoStore.setState({ loading: true, error: "" });
    try {
      const info = await systemInfoUseCases.loadSystemInfo();
      useSystemInfoStore.setState({ systemInfo: info, loading: false, fetched: true });
    } catch (error) {
      useSystemInfoStore.setState({
        error: typeof error === "string" ? error : "Failed to load system info",
        loading: false,
        fetched: true,
      });
    }
  },
};
