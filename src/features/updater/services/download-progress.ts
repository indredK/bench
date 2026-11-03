/**
 * Download progress math / 下载进度计算: 纯函数，无 UI、无 IPC.
 *
 * 速度用指数滑动平均，避免瞬时抖动让「剩余时间」来回跳；采样间隔过短（同一帧内多条事件）直接忽略。
 */

const MIN_SAMPLE_INTERVAL_MS = 50
const SMOOTHING = 0.3

export function formatBytes(bytes: number): string {
  // Guard against NaN / Infinity / negative — otherwise `${NaN} GB` would render.
  if (!Number.isFinite(bytes) || bytes < 0) return "—"
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatSpeed(bytesPerSecond: number | null): string | null {
  if (bytesPerSecond === null || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return null
  }
  return `${formatBytes(bytesPerSecond)}/s`
}

/** 下一次速度估计；样本太密或字节数倒退时沿用旧值。 */
export function nextSpeed(
  previous: { speed: number | null; bytes: number; at: number },
  bytes: number,
  now: number,
): number | null {
  if (previous.at <= 0) return previous.speed
  const elapsed = now - previous.at
  if (elapsed < MIN_SAMPLE_INTERVAL_MS || bytes < previous.bytes) return previous.speed
  const instant = ((bytes - previous.bytes) / elapsed) * 1000
  if (!Number.isFinite(instant)) return previous.speed
  return previous.speed === null ? instant : SMOOTHING * instant + (1 - SMOOTHING) * previous.speed
}

/** 剩余秒数；总大小或速度未知时返回 null（不编造）。 */
export function etaSeconds(
  downloaded: number,
  total: number | null,
  speed: number | null,
): number | null {
  if (total === null || total <= 0 || speed === null || speed <= 0) return null
  const remaining = total - downloaded
  if (remaining <= 0) return 0
  return Math.ceil(remaining / speed)
}

export function formatEta(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}:${String(rest).padStart(2, "0")}`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function percentOf(downloaded: number, total: number | null): number | null {
  if (total === null || total <= 0) return null
  return Math.min(100, Math.round((downloaded / total) * 100))
}
