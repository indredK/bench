import { Smartphone, Cpu } from "lucide-react";
import HardwareCompare from "@/components/hardware/HardwareCompare";
import CompareTabs, { type CompareTabItem } from "@/features/compare/CompareTabs";
import { phoneModule } from "@/data/phone";
import { chipsetModule } from "@/data/phone-chipset";

const tabs: CompareTabItem[] = [
  { id: "phone", i18nPrefix: "phoneCompare", icon: <Smartphone size={16} />, content: <HardwareCompare module={phoneModule} /> },
  { id: "chipset", i18nPrefix: "phoneChipsetCompare", icon: <Cpu size={16} />, content: <HardwareCompare module={chipsetModule} /> },
];

function PhoneComparePage() {
  return <CompareTabs tabs={tabs} defaultTabId="phone" />;
}

export default PhoneComparePage;
