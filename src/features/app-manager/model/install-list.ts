import type { AppInfo, InstallListAppInfo } from "@/lib/tauri/types/app-manager";
import {
  getRecommendedInstallList,
  type RecommendedAppInstallStatus,
} from "@/features/app-manager/recommended-apps";

export function createInstallListApps(apps: AppInfo[]): InstallListAppInfo[] {
  return getRecommendedInstallList(apps).map((app: RecommendedAppInstallStatus) => ({
    _virtual: true as const,
    id: app.id,
    name: app.name,
    bundleId: app.bundleIdPattern,
    category: app.category,
    series: app.series,
    description: app.description,
    installSource: app.installSource,
    iconKey: app.iconKey,
    installed: app.installed,
    installedAppId: app.installedAppId,
    installedVersion: app.installedVersion,
    installedPath: app.installedPath,
  }));
}
