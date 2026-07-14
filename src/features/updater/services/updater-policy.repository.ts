import { readStorageItem, writeStorageItem } from "@/platform/storage"

const POLICY_STORAGE_KEY = "bench.updater.policy.v1"

export interface UpdaterPolicy {
  autoCheckEnabled: boolean
  lastSuccessfulCheckAt: number
  lastFailureAt: number
  failureCount: number
}

export const DEFAULT_UPDATER_POLICY: UpdaterPolicy = {
  autoCheckEnabled: true,
  lastSuccessfulCheckAt: 0,
  lastFailureAt: 0,
  failureCount: 0,
}

function safeTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
}

export function readUpdaterPolicy(): UpdaterPolicy {
  const raw = readStorageItem(POLICY_STORAGE_KEY)
  if (!raw) return DEFAULT_UPDATER_POLICY

  try {
    const value = JSON.parse(raw) as Partial<UpdaterPolicy>
    return {
      autoCheckEnabled: typeof value.autoCheckEnabled === "boolean" ? value.autoCheckEnabled : true,
      lastSuccessfulCheckAt: safeTimestamp(value.lastSuccessfulCheckAt),
      lastFailureAt: safeTimestamp(value.lastFailureAt),
      failureCount:
        typeof value.failureCount === "number" && Number.isInteger(value.failureCount)
          ? Math.min(16, Math.max(0, value.failureCount))
          : 0,
    }
  } catch {
    return DEFAULT_UPDATER_POLICY
  }
}

export function writeUpdaterPolicy(policy: UpdaterPolicy) {
  writeStorageItem(POLICY_STORAGE_KEY, JSON.stringify(policy))
}
