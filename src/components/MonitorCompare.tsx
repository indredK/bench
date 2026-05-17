import { Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";
import HardwareCompare from "@/components/HardwareCompare";
import { monitorModule } from "@/data/monitor";

function MonitorCompare() {
  const { t } = useTranslation();
  return <HardwareCompare module={monitorModule} title={t("monitorCompare.title")} icon={<Monitor className="size-5" />} />;
}

export default MonitorCompare;