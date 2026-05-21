import { Trash2 } from "lucide-react";
import { RuntimeFeatureGate } from "@/components/common/RuntimeFeatureGate";
import { DevCleanerPageContent } from "@/features/dev-cleaner/components/DevCleanerPageContent";
import { useDevCleanerController } from "@/features/dev-cleaner/hooks/useDevCleanerController";

export default function DevCleaner({ feature }: { feature?: { desktopOnly?: boolean } }) {
  const controller = useDevCleanerController();

  return (
    <RuntimeFeatureGate
      feature={feature}
      title={controller.t("devCleaner.title")}
      icon={<Trash2 size={32} className="opacity-40" />}
    >
      <DevCleanerPageContent controller={controller} />
    </RuntimeFeatureGate>
  );
}
