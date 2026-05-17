import { Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";
import HardwareCompare from "@/components/HardwareCompare";
import { gpuModule } from "@/data/gpu";

function GpuCompare() {
  const { t } = useTranslation();
  return <HardwareCompare module={gpuModule} title={t("gpuCompare.title")} icon={<Monitor className="size-5" />} />;
}

export default GpuCompare;