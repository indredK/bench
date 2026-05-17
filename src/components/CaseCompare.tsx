import { Box } from "lucide-react";
import { useTranslation } from "react-i18next";
import HardwareCompare from "@/components/HardwareCompare";
import { caseModule } from "@/data/case";

function CaseCompare() {
  const { t } = useTranslation();
  return <HardwareCompare module={caseModule} title={t("caseCompare.title")} icon={<Box className="size-5" />} />;
}

export default CaseCompare;