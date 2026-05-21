/**
 * Feature Utility / 功能工具: keep feature helpers pure; 只放功能内纯工具.
 */
export function formatScanTime(scanTimeMs: number) {
  if (scanTimeMs < 1000) {
    return `${scanTimeMs} ms`;
  }
  return `${(scanTimeMs / 1000).toFixed(1)} s`;
}
