import type { HealthCheckItem } from "@/lib/tauri/types/network-probe"

export type HealthItemChange = "same" | "changed" | "only-a" | "only-b"

export interface HealthItemComparison {
  key: string
  statusA: string | null
  statusB: string | null
  change: HealthItemChange
}

export function compareHealthItems(
  itemsA: HealthCheckItem[],
  itemsB: HealthCheckItem[],
): HealthItemComparison[] {
  const itemsByKeyA = new Map(itemsA.map((item) => [item.key, item]))
  const itemsByKeyB = new Map(itemsB.map((item) => [item.key, item]))
  const keys = [
    ...itemsByKeyA.keys(),
    ...[...itemsByKeyB.keys()].filter((key) => !itemsByKeyA.has(key)),
  ]

  return keys.map((key) => {
    const itemA = itemsByKeyA.get(key)
    const itemB = itemsByKeyB.get(key)
    const change: HealthItemChange = !itemA
      ? "only-b"
      : !itemB
        ? "only-a"
        : itemA.status === itemB.status
          ? "same"
          : "changed"

    return {
      key,
      statusA: itemA?.status ?? null,
      statusB: itemB?.status ?? null,
      change,
    }
  })
}
