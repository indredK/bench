import { MemoryStick } from "lucide-react";
import { useTranslation } from "react-i18next";
import HardwareCompare from "@/components/HardwareCompare";
import { memoryModule } from "@/data/memory";

function MemoryCompare() {
  const { t } = useTranslation();
  return <HardwareCompare module={memoryModule} title={t("memoryCompare.title")} icon={<MemoryStick className="size-5" />} />;
}

export default MemoryCompare;