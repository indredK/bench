import type { RelayStation, StationAccount } from "@/lib/tauri/types/account-manager"

export function selectStation(stations: RelayStation[], stationId: string): RelayStation | null {
  return stations.find((station) => station.id === stationId) ?? null
}

export function selectStationAccounts(
  accounts: StationAccount[],
  stationId: string,
): StationAccount[] {
  return accounts.filter((account) => account.stationId === stationId)
}

export function selectAccountCountByStation(accounts: StationAccount[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const account of accounts) {
    map[account.stationId] = (map[account.stationId] ?? 0) + 1
  }
  return map
}

export function selectSelectedAccount(
  stationAccounts: StationAccount[],
  selectedAccountId: string,
): StationAccount | null {
  return (
    stationAccounts.find((account) => account.id === selectedAccountId) ??
    stationAccounts[0] ??
    null
  )
}

/**
 * 初始/重载选中：优先保留仍有效的当前选中项（重载数据时不应把用户
 * 所在站点重置回第一个，否则扩展保存等异步刷新会"藏"掉新数据）；
 * 仅当当前选中已失效（删除/不存在）或首次加载时才回退到第一个站点。
 */
export function pickInitialSelection(
  stations: RelayStation[],
  accounts: StationAccount[],
  currentStationId = "",
  currentAccountId = "",
): { stationId: string; accountId: string } {
  if (stations.length === 0) {
    return { stationId: "", accountId: "" }
  }
  const stationId =
    currentStationId && stations.some((station) => station.id === currentStationId)
      ? currentStationId
      : stations[0].id
  const accountId =
    currentAccountId &&
    accounts.some((account) => account.id === currentAccountId && account.stationId === stationId)
      ? currentAccountId
      : (accounts.find((account) => account.stationId === stationId)?.id ?? "")
  return { stationId, accountId }
}

export function pickImportSelection(
  stations: RelayStation[],
  accounts: StationAccount[],
  currentStationId: string,
  currentAccountId: string,
): { stationId: string; accountId: string } {
  const firstStationId = stations[0]?.id ?? ""
  const stationId =
    currentStationId && stations.some((station) => station.id === currentStationId)
      ? currentStationId
      : firstStationId
  const accountId =
    currentAccountId &&
    accounts.some((account) => account.id === currentAccountId && account.stationId === stationId)
      ? currentAccountId
      : (accounts.find((account) => account.stationId === stationId)?.id ?? "")
  return { stationId, accountId }
}

export function hasDuplicateUsername(
  accounts: StationAccount[],
  stationId: string,
  username: string,
  excludeAccountId?: string,
): boolean {
  const trimmed = username.trim()
  return accounts.some(
    (account) =>
      account.stationId === stationId &&
      account.id !== excludeAccountId &&
      account.username === trimmed,
  )
}
