import type { UpdaterPolicy } from "@/features/updater/services/updater-policy.repository"

export const AUTO_CHECK_STARTUP_DELAY_MS = 30_000
export const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000
const AUTO_CHECK_BACKOFF_BASE_MS = 15 * 60 * 1_000

export function getAutoCheckBackoffMs(failureCount: number): number {
  if (failureCount <= 0) return 0
  return Math.min(
    AUTO_CHECK_INTERVAL_MS,
    AUTO_CHECK_BACKOFF_BASE_MS * 2 ** Math.min(10, failureCount - 1),
  )
}

export function getNextAutoCheckDelay(policy: UpdaterPolicy, now: number): number | null {
  if (!policy.autoCheckEnabled) return null

  if (policy.failureCount > 0 && policy.lastFailureAt > 0) {
    return Math.max(0, policy.lastFailureAt + getAutoCheckBackoffMs(policy.failureCount) - now)
  }

  if (policy.lastSuccessfulCheckAt > 0) {
    return Math.max(0, policy.lastSuccessfulCheckAt + AUTO_CHECK_INTERVAL_MS - now)
  }

  return 0
}

export function shouldDeferAutoCheckForConnection(connection?: {
  saveData?: boolean
  effectiveType?: string
}): boolean {
  return (
    connection?.saveData === true ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g"
  )
}
