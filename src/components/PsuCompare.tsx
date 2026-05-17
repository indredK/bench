import { Plug } from "lucide-react";
import { useTranslation } from "react-i18next";
import HardwareCompare from "@/components/HardwareCompare";
import { psuModule } from "@/data/psu";

function PsuCompare() {
  const { t } = useTranslation();
  return <HardwareCompare module={psuModule} title={t("psuCompare.title")} icon={<Plug className="size-5" />} />;
}

export default PsuCompare;