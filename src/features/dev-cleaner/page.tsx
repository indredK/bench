import { Trash2 } from "lucide-react";
import { DesktopOnly } from "@/components/common/DesktopOnly";
import { DevCleanerPageContent } from "@/features/dev-cleaner/components/DevCleanerPageContent";
import { useDevCleanerController } from "@/features/dev-cleaner/hooks/useDevCleanerController";

export default function DevCleaner() {
  const controller = useDevCleanerController();

  if (!controller.isTauriEnv) {
    return <DesktopOnly title={controller.t("devCleaner.title")} icon={<Trash2 size={32} className="opacity-40" />} />;
  }

  return <DevCleanerPageContent controller={controller} />;
}
