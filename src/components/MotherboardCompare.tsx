import HardwareCompare from "@/components/HardwareCompare";
import { motherboardModule } from "@/data/motherboard";

function MotherboardCompare() {
  return <HardwareCompare module={motherboardModule} />;
}

export default MotherboardCompare;