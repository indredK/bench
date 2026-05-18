import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Smartphone, Cpu } from "lucide-react";
import HardwareCompare from "@/components/HardwareCompare";
import { phoneModule } from "@/data/phone";
import { chipsetModule } from "@/data/phone-chipset";
import type { CompareDataModule } from "@/components/HardwareCompare";
import { Button } from "@/components/ui/button";

interface PhoneTab {
  id: string;
  i18nPrefix: string;
  icon: ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  module: CompareDataModule<any>;
}

function PhoneComparePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("phone");

  const tabs: PhoneTab[] = [
    { id: "phone",   i18nPrefix: "phoneCompare",         icon: <Smartphone size={16} />, module: phoneModule },
    { id: "chipset", i18nPrefix: "phoneChipsetCompare",   icon: <Cpu size={16} />,       module: chipsetModule },
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
      {active && <HardwareCompare module={active.module} />}
    </div>
  );
}

export default PhoneComparePage;
