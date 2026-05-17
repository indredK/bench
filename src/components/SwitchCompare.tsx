import { Network } from "lucide-react";
import { useTranslation } from "react-i18next";
import HardwareCompare from "@/components/HardwareCompare";
import { switchModule } from "@/data/switch";

function SwitchCompare() {
  const { t } = useTranslation();
  return <HardwareCompare module={switchModule} title={t("switchCompare.title")} icon={<Network className="size-5" />} />;
}

export default SwitchCompare;