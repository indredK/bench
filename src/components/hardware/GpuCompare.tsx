import HardwareCompare from "./HardwareCompare";
import { gpuModule } from "@/data/gpu";

function GpuCompare() {
  return <HardwareCompare module={gpuModule} />;
}

export default GpuCompare;