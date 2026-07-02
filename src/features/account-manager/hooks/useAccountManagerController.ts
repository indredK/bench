/**
 * account-manager controller / 账号管理控制器: wires store, use-cases, and sub-hooks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { classifyAccountManagerError } from "@/features/account-manager/error-classifier";
import {
  accountManagerUseCases,
  isInvalidInput,
  openLoginWebview,
} from "@/features/account-manager/services/account-manager.use-cases";
import {
  selectAccountCountByStation,
  selectSelectedAccount,
  selectStation,
  selectStationAccounts,
} from "@/features/account-manager/model/selectors";
import type { SessionSettings } from "@/features/account-manager/model/types";
import { useAccountManagerStore } from "@/features/account-manager/store";
import { useAuthProxy } from "@/features/account-manager/hooks/useAuthProxy";
import { useQuickLoginHistory } from "@/features/account-manager/hooks/useQuickLoginHistory";
import { useGuardedAsync, useGuardedAsyncSet } from "@/hooks/useGuardedAsync";
import type { ProbeStrategy, StationAccount } from "@/lib/tauri/types/account-manager";

export function useAccountManagerController() {
  const { t } = useTranslation();
  const store = useAccountManagerStore();
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

  const [justRefreshedIds, setJustRefreshedIds] = useState<Set<string>>(new Set());
  const justRefreshedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const markJustRefreshed = useCallback((accountId: string) => {
    setJustRefreshedIds((prev) => {
      const next = new Set(prev);
      next.add(accountId);
      return next;
    });
    const existing = justRefreshedTimersRef.current.get(accountId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setJustRefreshedIds((prev) => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
      justRefreshedTimersRef.current.delete(accountId);
    }, 1500);
    justRefreshedTimersRef.current.set(accountId, timer);
  }, []);

  useEffect(() => {
    return () => {
      justRefreshedTimersRef.current.forEach((timer) => clearTimeout(timer));
      justRefreshedTimersRef.current.clear();
    };
  }, []);

  const authProxy = useAuthProxy();
  const { readQuickLoginHistory, pushQuickLoginHistory } = useQuickLoginHistory();

  const loadInitialData = useCallback(async () => {
    const s = useAccountManagerStore.getState();
    s.setLoading(true);
    s.setLoadError(null);
    try {
      const [stations, accounts] = await accountManagerUseCases.loadInitialData();
      s.setStations(stations);
      s.setAccounts(accounts);
      s.applyInitialSelection(stations, accounts);
    } catch (error) {
      const info = classifyAccountManagerError(error, t("accountManager.toasts.initFailed"));
      useAccountManagerStore.getState().setLoadError(info.message);
      throw error;
    } finally {
      useAccountManagerStore.getState().setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadInitialData().catch(() => undefined);
  }, [loadInitialData]);

  const selectedStation = useMemo(
    () => selectStation(store.stations, store.selectedStationId),
    [store.stations, store.selectedStationId],
  );
  const stationAccounts = useMemo(
    () => selectStationAccounts(store.accounts, store.selectedStationId),
    [store.accounts, store.selectedStationId],
  );
  const accountCountByStation = useMemo(
    () => selectAccountCountByStation(store.accounts),
    [store.accounts],
  );
  const selectedAccount = useMemo(
    () => selectSelectedAccount(stationAccounts, store.selectedAccountId),
    [stationAccounts, store.selectedAccountId],
  );

  const handleOpenExternalApps = useCallback(
    (accountId: string | null) => {
      store.setExternalAppsAccountId(accountId);
      store.setExternalAppsOpen(true);
    },
    [store],
  );

  const handleAddStation = async (
    remark: string,
    website: string,
    sessionSettings?: SessionSettings,
  ) => {
    try {
      const station = await accountManagerUseCases.addStation(
        remark,
        website,
        sessionSettings,
      );
      store.setStations((prev) => [...prev, station]);
      store.setSelectedStationId(station.id);
      store.setSelectedAccountId("");
      store.setAddStationOpen(false);
      return true;
    } catch {
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
        const { account, normalized } = await accountManagerUseCases.quickLogin(
          url,
          username,
          stationId,
        );
        store.setAccounts((prev) => [...prev, account]);
        pushQuickLoginHistory(normalized);
        store.setQuickLoginOpen(false);

        if (destroyOnClose) {
          const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
          const ww = await WebviewWindow.getByLabel(`relay-login-${account.id}`);
          if (ww) {
            const unlisten = await ww.onCloseRequested(async () => {
              unlisten();
              store.setAccounts((prev) => prev.filter((a) => a.id !== account.id));
              try {
                await accountManagerUseCases.deleteAccount(account.id);
              } catch {
                /* ignore */
              }
            });
          }
        }

        toast.success(t("accountManager.sessionManager.quickLogin.startedToast"));
      } catch {
        toast.error(t("accountManager.sessionManager.quickLogin.failedToast"));
      }
    });

  const handleRedetectProfile = (stationId: string, accountId?: string) =>
    runRedetectProfile(stationId, async () => {
      try {
        const profile = await accountManagerUseCases.redetectAuthProfile(stationId, accountId);
        store.setStations((prev) =>
          prev.map((station) =>
            station.id === stationId ? { ...station, authProfile: profile } : station,
          ),
        );
        toast.success(t("accountManager.sessionManager.authProfile.redetectSuccess"));
      } catch {
        toast.error(t("accountManager.sessionManager.authProfile.redetectFailed"));
      }
    });

  const handleAddAccount = async (username: string, password: string, notes: string) => {
    if (!selectedStation) return false;
    if (
      accountManagerUseCases.hasDuplicateUsername(
        store.accounts,
        selectedStation.id,
        username,
      )
    ) {
      toast.error(t("accountManager.toasts.duplicateUsername"));
      return false;
    }
    try {
      const account = await accountManagerUseCases.addAccount(
        selectedStation.id,
        username,
        password,
        notes,
      );
      store.setAccounts((prev) => [...prev, account]);
      store.setSelectedAccountId(account.id);
      store.setAddAccountOpen(false);
      return true;
    } catch {
      toast.error(t("accountManager.toasts.createAccountFailed"));
      return false;
    }
  };

  const handleLogin = async (account: StationAccount) => {
    if (!selectedStation) return;
    store.setOpeningAccountId(account.id);
    try {
      await openLoginWebview(account, selectedStation.website);
    } finally {
      store.setOpeningAccountId((current) => (current === account.id ? null : current));
    }
  };

  const handleSelectStation = (id: string) => {
    store.selectStation(id, store.accounts);
  };

  const handleRefreshAccount = (account: StationAccount) =>
    runAccountRefresh(account.id, async () => {
      try {
        const updated = await accountManagerUseCases.refreshAccount(account.id);
        store.setAccounts((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
        markJustRefreshed(updated.id);
        if (updated.status === "fetchFailed") {
          toast.warning(
            t("accountManager.toasts.refreshAccountFetchFailed", { name: updated.username }),
          );
        } else {
          toast.success(
            t("accountManager.toasts.refreshAccountSuccess", { name: updated.username }),
          );
        }
      } catch (error) {
        const info = classifyAccountManagerError(
          error,
          t("accountManager.toasts.refreshAccountFailed"),
        );
        toast.error(t(`accountManager.toasts.${info.kind}`));
      }
    });

  const handleRefreshStation = (stationId: string) => {
    if (!stationId) return;
    return runStationRefresh(stationId, async () => {
      try {
        const subset = await accountManagerUseCases.refreshStation(stationId);
        const byId = new Map(subset.map((account) => [account.id, account] as const));
        store.setAccounts((prev) => prev.map((account) => byId.get(account.id) ?? account));
        subset.forEach((account) => markJustRefreshed(account.id));
        const failed = subset.filter((account) => account.status === "fetchFailed").length;
        if (failed > 0) {
          toast.warning(
            t("accountManager.toasts.refreshBatchFetchFailed", {
              failed,
              total: subset.length,
            }),
          );
        } else {
          toast.success(
            t("accountManager.toasts.refreshStationSuccess", { count: subset.length }),
          );
        }
      } catch (error) {
        const info = classifyAccountManagerError(
          error,
          t("accountManager.toasts.refreshStationFailed"),
        );
        toast.error(t(`accountManager.toasts.${info.kind}`));
      }
    });
  };

  const handleRefreshAll = () =>
    runAllRefresh(async () => {
      try {
        const all = await accountManagerUseCases.refreshAll();
        store.setAccounts(all);
        all.forEach((account) => markJustRefreshed(account.id));
        const failed = all.filter((account) => account.status === "fetchFailed").length;
        if (failed > 0) {
          toast.warning(
            t("accountManager.toasts.refreshBatchFetchFailed", { failed, total: all.length }),
          );
        } else {
          toast.success(t("accountManager.toasts.refreshAllSuccess", { count: all.length }));
        }
      } catch (error) {
        const info = classifyAccountManagerError(
          error,
          t("accountManager.toasts.refreshAllFailed"),
        );
        toast.error(t(`accountManager.toasts.${info.kind}`));
      }
    });

  const handleToggleProxy = (accountId: string, enabled: boolean) =>
    runToggleProxy(accountId, async () => {
      try {
        const updated = await accountManagerUseCases.toggleProxy(accountId, enabled);
        store.setAccounts((prev) =>
          prev.map((account) => (account.id === updated.id ? updated : account)),
        );
        toast.success(t("accountManager.toasts.updateProxySuccess"));
      } catch {
        toast.error(t("accountManager.toasts.updateProxyFailed"));
      }
    });

  const handleRevealPassword = (accountId: string) =>
    accountManagerUseCases.revealPassword(accountId);

  const handleCopyPassword = (accountId: string) =>
    accountManagerUseCases.copyPassword(accountId);

  const handleProbeStrategyChange = (stationId: string, next: ProbeStrategy | "auto") =>
    runProbeStrategyChange(stationId, async () => {
      try {
        const updated = await accountManagerUseCases.changeProbeStrategy(stationId, next);
        store.setStations((prev) =>
          prev.map((station) => (station.id === stationId ? { ...station, ...updated } : station)),
        );
      } catch {
        toast.error(t("accountManager.toasts.updateProbeStrategyFailed"));
      }
    });

  const handleExportData = async () => {
    if (store.exportingData) return;
    store.setExportingData(true);
    try {
      const result = await accountManagerUseCases.exportData();
      if (!result) return;
      toast.success(
        t("accountManager.toasts.exportSuccess", {
          stations: result.stationCount,
          accounts: result.accountCount,
        }),
      );
    } catch (error) {
      const info = classifyAccountManagerError(error, t("accountManager.toasts.exportFailed"));
      toast.error(t(`accountManager.toasts.${info.kind}`, { defaultValue: info.message }));
    } finally {
      store.setExportingData(false);
    }
  };

  const handleImportData = async () => {
    if (store.importingData) return;
    store.setImportingData(true);
    try {
      const result = await accountManagerUseCases.importData();
      if (!result) return;
      store.setStations(result.stations);
      store.setAccounts(result.accounts);
      const { stationId, accountId } = accountManagerUseCases.resolveImportSelection(
        result,
        store.selectedStationId,
        store.selectedAccountId,
      );
      store.setSelectedStationId(stationId);
      store.setSelectedAccountId(accountId);
      toast.success(
        t("accountManager.toasts.importSuccess", {
          stations: result.stationCount,
          accounts: result.accountCount,
        }),
      );
    } catch (error) {
      const info = classifyAccountManagerError(error, t("accountManager.toasts.importFailed"));
      toast.error(t(`accountManager.toasts.${info.kind}`, { defaultValue: info.message }));
    } finally {
      store.setImportingData(false);
    }
  };

  const handleEditStation = async (
    remark: string,
    website: string,
    sessionSettings?: SessionSettings,
  ) => {
    if (!store.editingStation) return false;
    try {
      const updated = await accountManagerUseCases.editStation(
        store.editingStation,
        remark,
        website,
        sessionSettings,
      );
      store.setStations((prev) =>
        prev.map((station) => (station.id === updated.id ? updated : station)),
      );
      store.setEditStationOpen(false);
      store.setEditingStation(null);
      return true;
    } catch {
      toast.error(t("accountManager.toasts.updateStationFailed"));
      return false;
    }
  };

  const handleEditAccount = async (
    username: string,
    notes: string,
    password: string | null,
    proxyEnabled: boolean,
  ) => {
    if (!store.editingAccount) return false;
    if (
      accountManagerUseCases.hasDuplicateUsername(
        store.accounts,
        store.editingAccount.stationId,
        username,
        store.editingAccount.id,
      )
    ) {
      toast.error(t("accountManager.toasts.duplicateUsername"));
      return false;
    }
    try {
      const result = await accountManagerUseCases.editAccount(
        store.editingAccount,
        username,
        notes,
        password,
        proxyEnabled,
      );
      store.setAccounts((prev) =>
        prev.map((account) => (account.id === result.updated.id ? result.updated : account)),
      );
      store.setEditAccountOpen(false);
      store.setEditingAccount(null);
      if (result.passwordFailed) {
        toast.error(t("accountManager.toasts.updatePasswordFailed"));
        return false;
      }
      if (result.proxyFailed) {
        toast.error(t("accountManager.toasts.updateProxyFailed"));
        return false;
      }
      return true;
    } catch {
      toast.error(t("accountManager.toasts.updateAccountFailed"));
      return false;
    }
  };

  const handleDeleteStation = () =>
    runDeleteStation(async () => {
      if (!store.deletingStation) return;
      const target = store.deletingStation;
      const { wasSelected, newStationId, newAccountId } =
        accountManagerUseCases.buildStationDeleteSelection(
          store.stations,
          store.accounts,
          target,
          store.selectedStationId,
          store.selectedAccountId,
        );
      try {
        await accountManagerUseCases.deleteStation(target.id);
        store.setStations((prev) => prev.filter((station) => station.id !== target.id));
        store.setAccounts((prev) => prev.filter((account) => account.stationId !== target.id));
        if (wasSelected) {
          store.setSelectedStationId(newStationId);
          store.setSelectedAccountId(newAccountId);
        }
        store.setDeleteStationOpen(false);
        store.setDeletingStation(null);
        toast.success(t("accountManager.toasts.deleteStationSuccess", { name: target.remark }));
      } catch {
        toast.error(t("accountManager.toasts.deleteStationFailed"));
      }
    });

  const handleDeleteAccount = () =>
    runDeleteAccount(async () => {
      if (!store.deletingAccount) return;
      const target = store.deletingAccount;
      const { wasSelected, nextAccountId } =
        accountManagerUseCases.buildAccountDeleteSelection(
          store.accounts,
          target,
          store.selectedAccountId,
        );
      try {
        await accountManagerUseCases.deleteAccount(target.id);
        store.setAccounts((prev) => prev.filter((account) => account.id !== target.id));
        if (wasSelected) {
          store.setSelectedAccountId(nextAccountId);
        }
        store.setDeleteAccountOpen(false);
        store.setDeletingAccount(null);
        toast.success(t("accountManager.toasts.deleteAccountSuccess", { name: target.username }));
      } catch {
        toast.error(t("accountManager.toasts.deleteAccountFailed"));
      }
    });

  const handleReorderStations = async (orderedIds: string[]) => {
    const prev = store.stations;
    const { next, mismatch } = accountManagerUseCases.buildOptimisticStationOrder(
      prev,
      orderedIds,
    );
    if (mismatch) {
      toast.error(t("accountManager.toasts.reorderMismatch"));
      return;
    }
    store.setStations(next);
    store.setReorderingStations(true);
    try {
      const server = await accountManagerUseCases.reorderStations(orderedIds);
      store.setStations(server);
      toast.success(t("accountManager.toasts.reorderStationsSuccess"));
    } catch (error) {
      store.setStations(prev);
      toast.error(t("accountManager.toasts.reorderStationsFailed"));
      if (isInvalidInput(error)) {
        try {
          store.setStations(await accountManagerUseCases.loadInitialData().then(([s]) => s));
        } catch {
          /* ignore */
        }
      }
    } finally {
      store.setReorderingStations(false);
    }
  };

  const handleReorderAccounts = async (orderedIds: string[]) => {
    if (!store.selectedStationId) return;
    const stationId = store.selectedStationId;
    const prev = store.accounts;
    const built = accountManagerUseCases.buildOptimisticAccountOrder(
      prev,
      stationId,
      orderedIds,
    );
    if (built.mismatch) {
      toast.error(t("accountManager.toasts.reorderMismatch"));
      return;
    }
    store.setAccounts(built.optimistic);
    store.setReorderingAccounts(true);
    try {
      const serverMine = await accountManagerUseCases.reorderAccounts(stationId, orderedIds);
      let serverIter = 0;
      store.setAccounts((current) =>
        current.map((account) =>
          account.stationId === stationId ? serverMine[serverIter++] : account,
        ),
      );
      toast.success(t("accountManager.toasts.reorderAccountsSuccess"));
    } catch (error) {
      store.setAccounts(prev);
      toast.error(t("accountManager.toasts.reorderAccountsFailed"));
      if (isInvalidInput(error)) {
        try {
          const [, accounts] = await accountManagerUseCases.loadInitialData();
          store.setAccounts(accounts);
        } catch {
          /* ignore */
        }
      }
    } finally {
      store.setReorderingAccounts(false);
    }
  };

  return {
    stations: store.stations,
    accounts: store.accounts,
    loading: store.loading,
    loadError: store.loadError,
    loadInitialData,
    selectedStation,
    selectedAccount,
    stationAccounts,
    accountCountByStation,
    selectedStationId: store.selectedStationId,
    selectedAccountId: store.selectedAccountId,
    setSelectedAccountId: store.setSelectedAccountId,
    openingAccountId: store.openingAccountId,
    refreshingAccountIds,
    refreshingStationIds,
    refreshingAll,
    justRefreshedIds,
    importingData: store.importingData,
    exportingData: store.exportingData,
    reorderingStations: store.reorderingStations,
    reorderingAccounts: store.reorderingAccounts,
    quickLoginPending,
    deletingStationPending,
    deletingAccountPending,
    togglingProxyIds,
    redetectingStationIds,
    settingProbeStrategyIds,
    isAddStationOpen: store.isAddStationOpen,
    setAddStationOpen: store.setAddStationOpen,
    isAddAccountOpen: store.isAddAccountOpen,
    setAddAccountOpen: store.setAddAccountOpen,
    isEditStationOpen: store.isEditStationOpen,
    setEditStationOpen: store.setEditStationOpen,
    editingStation: store.editingStation,
    setEditingStation: store.setEditingStation,
    isEditAccountOpen: store.isEditAccountOpen,
    setEditAccountOpen: store.setEditAccountOpen,
    editingAccount: store.editingAccount,
    setEditingAccount: store.setEditingAccount,
    isDeleteStationOpen: store.isDeleteStationOpen,
    setDeleteStationOpen: store.setDeleteStationOpen,
    deletingStation: store.deletingStation,
    setDeletingStation: store.setDeletingStation,
    isDeleteAccountOpen: store.isDeleteAccountOpen,
    setDeleteAccountOpen: store.setDeleteAccountOpen,
    deletingAccount: store.deletingAccount,
    setDeletingAccount: store.setDeletingAccount,
    isQuickLoginOpen: store.isQuickLoginOpen,
    setQuickLoginOpen: store.setQuickLoginOpen,
    isExternalAppsOpen: store.isExternalAppsOpen,
    setExternalAppsOpen: store.setExternalAppsOpen,
    externalAppsAccountId: store.externalAppsAccountId,
    handleOpenExternalApps,
    ...authProxy,
    readQuickLoginHistory,
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
