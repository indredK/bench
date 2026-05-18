import HardwareCompare from "@/components/HardwareCompare";
import { cpuModule } from "@/data/cpu";

function CpuCompare() {
  return <HardwareCompare module={cpuModule} />;
}

export default CpuCompare;