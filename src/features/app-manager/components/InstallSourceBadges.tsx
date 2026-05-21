/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import { Badge } from "@/components/ui/badge";
import type { InstallSource } from "@/lib/tauri/types/app-manager";

interface InstallSourceBadgesProps {
  installSource: InstallSource;
  className?: string;
}

export function InstallSourceBadges({
  installSource,
  className = "text-[10px] px-1 py-0",
}: InstallSourceBadgesProps) {
  const { t } = useTranslation();
  const hasPackageManager =
    installSource.brew ||
    installSource.winget ||
    installSource.flatpak ||
    installSource.snap ||
    installSource.apt;

  return (
    <>
      {installSource.brew && (
        <Badge variant="secondary" className={className}>{t("appManager.sourceHomebrewCask")}</Badge>
      )}
      {installSource.winget && (
        <Badge variant="secondary" className={className}>{t("appManager.sourceWinget")}</Badge>
      )}
      {installSource.flatpak && (
        <Badge variant="secondary" className={className}>{t("appManager.sourceFlatpak")}</Badge>
      )}
      {installSource.snap && (
        <Badge variant="secondary" className={className}>{t("appManager.sourceSnap")}</Badge>
      )}
      {installSource.apt && (
        <Badge variant="secondary" className={className}>{t("appManager.sourceApt")}</Badge>
      )}
      {!hasPackageManager && installSource.url && (
        <Badge variant="secondary" className={className}>{t("appManager.sourceDownload")}</Badge>
      )}
    </>
  );
}

export function getInstallSourceLabel(installSource: InstallSource): string {
  if (installSource.brew) return i18n.t("appManager.sourceHomebrewCask");
  if (installSource.winget) return i18n.t("appManager.sourceWinget");
  if (installSource.flatpak) return i18n.t("appManager.sourceFlatpak");
  if (installSource.snap) return i18n.t("appManager.sourceSnap");
  if (installSource.apt) return i18n.t("appManager.sourceApt");
  return i18n.t("appManager.sourceDownload");
}
