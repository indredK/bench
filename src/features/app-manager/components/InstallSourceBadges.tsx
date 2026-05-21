/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
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
  const hasPackageManager =
    installSource.brew ||
    installSource.winget ||
    installSource.flatpak ||
    installSource.snap ||
    installSource.apt;

  return (
    <>
      {installSource.brew && (
        <Badge variant="secondary" className={className}>Homebrew</Badge>
      )}
      {installSource.winget && (
        <Badge variant="secondary" className={className}>winget</Badge>
      )}
      {installSource.flatpak && (
        <Badge variant="secondary" className={className}>Flatpak</Badge>
      )}
      {installSource.snap && (
        <Badge variant="secondary" className={className}>Snap</Badge>
      )}
      {installSource.apt && (
        <Badge variant="secondary" className={className}>APT</Badge>
      )}
      {!hasPackageManager && installSource.url && (
        <Badge variant="secondary" className={className}>Download</Badge>
      )}
    </>
  );
}

export function getInstallSourceLabel(installSource: InstallSource): string {
  if (installSource.brew) return "Homebrew";
  if (installSource.winget) return "winget";
  if (installSource.flatpak) return "Flatpak";
  if (installSource.snap) return "Snap";
  if (installSource.apt) return "APT";
  return "Download";
}
