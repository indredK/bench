/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useEffect, useState } from "react";
import { AppWindow } from "lucide-react";
import { appManagerUseCases } from "@/features/app-manager/services/app-manager.use-cases";
import { canUseDesktopFeatures } from "@/platform/capabilities";

interface AppIconProps {
  iconBase64: string | null;
  installPath?: string;
  size?: number;
  className?: string;
}

const iconCache = new Map<string, string | null>();
const iconRequests = new Map<string, Promise<string | null>>();

function loadIcon(installPath: string) {
  const cached = iconCache.get(installPath);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = iconRequests.get(installPath);
  if (existing) return existing;

  const request = appManagerUseCases.loadAppIconBase64(installPath)
    .then((icon) => {
      iconCache.set(installPath, icon);
      return icon;
    })
    .catch(() => {
      iconCache.set(installPath, null);
      return null;
    })
    .finally(() => {
      iconRequests.delete(installPath);
    });

  iconRequests.set(installPath, request);
  return request;
}

export function AppIcon({ iconBase64, installPath, size = 24, className }: AppIconProps) {
  const [loadedIcon, setLoadedIcon] = useState(() =>
    installPath ? iconCache.get(installPath) ?? null : null
  );
  const icon = iconBase64 ?? loadedIcon;

  useEffect(() => {
    if (iconBase64 || !installPath || !canUseDesktopFeatures()) return;
    let cancelled = false;
    void loadIcon(installPath).then((nextIcon) => {
      if (!cancelled) setLoadedIcon(nextIcon);
    });
    return () => {
      cancelled = true;
    };
  }, [iconBase64, installPath]);

  if (!icon) {
    return <AppWindow size={size} className={className} />;
  }

  return (
    <img
      src={`data:image/png;base64,${icon}`}
      alt=""
      width={size}
      height={size}
      className={className}
    />
  );
}
