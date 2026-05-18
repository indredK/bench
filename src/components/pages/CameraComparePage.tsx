import { useTranslation } from "react-i18next";
import HardwareCompare from "@/components/hardware/HardwareCompare";
import { cameraModule } from "@/data/camera";

function CameraComparePage() {
  const { t } = useTranslation();

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <h2 className="text-lg font-semibold mb-4">
        {t("cameraCompare.title")}
      </h2>
      <HardwareCompare module={cameraModule} />
    </div>
  );
}

export default CameraComparePage;
