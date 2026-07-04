/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useEffect, useState } from "react";
import { appManagerUseCases } from "@/features/app-manager/services/app-manager.use-cases";
import { canUseDesktopFeatures } from "@/platform/capabilities";

interface AppIconProps {
  iconBase64: string | null;
  installPath?: string;
  size?: number;
  className?: string;
}

// LRU cap. The icon cache previously grew without bound; on a machine with
// 800+ apps each base64 icon (~10-30KB) could pin several megabytes
// indefinitely, and re-scans never released the entries (#070). The cap is
// generous (covers most users in one shot) and we rely on Map insertion-order
// to evict the oldest entries.
const ICON_CACHE_CAP = 500;
const MAX_CONCURRENT_LOADS = 8;
const iconCache = new Map<string, string | null>();
const iconRequests = new Map<string, Promise<string | null>>();
let activeLoadCount = 0;
const pendingLoadQueue: Array<() => void> = [];

function runNextPendingLoad() {
  if (activeLoadCount >= MAX_CONCURRENT_LOADS) return;
  const next = pendingLoadQueue.shift();
  if (next) next();
}

function rememberIcon(installPath: string, icon: string | null) {
  if (iconCache.has(installPath)) {
    iconCache.delete(installPath);
  } else if (iconCache.size >= ICON_CACHE_CAP) {
    const oldest = iconCache.keys().next().value;
    if (oldest !== undefined) iconCache.delete(oldest);
  }
  iconCache.set(installPath, icon);
}

function readIcon(installPath: string): string | null | undefined {
  if (!iconCache.has(installPath)) return undefined;
  const value = iconCache.get(installPath) ?? null;
  iconCache.delete(installPath);
  iconCache.set(installPath, value);
  return value;
}

function loadIcon(installPath: string) {
  const cached = readIcon(installPath);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = iconRequests.get(installPath);
  if (existing) return existing;

  const startLoad = () => {
    activeLoadCount++;
    const request = appManagerUseCases.loadAppIconBase64(installPath)
      .then((icon) => {
        rememberIcon(installPath, icon);
        return icon;
      })
      .catch(() => {
        rememberIcon(installPath, null);
        return null;
      })
      .finally(() => {
        iconRequests.delete(installPath);
        activeLoadCount--;
        runNextPendingLoad();
      });
    iconRequests.set(installPath, request);
    return request;
  };

  if (activeLoadCount < MAX_CONCURRENT_LOADS) {
    return startLoad();
  }

  const queued = new Promise<string | null>((resolve) => {
    pendingLoadQueue.push(() => {
      startLoad().then(resolve);
    });
  });
  iconRequests.set(installPath, queued);
  return queued;
}

export function preloadAppIcons(apps: { installPath?: string }[]) {
  for (const app of apps) {
    if (app.installPath) {
      loadIcon(app.installPath);
    }
  }
}

export function AppIcon({ iconBase64, installPath, size = 24, className }: AppIconProps) {
  const [loadedIcon, setLoadedIcon] = useState<string | undefined>(() =>
    installPath ? readIcon(installPath) ?? undefined : undefined
  );
  const icon = iconBase64 ?? loadedIcon;

  useEffect(() => {
    if (iconBase64 || !installPath || !canUseDesktopFeatures()) return;
    let cancelled = false;
    const cached = readIcon(installPath);
    if (cached !== undefined) {
      setLoadedIcon(cached ?? undefined);
      return;
    }
    void loadIcon(installPath).then((nextIcon) => {
      if (!cancelled) setLoadedIcon(nextIcon ?? undefined);
    });
    return () => { cancelled = true; };
  }, [iconBase64, installPath]);

  return (
    <div style={{ width: size, height: size }} className={className}>
      {icon && (
        <img
          src={`data:image/png;base64,${icon}`}
          alt=""
          width={size}
          height={size}
          className={className}
        />
      )}
    </div>
  );
}
