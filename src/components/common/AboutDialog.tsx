/**
 * Common UI / 通用 UI: share cross-feature UI; 只放跨功能通用界面.
 */
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appVersion?: string;
  tauriVersion?: string;
  onCheckUpdates?: () => void;
}

export function AboutDialog({
  open,
  onOpenChange,
  appVersion = "1.0.0",
  tauriVersion = "2.x",
  onCheckUpdates,
}: AboutDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="text-center">
            Bench DevTools
          </DialogTitle>
          <DialogDescription className="text-center">
            {t("about.description", "All-in-one developer toolkit for macOS")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <div className="flex justify-between px-8">
            <span>{t("about.version", "Version")}</span>
            <span className="font-mono">{appVersion}</span>
          </div>
          <div className="flex justify-between px-8">
            <span>Tauri</span>
            <span className="font-mono">{tauriVersion}</span>
          </div>
        </div>

        <div className="flex justify-center gap-2 pt-2">
          {onCheckUpdates && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCheckUpdates}
            >
              {t("updater.checkNow")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t("about.close", "Close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
