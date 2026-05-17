import { CircuitBoard } from "lucide-react";
import { useTranslation } from "react-i18next";
import HardwareCompare from "@/components/HardwareCompare";
import { motherboardModule } from "@/data/motherboard";

function MotherboardCompare() {
  const { t } = useTranslation();
  return <HardwareCompare module={motherboardModule} title={t("motherboardCompare.title")} icon={<CircuitBoard className="size-5" />} />;
}

export default MotherboardCompare;