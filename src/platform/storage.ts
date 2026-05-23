/**
 * Platform Adapter / 平台适配: wrap browser storage; 统一封装浏览器存储.
 *
 * localStorage can throw in three realistic environments:
 *   - Safari/iOS WebView in private mode (SecurityError on any access)
 *   - Storage quota exhausted (QuotaExceededError on setItem)
 *   - Some embedded WebViews where storage is disabled entirely
 * Without try/catch these crash the boot path (i18n init, theme read) and
 * the app white-screens before React ever renders (#092).
 *
 * We fall back to an in-memory Map so the session continues. Preferences
 * are not persisted across reloads in that case, but the UI keeps working.
 */

const memoryCache = new Map<string, string>();

function storageOrNull(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readStorageItem(key: string): string | null {
  const storage = storageOrNull();
  if (storage) {
    try {
      const value = storage.getItem(key);
      if (value !== null) return value;
    } catch {
      // Fall through to memory cache.
    }
  }
  return memoryCache.has(key) ? (memoryCache.get(key) ?? null) : null;
}

export function writeStorageItem(key: string, value: string) {
  memoryCache.set(key, value);
  const storage = storageOrNull();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Quota / privacy mode — keep in memory only.
  }
}

export function removeStorageItem(key: string) {
  memoryCache.delete(key);
  const storage = storageOrNull();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Privacy mode — already cleared from memory cache.
  }
}

/** Whether persistent storage is currently writable. Useful for surfacing a
 *  one-time "settings won't persist" notice without crashing the boot path. */
export function isPersistentStorageAvailable(): boolean {
  const storage = storageOrNull();
  if (!storage) return false;
  const probeKey = "__storage_probe__";
  try {
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}
