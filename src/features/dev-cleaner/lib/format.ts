export function formatScanTime(scanTimeMs: number) {
  if (scanTimeMs < 1000) {
    return `${scanTimeMs} ms`;
  }
  return `${(scanTimeMs / 1000).toFixed(1)} s`;
}
