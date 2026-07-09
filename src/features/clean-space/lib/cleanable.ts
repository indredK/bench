/**
 * Cleanability / 可清理性: pure predicates for storage cleanup items.
 */
import type { StorageItem } from "@/lib/tauri/types/clean-space"

export function canCleanStorageItem(item: StorageItem): boolean {
  return item.is_cleanable === true && item.command.trim().length > 0
}

export function getProtectionReason(item: StorageItem): string {
  return item.protection_reason || item.reason
}
