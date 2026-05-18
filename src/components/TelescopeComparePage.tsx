import { useTranslation } from "react-i18next";
import HardwareCompare from "@/components/HardwareCompare";
import { telescopeModule } from "@/data/telescope";

function TelescopeComparePage() {
  const { t } = useTranslation();

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <h2 className="text-lg font-semibold mb-4">
        {t("telescopeCompare.title")}
      </h2>
      <HardwareCompare module={telescopeModule} />
    </div>
  );
}

export default TelescopeComparePage;
