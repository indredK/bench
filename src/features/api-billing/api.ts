/**
 * api-billing IPC bindings / 中转站账号通信桥: thin invoke wrappers; 只封装命令调用.
 */
import { invokeTauriCommand } from "@/lib/tauri/invoke";
import type {
  RelayDataExportResult,
  RelayDataImportResult,
  RelayStation,
  StationAccount,
} from "@/lib/tauri/types/api-billing";

export type {
  AccountSessionStatus,
  RelayDataExportResult,
  RelayDataImportResult,
  RelayStation,
  StationAccount,
} from "@/lib/tauri/types/api-billing";

export function listStations(): Promise<RelayStation[]> {
  return invokeTauriCommand("list_stations");
}

export function createStation(
  remark: string,
  website: string,
  probeUrl?: string | null
): Promise<RelayStation> {
  return invokeTauriCommand("create_station", { remark, website, probeUrl: probeUrl ?? null });
}

export function updateStation(
  id: string,
  patch: { remark?: string; website?: string; probeUrl?: string | null }
): Promise<RelayStation> {
  return invokeTauriCommand("update_station", {
    id,
    remark: patch.remark ?? null,
    website: patch.website ?? null,
    probeUrl: patch.probeUrl,
  });
}

export function deleteStation(id: string): Promise<void> {
  return invokeTauriCommand("delete_station", { id });
}

export function listAllAccounts(): Promise<StationAccount[]> {
  return invokeTauriCommand("list_all_accounts");
}

export function listAccounts(stationId: string): Promise<StationAccount[]> {
  return invokeTauriCommand("list_accounts", { stationId });
}

export function createAccount(
  stationId: string,
  username: string,
  password: string | null,
  notes: string,
  phone?: string | null,
  tgAccount?: string | null,
  linkedAccount?: string | null
): Promise<StationAccount> {
  return invokeTauriCommand("create_account", {
    stationId,
    username,
    password,
    notes,
    phone: phone ?? null,
    tgAccount: tgAccount ?? null,
    linkedAccount: linkedAccount ?? null,
  });
}

export function updateAccount(
  id: string,
  patch: { username?: string; notes?: string; phone?: string | null; tgAccount?: string | null; linkedAccount?: string | null }
): Promise<StationAccount> {
  return invokeTauriCommand("update_account", {
    id,
    username: patch.username ?? null,
    notes: patch.notes ?? null,
    phone: "phone" in patch ? patch.phone : null,
    tgAccount: "tgAccount" in patch ? patch.tgAccount : null,
    linkedAccount: "linkedAccount" in patch ? patch.linkedAccount : null,
  });
}

export function deleteAccount(id: string): Promise<void> {
  return invokeTauriCommand("delete_account", { id });
}

export function revealPassword(accountId: string): Promise<string> {
  return invokeTauriCommand("reveal_password", { accountId });
}

export function setPassword(accountId: string, password: string): Promise<void> {
  return invokeTauriCommand("set_password", { accountId, password });
}

export function clearPassword(accountId: string): Promise<void> {
  return invokeTauriCommand("clear_password", { accountId });
}

export function copyPasswordToClipboard(accountId: string): Promise<void> {
  return invokeTauriCommand("copy_password_to_clipboard", { accountId });
}

export function openLoginWindow(accountId: string): Promise<void> {
  return invokeTauriCommand("open_login_window", { accountId });
}

export function markAccountLoggedIn(accountId: string): Promise<StationAccount> {
  return invokeTauriCommand("mark_account_logged_in", { accountId });
}

export function refreshAccount(accountId: string): Promise<StationAccount> {
  return invokeTauriCommand("refresh_account", { accountId });
}

export function refreshStation(stationId: string): Promise<StationAccount[]> {
  return invokeTauriCommand("refresh_station", { stationId });
}

export function refreshAll(): Promise<StationAccount[]> {
  return invokeTauriCommand("refresh_all");
}

export function exportRelayData(path: string): Promise<RelayDataExportResult> {
  return invokeTauriCommand("export_relay_data", { path });
}

export function importRelayData(path: string): Promise<RelayDataImportResult> {
  return invokeTauriCommand("import_relay_data", { path });
}
