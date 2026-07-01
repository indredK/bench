/**
 * api-billing controller / 中转站控制器: owns all page state + async orchestration.
 * The page component stays a thin composition layer over what this hook returns.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { openExternal } from "@/platform/shell";
import { openPlatformDialog, savePlatformDialog } from "@/platform/dialog";
import { canUseTauriWindow } from "@/platform/capabilities";
import * as api from "@/features/api-billing/api";
import { classifyApiBillingError } from "@/features/api-billing/error-classifier";
import type { RelayStation, StationAccount } from "@/features/api-billing/api";
import { useGuardedAsync, useGuardedAsyncSet } from "@/hooks/useGuardedAsync";
import type { SessionSettings } from "@/features/api-billing/model/types";
import { useAuthProxy } from "@/features/api-billing/hooks/useAuthProxy";
import { useQuickLoginHistory } from "@/features/api-billing/hooks/useQuickLoginHistory";

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

export function useApiBillingController() {
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
      const info = classifyApiBillingError(error, t("apiBilling.toasts.initFailed"));
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
      toast.error(t("apiBilling.toasts.createStationFailed"));
      return false;
    }
  };

  const handleQuickLogin = async (
    url: string,
    username: string,
    destroyOnClose: boolean,
    stationId?: string | null,
  ) => {
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
      // 把账号挂到内存列表（不持久化退出即清空，与设计文档一致）
      setAccounts((prev) => [...prev, account]);
      // 打开 WebView 登录窗口(走 mark_account_logged_in 触发自动 capture+detect)
      await api.openLoginWindow(account.id);
      pushQuickLoginHistory(normalized);
      setQuickLoginOpen(false);

      // 如果勾选了"关闭后销毁"，监听窗口关闭并删除账号
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

      toast.success(t("apiBilling.sessionManager.quickLogin.startedToast"));
    } catch (error) {
      toast.error(t("apiBilling.sessionManager.quickLogin.failedToast"));
    }
  };

  // AuthProfile 重新检测：需先打开该站点的登录窗口并完成登录
  const handleRedetectProfile = async (stationId: string) => {
    try {
      const profile = await api.detectStationAuthProfile(stationId);
      setStations((prev) =>
        prev.map((s) => (s.id === stationId ? { ...s, authProfile: profile } : s))
      );
      toast.success(t("apiBilling.sessionManager.authProfile.redetectSuccess"));
    } catch (error) {
      toast.error(t("apiBilling.sessionManager.authProfile.redetectFailed"));
    }
  };

  const handleAddAccount = async (username: string, password: string, notes: string) => {
    if (!selectedStation) return false;
    const trimmed = username.trim();
    const duplicate = accounts.some(
      (a) => a.stationId === selectedStation.id && a.username === trimmed,
    );
    if (duplicate) {
      toast.error(t("apiBilling.toasts.duplicateUsername"));
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
      toast.error(t("apiBilling.toasts.createAccountFailed"));
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
            t("apiBilling.toasts.refreshAccountFetchFailed", { name: updated.username })
          );
        } else {
          toast.success(
            t("apiBilling.toasts.refreshAccountSuccess", { name: updated.username })
          );
        }
      } catch (error) {
        const info = classifyApiBillingError(error, t("apiBilling.toasts.refreshAccountFailed"));
        toast.error(t(`apiBilling.toasts.${info.kind}`));
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
            t("apiBilling.toasts.refreshBatchFetchFailed", { failed, total: subset.length })
          );
        } else {
          toast.success(
            t("apiBilling.toasts.refreshStationSuccess", { count: subset.length })
          );
        }
      } catch (error) {
        const info = classifyApiBillingError(error, t("apiBilling.toasts.refreshStationFailed"));
        toast.error(t(`apiBilling.toasts.${info.kind}`));
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
            t("apiBilling.toasts.refreshBatchFetchFailed", { failed, total: all.length })
          );
        } else {
          toast.success(t("apiBilling.toasts.refreshAllSuccess", { count: all.length }));
        }
      } catch (error) {
        const info = classifyApiBillingError(error, t("apiBilling.toasts.refreshAllFailed"));
        toast.error(t(`apiBilling.toasts.${info.kind}`));
      }
    });

  const handleToggleProxy = async (accountId: string, enabled: boolean) => {
    try {
      const updated = await api.setAccountProxyEnabled(accountId, enabled);
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch {
      toast.error(t("apiBilling.toasts.updateProxyFailed"));
    }
  };

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
        t("apiBilling.toasts.exportSuccess", {
          stations: result.stationCount,
          accounts: result.accountCount,
        })
      );
    } catch (error) {
      const info = classifyApiBillingError(error, t("apiBilling.toasts.exportFailed"));
      toast.error(t(`apiBilling.toasts.${info.kind}`, { defaultValue: info.message }));
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
        t("apiBilling.toasts.importSuccess", {
          stations: result.stationCount,
          accounts: result.accountCount,
        })
      );
    } catch (error) {
      const info = classifyApiBillingError(error, t("apiBilling.toasts.importFailed"));
      toast.error(t(`apiBilling.toasts.${info.kind}`, { defaultValue: info.message }));
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
      toast.error(t("apiBilling.toasts.updateStationFailed"));
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
      toast.error(t("apiBilling.toasts.duplicateUsername"));
      return false;
    }
    let updated: StationAccount;
    try {
      updated = await api.updateAccount(editingAccount.id, {
        username,
        notes,
      });
    } catch (error) {
      toast.error(t("apiBilling.toasts.updateAccountFailed"));
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
        toast.error(t("apiBilling.toasts.updatePasswordFailed"));
        return passwordChanged;
      }
    } else {
      updated.hasPassword = editingAccount.hasPassword;
    }
    try {
      updated = await api.setAccountProxyEnabled(editingAccount.id, proxyEnabled);
    } catch {
      toast.error(t("apiBilling.toasts.updateProxyFailed"));
    }
    setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setEditAccountOpen(false);
    setEditingAccount(null);
    return true;
  };

  const handleDeleteStation = async () => {
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
    } catch (error) {
      toast.error(t("apiBilling.toasts.deleteStationFailed"));
    }
  };

  const handleDeleteAccount = async () => {
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
    } catch (error) {
      toast.error(t("apiBilling.toasts.deleteAccountFailed"));
    }
  };

  const handleReorderStations = async (orderedIds: string[]) => {
    const prev = stations;
    const map = new Map(prev.map((s) => [s.id, s]));
    const next = orderedIds
      .map((id) => map.get(id))
      .filter((s): s is RelayStation => Boolean(s));
    if (next.length !== prev.length) return;
    setStations(next);
    setReorderingStations(true);
    try {
      const server = await api.reorderStations(orderedIds);
      setStations(server);
      toast.success(t("apiBilling.toasts.reorderStationsSuccess"));
    } catch (error) {
      setStations(prev);
      toast.error(t("apiBilling.toasts.reorderStationsFailed"));
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
    if (newMine.length !== mineMap.size) return;
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
      toast.success(t("apiBilling.toasts.reorderAccountsSuccess"));
    } catch (error) {
      setAccounts(prev);
      toast.error(t("apiBilling.toasts.reorderAccountsFailed"));
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
