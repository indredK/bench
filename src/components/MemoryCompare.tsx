import HardwareCompare from "@/components/HardwareCompare";
import { memoryModule } from "@/data/memory";

function MemoryCompare() {
  return <HardwareCompare module={memoryModule} />;
}

export default MemoryCompare;