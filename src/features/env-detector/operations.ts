/**
 * Operation / 操作层: legacy orchestration; 临时承载流程编排.
 */
import { envDetectorUseCases } from "@/features/env-detector/services/env-detector.use-cases";
import { useEnvDetectorStore } from "@/features/env-detector/store";

export const envDetectorOperations = {
  async loadTools() {
    const { scanning } = useEnvDetectorStore.getState();
    if (scanning) return;

    useEnvDetectorStore.setState({ loading: true, scanning: true, error: "", tools: [] });

    if (!envDetectorUseCases.isAvailable()) {
      useEnvDetectorStore.setState({ scanned: true, loading: false, scanning: false });
      return;
    }

    try {
      const payload = await envDetectorUseCases.scanEnvTools();
      useEnvDetectorStore.setState({
        tools: [...payload.tools, ...payload.unavailable],
        loading: false,
        scanning: false,
        scanned: true,
      });
    } catch (error) {
      console.warn("[EnvDetector] Failed to detect tools:", error);
      useEnvDetectorStore.setState({
        tools: [],
        error: "Failed to detect tools",
        loading: false,
        scanning: false,
        scanned: true,
      });
    }
  },
};
