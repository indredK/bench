import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
} from "lucide-react";
import HardwareCompare from "@/components/HardwareCompare";
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
import type { CompareDataModule } from "@/components/HardwareCompare";
import { Button } from "@/components/ui/button";

interface HardwareTab {
  id: string;
  i18nPrefix: string;
  icon: ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  module: CompareDataModule<any>;
}

function HardwareComparePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("cpu");

  const tabs: HardwareTab[] = [
    { id: "cpu",         i18nPrefix: "cpuCompare",         icon: <Cpu size={16} />,         module: cpuModule },
    { id: "gpu",         i18nPrefix: "gpuCompare",         icon: <Monitor size={16} />,     module: gpuModule },
    { id: "memory",      i18nPrefix: "memoryCompare",      icon: <MemoryStick size={16} />, module: memoryModule },
    { id: "ssd",         i18nPrefix: "ssdCompare",         icon: <HardDrive size={16} />,   module: ssdModule },
    { id: "motherboard", i18nPrefix: "motherboardCompare", icon: <CircuitBoard size={16} />,module: motherboardModule },
    { id: "monitor",     i18nPrefix: "monitorCompare",     icon: <Monitor size={16} />,     module: monitorModule },
    { id: "psu",         i18nPrefix: "psuCompare",         icon: <Plug size={16} />,        module: psuModule },
    { id: "case",        i18nPrefix: "caseCompare",        icon: <Box size={16} />,         module: caseModule },
    { id: "cooler",      i18nPrefix: "coolerCompare",      icon: <Wind size={16} />,        module: coolerModule },
    { id: "switch",      i18nPrefix: "switchCompare",      icon: <Network size={16} />,     module: switchModule },
    { id: "phone",       i18nPrefix: "phoneCompare",       icon: <Smartphone size={16} />,  module: phoneModule },
  ];

  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 mb-4">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Button
              key={tab.id}
              variant={isActive ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {t(`${tab.i18nPrefix}.title`)}
            </Button>
          );
        })}
      </div>

      {/* Compare view */}
      {active && (
        <HardwareCompare
          module={active.module}
        />
      )}
    </div>
  );
}

export default HardwareComparePage;
