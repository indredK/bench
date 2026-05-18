import HardwareCompare from "./HardwareCompare";
import { motherboardModule } from "@/data/motherboard";

function MotherboardCompare() {
  return <HardwareCompare module={motherboardModule} />;
}

export default MotherboardCompare;