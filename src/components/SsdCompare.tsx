import { HardDrive } from "lucide-react";
import { useTranslation } from "react-i18next";
import HardwareCompare from "@/components/HardwareCompare";
import { ssdModule } from "@/data/ssd";

function SsdCompare() {
  const { t } = useTranslation();
  return <HardwareCompare module={ssdModule} title={t("ssdCompare.title")} icon={<HardDrive className="size-5" />} />;
}

export default SsdCompare;