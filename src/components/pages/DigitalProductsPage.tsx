import { Smartphone, Cpu, Camera, Telescope } from "lucide-react";
import HardwareCompare from "@/components/hardware/HardwareCompare";
import CompareTabs, { type CompareTabItem } from "@/features/compare/CompareTabs";
import { phoneModule } from "@/data/phone";
import { chipsetModule } from "@/data/phone-chipset";
import { cameraModule } from "@/data/camera";
import { telescopeModule } from "@/data/telescope";

const tabs: CompareTabItem[] = [
  { id: "phone", i18nPrefix: "phoneCompare", icon: <Smartphone size={16} />, content: <HardwareCompare module={phoneModule} /> },
  { id: "chipset", i18nPrefix: "phoneChipsetCompare", icon: <Cpu size={16} />, content: <HardwareCompare module={chipsetModule} /> },
  { id: "camera", i18nPrefix: "cameraCompare", icon: <Camera size={16} />, content: <HardwareCompare module={cameraModule} /> },
  { id: "telescope", i18nPrefix: "telescopeCompare", icon: <Telescope size={16} />, content: <HardwareCompare module={telescopeModule} /> },
];

function DigitalProductsPage() {
  return <CompareTabs tabs={tabs} defaultTabId="phone" />;
}

export default DigitalProductsPage;
