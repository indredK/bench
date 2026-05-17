import { Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";
import HardwareCompare from "@/components/HardwareCompare";
import { cpuModule } from "@/data/cpu";

function CpuCompare() {
  const { t } = useTranslation();
  return <HardwareCompare module={cpuModule} title={t("cpuCompare.title")} icon={<Cpu className="size-5" />} />;
}

export default CpuCompare;