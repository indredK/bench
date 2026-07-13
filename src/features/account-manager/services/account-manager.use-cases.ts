/**
 * Use Case / 用例层: coordinate account-manager business rules; 只编排业务规则.
 */
import { canUseTauriWindow } from "@/platform/capabilities"
import { accountManagerRepository } from "@/features/account-manager/services/account-manager.repository"
import type { SessionSettings } from "@/features/account-manager/model/types"
import {
  hasDuplicateUsername,
  pickImportSelection,
} from "@/features/account-manager/model/selectors"
import type {
  NetworkProxyConfig,
  ProbeStrategy,
  RelayDataImportResult,
  RelayStation,
  StationAccount,
} from "@/lib/tauri/types/account-manager"

export function isInvalidInput(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "INVALID_INPUT"
  )
}

/** 比较两个代理配置是否等价(忽略 opaque encryptedPassword)。 */
function proxyConfigEquals(a: NetworkProxyConfig | null, b: NetworkProxyConfig | null): boolean {
  if (a == null || b == null) return a == null && b == null
  return (
    a.proxyType === b.proxyType &&
    a.host === b.host &&
    a.port === b.port &&
    (a.username ?? "") === (b.username ?? "")
  )
}

async function applySessionSettings(
  stationId: string,
  settings: SessionSettings,
  baselineTtlHours = 720,
  baselineNetworkProxy: NetworkProxyConfig | null = null,
) {
  const promises: Promise<unknown>[] = []
  if (settings.probeOverride) {
    promises.push(accountManagerRepository.setProbeStrategy(stationId, settings.probeStrategy))
  }
  if (settings.sessionTtlHours !== baselineTtlHours) {
    promises.push(accountManagerRepository.setSessionTtl(stationId, settings.sessionTtlHours))
  }
  // 网络代理:仅在配置变化或密码变更时写入。password=null 由后端解释为保留旧密码。
  const configChanged = !proxyConfigEquals(settings.networkProxy, baselineNetworkProxy)
  const passwordChanged = settings.networkProxyPassword !== undefined
  if (configChanged || passwordChanged) {
    promises.push(
      accountManagerRepository.setStationNetworkProxy(
        stationId,
        settings.networkProxy,
        settings.networkProxyPassword ?? null,
      ),
    )
  }
  await Promise.all(promises)
}

export async function openLoginWebview(account: StationAccount, website: string) {
  if (canUseTauriWindow()) {
    try {
      await accountManagerRepository.openLoginWindow(account.id)
      return
    } catch (error) {
      console.warn("[relay-login] open_login_window failed, falling back:", error)
    }
  }
  await accountManagerRepository.openExternal(website)
}

export const accountManagerUseCases = {
  loadInitialData() {
    return Promise.all([
      accountManagerRepository.listStations(),
      accountManagerRepository.listAllAccounts(),
    ])
  },

  async addStation(remark: string, website: string, sessionSettings?: SessionSettings) {
    const station = await accountManagerRepository.createStation(remark, website, null)
    if (sessionSettings) {
      await applySessionSettings(station.id, sessionSettings, 720, null)
    }
    return station
  },

  async editStation(
    station: RelayStation,
    remark: string,
    website: string,
    sessionSettings?: SessionSettings,
  ) {
    const updated = await accountManagerRepository.updateStation(station.id, {
      remark,
      website,
    })
    if (sessionSettings) {
      await applySessionSettings(
        station.id,
        sessionSettings,
        station.sessionTtlHours ?? 720,
        station.networkProxy ?? null,
      )
    }
    return updated
  },

  async quickLogin(url: string, username: string, stationId?: string | null) {
    const normalized = url.trim().match(/^https?:\/\//i) ? url.trim() : `https://${url.trim()}`
    const account = await accountManagerRepository.createEphemeralAccount(
      normalized,
      username.trim(),
      stationId ?? null,
    )
    await accountManagerRepository.openLoginWindow(account.id)
    return { account, normalized }
  },

  async redetectAuthProfile(stationId: string, accountId?: string) {
    return accountManagerRepository.detectStationAuthProfile(stationId, accountId)
  },

  async addAccount(stationId: string, username: string, password: string, notes: string) {
    return accountManagerRepository.createAccount(
      stationId,
      username,
      password ? password : null,
      notes,
    )
  },

  async refreshAccount(accountId: string) {
    return accountManagerRepository.refreshAccount(accountId)
  },

  async refreshStation(stationId: string) {
    return accountManagerRepository.refreshStation(stationId)
  },

  async refreshAll() {
    return accountManagerRepository.refreshAll()
  },

  async toggleProxy(accountId: string, enabled: boolean) {
    return accountManagerRepository.setAccountProxyEnabled(accountId, enabled)
  },

  revealPassword(accountId: string) {
    return accountManagerRepository.revealPassword(accountId)
  },

  async copyPassword(accountId: string) {
    await accountManagerRepository.copyPasswordToClipboard(accountId)
  },

  async changeProbeStrategy(stationId: string, next: ProbeStrategy | "auto") {
    if (next === "auto") {
      return accountManagerRepository.resetProbeStrategy(stationId)
    }
    return accountManagerRepository.setProbeStrategy(stationId, next)
  },

  async exportData() {
    const selected = await accountManagerRepository.savePlatformDialog({
      canCreateDirectories: true,
      defaultPath: "relay-data-export.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    })
    if (!selected) return null
    const result = await accountManagerRepository.exportRelayData(selected)
    return result
  },

  async importData(): Promise<RelayDataImportResult | null> {
    const selected = await accountManagerRepository.openPlatformDialog({
      directory: false,
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    })
    if (!selected || Array.isArray(selected)) return null
    return accountManagerRepository.importRelayData(selected)
  },

  resolveImportSelection(
    result: RelayDataImportResult,
    currentStationId: string,
    currentAccountId: string,
  ) {
    return pickImportSelection(result.stations, result.accounts, currentStationId, currentAccountId)
  },

  hasDuplicateUsername,

  async editAccount(
    editingAccount: StationAccount,
    username: string,
    notes: string,
    password: string | null,
    proxyEnabled: boolean,
  ) {
    let updated = await accountManagerRepository.updateAccount(editingAccount.id, {
      username,
      notes,
    })
    if (password !== null) {
      try {
        await accountManagerRepository.setPassword(editingAccount.id, password)
        updated = { ...updated, hasPassword: password.length > 0 }
      } catch {
        updated = {
          ...updated,
          hasPassword: editingAccount.hasPassword,
          proxyEnabled,
        }
        return { updated, passwordFailed: true as const }
      }
    } else {
      updated = { ...updated, hasPassword: editingAccount.hasPassword }
    }
    try {
      updated = await accountManagerRepository.setAccountProxyEnabled(
        editingAccount.id,
        proxyEnabled,
      )
    } catch {
      return { updated, proxyFailed: true as const }
    }
    return { updated, passwordFailed: false as const, proxyFailed: false as const }
  },

  async deleteStation(stationId: string) {
    await accountManagerRepository.deleteStation(stationId)
  },

  async deleteAccount(accountId: string) {
    await accountManagerRepository.deleteAccount(accountId)
  },

  buildStationDeleteSelection(
    stations: RelayStation[],
    accounts: StationAccount[],
    target: RelayStation,
    selectedStationId: string,
    selectedAccountId: string,
  ) {
    const wasSelected = selectedStationId === target.id
    const remainingStations = stations.filter((station) => station.id !== target.id)
    const newStationId = wasSelected ? (remainingStations[0]?.id ?? "") : selectedStationId
    const newAccountId = wasSelected
      ? (accounts.find((account) => account.stationId === newStationId)?.id ?? "")
      : selectedAccountId
    return { wasSelected, newStationId, newAccountId }
  },

  buildAccountDeleteSelection(
    accounts: StationAccount[],
    target: StationAccount,
    selectedAccountId: string,
  ) {
    const wasSelected = selectedAccountId === target.id
    const nextAccountId = wasSelected
      ? (accounts.find(
          (account) => account.id !== target.id && account.stationId === target.stationId,
        )?.id ?? "")
      : selectedAccountId
    return { wasSelected, nextAccountId }
  },

  buildOptimisticStationOrder(stations: RelayStation[], orderedIds: string[]) {
    const map = new Map(stations.map((station) => [station.id, station]))
    const next = orderedIds
      .map((id) => map.get(id))
      .filter((station): station is RelayStation => Boolean(station))
    return { next, mismatch: next.length !== stations.length }
  },

  buildOptimisticAccountOrder(accounts: StationAccount[], stationId: string, orderedIds: string[]) {
    const mineMap = new Map(
      accounts.filter((account) => account.stationId === stationId).map((a) => [a.id, a]),
    )
    const newMine = orderedIds
      .map((id) => mineMap.get(id))
      .filter((account): account is StationAccount => Boolean(account))
    if (newMine.length !== mineMap.size) {
      return { mismatch: true as const }
    }
    let mineIter = 0
    const optimistic = accounts.map((account) =>
      account.stationId === stationId ? newMine[mineIter++] : account,
    )
    return { mismatch: false as const, optimistic }
  },

  async reorderStations(orderedIds: string[]) {
    return accountManagerRepository.reorderStations(orderedIds)
  },

  async reorderAccounts(stationId: string, orderedIds: string[]) {
    return accountManagerRepository.reorderAccounts(stationId, orderedIds)
  },

  listExternalApps(accountId?: string | null) {
    return Promise.all([
      accountManagerRepository.listExternalApps(null, accountId ?? null),
      accountManagerRepository.listExternalAppBindings(accountId ?? null),
    ])
  },

  revokeExternalApp(appId: string) {
    return accountManagerRepository.removeExternalApp(appId)
  },
}
