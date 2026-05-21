/**
 * Platform Adapter / 平台适配: wrap browser storage; 统一封装浏览器存储.
 */
export function readStorageItem(key: string): string | null {
  return localStorage.getItem(key);
}

export function writeStorageItem(key: string, value: string) {
  localStorage.setItem(key, value);
}
