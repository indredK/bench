import {
  Cpu,
  MemoryStick,
  HardDrive,
  CircuitBoard,
  Monitor,
  Plug,
  Box,
  Wind,
  Network,
  Smartphone,
  Camera,
  Telescope,
} from "lucide-react";
import HardwareCompare from "@/components/hardware/HardwareCompare";
import CompareTabs, { type CompareTabItem } from "@/features/compare/CompareTabs";
import { cpuModule } from "@/data/cpu";
import { gpuModule } from "@/data/gpu";
import { memoryModule } from "@/data/memory";
import { ssdModule } from "@/data/ssd";
import { motherboardModule } from "@/data/motherboard";
import { monitorModule } from "@/data/monitor";
import { psuModule } from "@/data/psu";
import { caseModule } from "@/data/case";
import { coolerModule } from "@/data/cooler";
import { switchModule } from "@/data/switch";
import { phoneModule } from "@/data/phone";
import { chipsetModule } from "@/data/phone-chipset";
import { cameraModule } from "@/data/camera";
import { telescopeModule } from "@/data/telescope";

const tabs: CompareTabItem[] = [
  { id: "cpu", i18nPrefix: "cpuCompare", icon: <Cpu size={16} />, content: <HardwareCompare module={cpuModule} /> },
  { id: "gpu", i18nPrefix: "gpuCompare", icon: <Monitor size={16} />, content: <HardwareCompare module={gpuModule} /> },
  { id: "memory", i18nPrefix: "memoryCompare", icon: <MemoryStick size={16} />, content: <HardwareCompare module={memoryModule} /> },
  { id: "ssd", i18nPrefix: "ssdCompare", icon: <HardDrive size={16} />, content: <HardwareCompare module={ssdModule} /> },
  { id: "motherboard", i18nPrefix: "motherboardCompare", icon: <CircuitBoard size={16} />, content: <HardwareCompare module={motherboardModule} /> },
  { id: "monitor", i18nPrefix: "monitorCompare", icon: <Monitor size={16} />, content: <HardwareCompare module={monitorModule} /> },
  { id: "psu", i18nPrefix: "psuCompare", icon: <Plug size={16} />, content: <HardwareCompare module={psuModule} /> },
  { id: "case", i18nPrefix: "caseCompare", icon: <Box size={16} />, content: <HardwareCompare module={caseModule} /> },
  { id: "cooler", i18nPrefix: "coolerCompare", icon: <Wind size={16} />, content: <HardwareCompare module={coolerModule} /> },
  { id: "switch", i18nPrefix: "switchCompare", icon: <Network size={16} />, content: <HardwareCompare module={switchModule} /> },
  { id: "phone", i18nPrefix: "phoneCompare", icon: <Smartphone size={16} />, content: <HardwareCompare module={phoneModule} /> },
  { id: "chipset", i18nPrefix: "phoneChipsetCompare", icon: <Cpu size={16} />, content: <HardwareCompare module={chipsetModule} /> },
  { id: "camera", i18nPrefix: "cameraCompare", icon: <Camera size={16} />, content: <HardwareCompare module={cameraModule} /> },
  { id: "telescope", i18nPrefix: "telescopeCompare", icon: <Telescope size={16} />, content: <HardwareCompare module={telescopeModule} /> },
];

function HardwareComparePage() {
  return <CompareTabs tabs={tabs} defaultTabId="cpu" />;
}

export default HardwareComparePage;
