import { Wind } from "lucide-react";
import { useTranslation } from "react-i18next";
import HardwareCompare from "@/components/HardwareCompare";
import { coolerModule } from "@/data/cooler";

function CoolerCompare() {
  const { t } = useTranslation();
  return <HardwareCompare module={coolerModule} title={t("coolerCompare.title")} icon={<Wind className="size-5" />} />;
}

export default CoolerCompare;