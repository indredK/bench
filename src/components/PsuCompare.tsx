import HardwareCompare from "@/components/HardwareCompare";
import { psuModule } from "@/data/psu";

function PsuCompare() {
  return <HardwareCompare module={psuModule} />;
}

export default PsuCompare;