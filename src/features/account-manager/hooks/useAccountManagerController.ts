/**
 * account-manager controller / 账号管理控制器: owns all page state + async orchestration.
 * The page component stays a thin composition layer over what this hook returns.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { openExternal } from "@/platform/shell";
import { openPlatformDialog, savePlatformDialog } from "@/platform/dialog";
import { canUseTauriWindow } from "@/platform/capabilities";
import * as api from "@/features/account-manager/api";
import { classifyAccountManagerError } from "@/features/account-manager/error-classifier";
import type { ProbeStrategy, RelayStation, StationAccount } from "@/features/account-manager/api";
import { useGuardedAsync, useGuardedAsyncSet } from "@/hooks/useGuardedAsync";
import type { SessionSettings } from "@/features/account-manager/model/types";
import { useAuthProxy } from "@/features/account-manager/hooks/useAuthProxy";
import { useQuickLoginHistory } from "@/features/account-manager/hooks/useQuickLoginHistory";

async function openLoginWebview(account: StationAccount, website: string) {
  if (canUseTauriWindow()) {
    try {
      await api.openLoginWindow(account.id);
      return;
    } catch (error) {
      console.warn("[relay-login] open_login_window failed, falling back:", error);
    }
  }
  await openExternal(website);
}

function isInvalidInput(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "INVALID_INPUT"
  );
}

export function useAccountManagerController() {
  const { t } = useTranslation();
  const [stations, setStations] = useState<RelayStation[]>([]);
  const [accounts, setAccounts] = useState<StationAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [openingAccountId, setOpeningAccountId] = useState<string | null>(null);
  const [isAddStationOpen, setAddStationOpen] = useState(false);
  const [isAddAccountOpen, setAddAccountOpen] = useState(false);
  const { pendingKeys: refreshingAccountIds, run: runAccountRefresh } =
    useGuardedAsyncSet<string>();
  const { pendingKeys: refreshingStationIds, run: runStationRefresh } =
    useGuardedAsyncSet<string>();
  const { pending: refreshingAll, run: runAllRefresh } = useGuardedAsync();
  const { pending: quickLoginPending, run: runQuickLogin } = useGuardedAsync();
  const { pending: deletingStationPending, run: runDeleteStation } = useGuardedAsync();
  const { pending: deletingAccountPending, run: runDeleteAccount } = useGuardedAsync();
  const { pendingKeys: togglingProxyIds, run: runToggleProxy } = useGuardedAsyncSet<string>();
  const { pendingKeys: redetectingStationIds, run: runRedetectProfile } =
    useGuardedAsyncSet<string>();
  const { pendingKeys: settingProbeStrategyIds, run: runProbeStrategyChange } =
    useGuardedAsyncSet<string>();
  const [isEditStationOpen, setEditStationOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<RelayStation | null>(null);
  const [isEditAccountOpen, setEditAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<StationAccount | null>(null);
  const [isDeleteStationOpen, setDeleteStationOpen] = useState(false);
  const [deletingStation, setDeletingStation] = useState<RelayStation | null>(null);
  const [isDeleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<StationAccount | null>(null);
  const [importingData, setImportingData] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [reorderingStations, setReorderingStations] = useState(false);
  const [reorderingAccounts, setReorderingAccounts] = useState(false);
  const [isQuickLoginOpen, setQuickLoginOpen] = useState(false);
  const [isExternalAppsOpen, setExternalAppsOpen] = useState(false);
  const [externalAppsAccountId, setExternalAppsAccountId] = useState<string | null>(null);

  const authProxy = useAuthProxy();
  const { readQuickLoginHistory, pushQuickLoginHistory } = useQuickLoginHistory();

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, a] = await Promise.all([api.listStations(), api.listAllAccounts()]);
      setStations(s);
      setAccounts(a);
      if (s.length > 0) {
        setSelectedStationId(s[0].id);
        const firstAccount = a.find((acc) => acc.stationId === s[0].id);
        setSelectedAccountId(firstAccount?.id ?? "");
      } else {
        setSelectedStationId("");
        setSelectedAccountId("");
      }
    } catch (error) {
      const info = classifyAccountManagerError(error, t("accountManager.toasts.initFailed"));
      setLoadError(info.message);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadInitialData().catch(() => undefined);
  }, [loadInitialData]);

  const handleOpenExternalApps = useCallback((accountId: string | null) => {
    setExternalAppsAccountId(accountId);
    setExternalAppsOpen(true);
  }, []);

  const selectedStation = stations.find((s) => s.id === selectedStationId) ?? null;
  const stationAccounts = useMemo(
    () => accounts.filter((a) => a.stationId === selectedStationId),
    [accounts, selectedStationId]
  );
  const accountCountByStation = useMemo(() => {
    const map: Record<string, number> = {};
    for (const account of accounts) {
      map[account.stationId] = (map[account.stationId] ?? 0) + 1;
    }
    return map;
  }, [accounts]);
  const selectedAccount =
    stationAccounts.find((a) => a.id === selectedAccountId) ?? stationAccounts[0] ?? null;

  const handleAddStation = async (
    remark: string,
    website: string,
    sessionSettings?: SessionSettings
  ) => {
    try {
      const station = await api.createStation(remark, website, null);
      if (sessionSettings) {
        const promises: Promise<unknown>[] = [];
        if (sessionSettings.probeOverride) {
          promises.push(api.setProbeStrategy(station.id, sessionSettings.probeStrategy));
        }
        if (sessionSettings.sessionTtlHours !== 720) {
          promises.push(api.setSessionTtl(station.id, sessionSettings.sessionTtlHours));
        }
        await Promise.all(promises);
      }
      setStations((prev) => [...prev, station]);
      setSelectedStationId(station.id);
      setSelectedAccountId("");
      setAddStationOpen(false);
      return true;
    } catch (error) {
      toast.error(t("accountManager.toasts.createStationFailed"));
      return false;
    }
  };

  const handleQuickLogin = (
    url: string,
    username: string,
    destroyOnClose: boolean,
    stationId?: string | null,
  ) =>
    runQuickLogin(async () => {
      if (!url.trim() || !username.trim()) return;
      try {
        const normalized = url.trim().match(/^https?:\/\//i)
          ? url.trim()
          : `https://${url.trim()}`;
        const account = await api.createEphemeralAccount(
          normalized,
          username.trim(),
          stationId ?? null,
        );
        setAccounts((prev) => [...prev, account]);
        await api.openLoginWindow(account.id);
        pushQuickLoginHistory(normalized);
        setQuickLoginOpen(false);

        if (destroyOnClose) {
          const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
          const ww = await WebviewWindow.getByLabel(`relay-login-${account.id}`);
          if (ww) {
            const unlisten = await ww.onCloseRequested(async () => {
              unlisten();
              setAccounts((prev) => prev.filter((a) => a.id !== account.id));
              try { await api.deleteAccount(account.id); } catch { /* ignore */ }
            });
          }
        }

        toast.success(t("accountManager.sessionManager.quickLogin.startedToast"));
      } catch {
        toast.error(t("accountManager.sessionManager.quickLogin.failedToast"));
      }
    });

  const handleRedetectProfile = (stationId: string) =>
    runRedetectProfile(stationId, async () => {
      try {
        const profile = await api.detectStationAuthProfile(stationId);
        setStations((prev) =>
          prev.map((s) => (s.id === stationId ? { ...s, authProfile: profile } : s))
        );
        toast.success(t("accountManager.sessionManager.authProfile.redetectSuccess"));
      } catch {
        toast.error(t("accountManager.sessionManager.authProfile.redetectFailed"));
      }
    });

  const handleAddAccount = async (username: string, password: string, notes: string) => {
    if (!selectedStation) return false;
    const trimmed = username.trim();
    const duplicate = accounts.some(
      (a) => a.stationId === selectedStation.id && a.username === trimmed,
    );
    if (duplicate) {
      toast.error(t("accountManager.toasts.duplicateUsername"));
      return false;
    }
    try {
      const account = await api.createAccount(
        selectedStation.id,
        username,
        password ? password : null,
        notes,
      );
      setAccounts((prev) => [...prev, account]);
      setSelectedAccountId(account.id);
      setAddAccountOpen(false);
      return true;
    } catch (error) {
      toast.error(t("accountManager.toasts.createAccountFailed"));
      return false;
    }
  };

  const handleLogin = async (account: StationAccount) => {
    if (!selectedStation) return;
    setOpeningAccountId(account.id);
    try {
      await openLoginWebview(account, selectedStation.website);
    } finally {
      setOpeningAccountId((current) => (current === account.id ? null : current));
    }
  };

  const handleSelectStation = (id: string) => {
    setSelectedStationId(id);
    const first = accounts.find((a) => a.stationId === id);
    setSelectedAccountId(first?.id ?? "");
  };

  const handleRefreshAccount = (account: StationAccount) =>
    runAccountRefresh(account.id, async () => {
      try {
        const updated = await api.refreshAccount(account.id);
        setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        if (updated.status === "fetchFailed") {
          toast.warning(
            t("accountManager.toasts.refreshAccountFetchFailed", { name: updated.username })
          );
        } else {
          toast.success(
            t("accountManager.toasts.refreshAccountSuccess", { name: updated.username })
          );
        }
      } catch (error) {
        const info = classifyAccountManagerError(error, t("accountManager.toasts.refreshAccountFailed"));
        toast.error(t(`accountManager.toasts.${info.kind}`));
      }
    });

  const handleRefreshStation = (stationId: string) => {
    if (!stationId) return;
    return runStationRefresh(stationId, async () => {
      try {
        const subset = await api.refreshStation(stationId);
        const byId = new Map(subset.map((a) => [a.id, a] as const));
        setAccounts((prev) => prev.map((a) => byId.get(a.id) ?? a));
        const failed = subset.filter((a) => a.status === "fetchFailed").length;
        if (failed > 0) {
          toast.warning(
            t("accountManager.toasts.refreshBatchFetchFailed", { failed, total: subset.length })
          );
        } else {
          toast.success(
            t("accountManager.toasts.refreshStationSuccess", { count: subset.length })
          );
        }
      } catch (error) {
        const info = classifyAccountManagerError(error, t("accountManager.toasts.refreshStationFailed"));
        toast.error(t(`accountManager.toasts.${info.kind}`));
      }
    });
  };

  const handleRefreshAll = () =>
    runAllRefresh(async () => {
      try {
        const all = await api.refreshAll();
        setAccounts(all);
        const failed = all.filter((a) => a.status === "fetchFailed").length;
        if (failed > 0) {
          toast.warning(
            t("accountManager.toasts.refreshBatchFetchFailed", { failed, total: all.length })
          );
        } else {
          toast.success(t("accountManager.toasts.refreshAllSuccess", { count: all.length }));
        }
      } catch (error) {
        const info = classifyAccountManagerError(error, t("accountManager.toasts.refreshAllFailed"));
        toast.error(t(`accountManager.toasts.${info.kind}`));
      }
    });

  const handleToggleProxy = (accountId: string, enabled: boolean) =>
    runToggleProxy(accountId, async () => {
      try {
        const updated = await api.setAccountProxyEnabled(accountId, enabled);
        setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        toast.success(t("accountManager.toasts.updateProxySuccess"));
      } catch {
        toast.error(t("accountManager.toasts.updateProxyFailed"));
      }
    });

  const handleRevealPassword = async (accountId: string) => {
    return api.revealPassword(accountId);
  };

  const handleCopyPassword = async (accountId: string) => {
    await api.copyPasswordToClipboard(accountId);
  };

  const handleProbeStrategyChange = (stationId: string, next: ProbeStrategy | "auto") =>
    runProbeStrategyChange(stationId, async () => {
      try {
        if (next === "auto") {
          const updated = await api.resetProbeStrategy(stationId);
          setStations((prev) =>
            prev.map((s) => (s.id === stationId ? { ...s, ...updated } : s))
          );
        } else {
          const updated = await api.setProbeStrategy(stationId, next);
          setStations((prev) =>
            prev.map((s) => (s.id === stationId ? { ...s, ...updated } : s))
          );
        }
      } catch {
        toast.error(t("accountManager.toasts.updateProbeStrategyFailed"));
      }
    });

  const handleExportData = async () => {
    if (exportingData) return;
    const selected = await savePlatformDialog({
      canCreateDirectories: true,
      defaultPath: "relay-data-export.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selected) return;
    setExportingData(true);
    try {
      const result = await api.exportRelayData(selected);
      toast.success(
        t("accountManager.toasts.exportSuccess", {
          stations: result.stationCount,
          accounts: result.accountCount,
        })
      );
    } catch (error) {
      const info = classifyAccountManagerError(error, t("accountManager.toasts.exportFailed"));
      toast.error(t(`accountManager.toasts.${info.kind}`, { defaultValue: info.message }));
    } finally {
      setExportingData(false);
    }
  };

  const handleImportData = async () => {
    if (importingData) return;
    const selected = await openPlatformDialog({
      directory: false,
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    setImportingData(true);
    try {
      const result = await api.importRelayData(selected);
      setStations(result.stations);
      setAccounts(result.accounts);
      const firstStationId = result.stations[0]?.id ?? "";
      const nextStationId =
        selectedStationId && result.stations.some((station) => station.id === selectedStationId)
          ? selectedStationId
          : firstStationId;
      const nextAccountId =
        selectedAccountId &&
        result.accounts.some(
          (account) => account.id === selectedAccountId && account.stationId === nextStationId,
        )
          ? selectedAccountId
          : (result.accounts.find((account) => account.stationId === nextStationId)?.id ?? "");
      setSelectedStationId(nextStationId);
      setSelectedAccountId(nextAccountId);
      toast.success(
        t("accountManager.toasts.importSuccess", {
          stations: result.stationCount,
          accounts: result.accountCount,
        })
      );
    } catch (error) {
      const info = classifyAccountManagerError(error, t("accountManager.toasts.importFailed"));
      toast.error(t(`accountManager.toasts.${info.kind}`, { defaultValue: info.message }));
    } finally {
      setImportingData(false);
    }
  };

  const handleEditStation = async (
    remark: string,
    website: string,
    sessionSettings?: SessionSettings
  ) => {
    if (!editingStation) return false;
    try {
      const updated = await api.updateStation(editingStation.id, {
        remark,
        website,
      });
      if (sessionSettings) {
        const promises: Promise<unknown>[] = [];
        if (sessionSettings.probeOverride) {
          promises.push(api.setProbeStrategy(editingStation.id, sessionSettings.probeStrategy));
        }
        if (sessionSettings.sessionTtlHours !== (editingStation.sessionTtlHours ?? 720)) {
          promises.push(api.setSessionTtl(editingStation.id, sessionSettings.sessionTtlHours));
        }
        await Promise.all(promises);
      }
      setStations((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditStationOpen(false);
      setEditingStation(null);
      return true;
    } catch (error) {
      toast.error(t("accountManager.toasts.updateStationFailed"));
      return false;
    }
  };

  const handleEditAccount = async (
    username: string,
    notes: string,
    password: string | null,
    proxyEnabled: boolean
  ) => {
    if (!editingAccount) return false;
    const trimmed = username.trim();
    const duplicate = accounts.some(
      (a) =>
        a.stationId === editingAccount.stationId &&
        a.id !== editingAccount.id &&
        a.username === trimmed
    );
    if (duplicate) {
      toast.error(t("accountManager.toasts.duplicateUsername"));
      return false;
    }
    let updated: StationAccount;
    try {
      updated = await api.updateAccount(editingAccount.id, {
        username,
        notes,
      });
    } catch (error) {
      toast.error(t("accountManager.toasts.updateAccountFailed"));
      return false;
    }
    let passwordChanged = false;
    if (password !== null) {
      try {
        await api.setPassword(editingAccount.id, password);
        updated.hasPassword = password.length > 0;
        passwordChanged = true;
      } catch (error) {
        updated.hasPassword = editingAccount.hasPassword;
        updated.proxyEnabled = proxyEnabled;
        setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setEditAccountOpen(false);
        setEditingAccount(null);
        toast.error(t("accountManager.toasts.updatePasswordFailed"));
        return passwordChanged;
      }
    } else {
      updated.hasPassword = editingAccount.hasPassword;
    }
    try {
      updated = await api.setAccountProxyEnabled(editingAccount.id, proxyEnabled);
    } catch {
      toast.error(t("accountManager.toasts.updateProxyFailed"));
    }
    setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setEditAccountOpen(false);
    setEditingAccount(null);
    return true;
  };

  const handleDeleteStation = () =>
    runDeleteStation(async () => {
      if (!deletingStation) return;
      const target = deletingStation;
      const wasSelected = selectedStationId === target.id;
      const remainingStations = stations.filter((s) => s.id !== target.id);
      const newStationId = wasSelected ? (remainingStations[0]?.id ?? "") : selectedStationId;
      const newAccountId = wasSelected
        ? (accounts.find((a) => a.stationId === newStationId)?.id ?? "")
        : selectedAccountId;
      try {
        await api.deleteStation(target.id);
        setStations((prev) => prev.filter((s) => s.id !== target.id));
        setAccounts((prev) => prev.filter((a) => a.stationId !== target.id));
        if (wasSelected) {
          setSelectedStationId(newStationId);
          setSelectedAccountId(newAccountId);
        }
        setDeleteStationOpen(false);
        setDeletingStation(null);
        toast.success(t("accountManager.toasts.deleteStationSuccess", { name: target.remark }));
      } catch {
        toast.error(t("accountManager.toasts.deleteStationFailed"));
      }
    });

  const handleDeleteAccount = () =>
    runDeleteAccount(async () => {
      if (!deletingAccount) return;
      const target = deletingAccount;
      const wasSelected = selectedAccountId === target.id;
      const nextAccountId = wasSelected
        ? (accounts.find((a) => a.id !== target.id && a.stationId === target.stationId)?.id ?? "")
        : selectedAccountId;
      try {
        await api.deleteAccount(target.id);
        setAccounts((prev) => prev.filter((a) => a.id !== target.id));
        if (wasSelected) {
          setSelectedAccountId(nextAccountId);
        }
        setDeleteAccountOpen(false);
        setDeletingAccount(null);
        toast.success(t("accountManager.toasts.deleteAccountSuccess", { name: target.username }));
      } catch {
        toast.error(t("accountManager.toasts.deleteAccountFailed"));
      }
    });

  const handleReorderStations = async (orderedIds: string[]) => {
    const prev = stations;
    const map = new Map(prev.map((s) => [s.id, s]));
    const next = orderedIds
      .map((id) => map.get(id))
      .filter((s): s is RelayStation => Boolean(s));
    if (next.length !== prev.length) {
      toast.error(t("accountManager.toasts.reorderMismatch"));
      return;
    }
    setStations(next);
    setReorderingStations(true);
    try {
      const server = await api.reorderStations(orderedIds);
      setStations(server);
      toast.success(t("accountManager.toasts.reorderStationsSuccess"));
    } catch (error) {
      setStations(prev);
      toast.error(t("accountManager.toasts.reorderStationsFailed"));
      if (isInvalidInput(error)) {
        try {
          const fresh = await api.listStations();
          setStations(fresh);
        } catch {
          // ignore — user can refresh manually
        }
      }
    } finally {
      setReorderingStations(false);
    }
  };

  const handleReorderAccounts = async (orderedIds: string[]) => {
    if (!selectedStationId) return;
    const stationId = selectedStationId;
    const prev = accounts;
    const mineMap = new Map(
      prev.filter((a) => a.stationId === stationId).map((a) => [a.id, a])
    );
    const newMine = orderedIds
      .map((id) => mineMap.get(id))
      .filter((a): a is StationAccount => Boolean(a));
    if (newMine.length !== mineMap.size) {
      toast.error(t("accountManager.toasts.reorderMismatch"));
      return;
    }
    let mineIter = 0;
    const optimistic = prev.map((a) =>
      a.stationId === stationId ? newMine[mineIter++] : a
    );
    setAccounts(optimistic);
    setReorderingAccounts(true);
    try {
      const serverMine = await api.reorderAccounts(stationId, orderedIds);
      let serverIter = 0;
      setAccounts((current) =>
        current.map((a) => (a.stationId === stationId ? serverMine[serverIter++] : a))
      );
      toast.success(t("accountManager.toasts.reorderAccountsSuccess"));
    } catch (error) {
      setAccounts(prev);
      toast.error(t("accountManager.toasts.reorderAccountsFailed"));
      if (isInvalidInput(error)) {
        try {
          const fresh = await api.listAllAccounts();
          setAccounts(fresh);
        } catch {
          // ignore
        }
      }
    } finally {
      setReorderingAccounts(false);
    }
  };

  return {
    // 数据 & 派生
    stations,
    accounts,
    loading,
    loadError,
    loadInitialData,
    selectedStation,
    selectedAccount,
    stationAccounts,
    accountCountByStation,
    selectedStationId,
    selectedAccountId,
    setSelectedAccountId,
    openingAccountId,
    refreshingAccountIds,
    refreshingStationIds,
    refreshingAll,
    importingData,
    exportingData,
    reorderingStations,
    reorderingAccounts,
    quickLoginPending,
    deletingStationPending,
    deletingAccountPending,
    togglingProxyIds,
    redetectingStationIds,
    settingProbeStrategyIds,
    // 对话框状态
    isAddStationOpen,
    setAddStationOpen,
    isAddAccountOpen,
    setAddAccountOpen,
    isEditStationOpen,
    setEditStationOpen,
    editingStation,
    setEditingStation,
    isEditAccountOpen,
    setEditAccountOpen,
    editingAccount,
    setEditingAccount,
    isDeleteStationOpen,
    setDeleteStationOpen,
    deletingStation,
    setDeletingStation,
    isDeleteAccountOpen,
    setDeleteAccountOpen,
    deletingAccount,
    setDeletingAccount,
    isQuickLoginOpen,
    setQuickLoginOpen,
    isExternalAppsOpen,
    setExternalAppsOpen,
    externalAppsAccountId,
    handleOpenExternalApps,
    // 外部登录代理
    ...authProxy,
    // 快速登录历史
    readQuickLoginHistory,
    // 处理器
    handleAddStation,
    handleQuickLogin,
    handleRedetectProfile,
    handleAddAccount,
    handleLogin,
    handleSelectStation,
    handleRefreshAccount,
    handleRefreshStation,
    handleRefreshAll,
    handleToggleProxy,
    handleRevealPassword,
    handleCopyPassword,
    handleProbeStrategyChange,
    handleExportData,
    handleImportData,
    handleEditStation,
    handleEditAccount,
    handleDeleteStation,
    handleDeleteAccount,
    handleReorderStations,
    handleReorderAccounts,
  };
}
