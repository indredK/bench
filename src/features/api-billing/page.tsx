import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  BadgeCheck,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Import,
  Inbox,
  KeyRound,
  Link,
  LogIn,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  StickyNote,
  Trash2,
  UserRound,
} from "lucide-react";
import { FeatureLoadError } from "@/components/common/FeatureLoadError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { openExternal } from "@/platform/shell";
import { openPlatformDialog, savePlatformDialog } from "@/platform/dialog";
import { canUseTauriWindow } from "@/platform/capabilities";
import { cn } from "@/lib/utils";
import * as api from "@/features/api-billing/api";
import { classifyApiBillingError } from "@/features/api-billing/error-classifier";
import type {
  AccountSessionStatus,
  ExclusivityMode,
  LoginDetectionConfig,
  LoginDetectionMode,
  LoginDetectionPresence,
  LoginDetectionRule,
  ProbeStrategy,
  RelayStation,
  StationAccount,
} from "@/features/api-billing/api";
import { DEFAULT_LOGIN_DETECTION } from "@/features/api-billing/api";
import { useGuardedAsync, useGuardedAsyncSet } from "@/hooks/useGuardedAsync";
import { SortableList, useSortableCard, DragHandle } from "@/features/api-billing/sortable-card";

type DetailRow = {
  label: string;
  value: string;
  truncate?: boolean;
  copy?: boolean;
  onCopy?: () => void | Promise<void>;
  reveal?: { hidden: boolean; onToggle: () => void; loading?: boolean };
};

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

function ApiBillingPage() {
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (loadError) {
    return (
      <FeatureLoadError
        title={t("apiBilling.loadFailedTitle")}
        description={loadError}
        onRetry={() => void loadInitialData().catch(() => undefined)}
      />
    );
  }

  const handleAddStation = async (
    remark: string,
    website: string,
    loginDetection: LoginDetectionConfig
  ) => {
    try {
      const station = await api.createStation(remark, website, loginDetection);
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

  // 快速登录历史:localStorage 持久化最近 5 个 URL
  const QUICK_LOGIN_HISTORY_KEY = "api-billing.quick-login.history.v1";
  const readQuickLoginHistory = (): string[] => {
    try {
      const raw = localStorage.getItem(QUICK_LOGIN_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  const pushQuickLoginHistory = (url: string) => {
    try {
      const current = readQuickLoginHistory().filter((u) => u !== url);
      const next = [url, ...current].slice(0, 5);
      localStorage.setItem(QUICK_LOGIN_HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* localStorage 不可用时静默忽略 */
    }
  };

  const handleQuickLogin = async (
    url: string,
    username: string,
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

  const handleAddAccount = async (username: string, password: string, notes: string, phone: string, tgAccount: string, linkedAccount: string, inviteLink: string, loginMethods: api.LoginMethod[]) => {
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
        phone || null,
        tgAccount || null,
        linkedAccount || null,
        inviteLink || null,
        loginMethods
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
    loginDetection: LoginDetectionConfig
  ) => {
    if (!editingStation) return false;
    try {
      const updated = await api.updateStation(editingStation.id, {
        remark,
        website,
        loginDetection,
      });
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
    phone: string,
    tgAccount: string,
    linkedAccount: string,
    inviteLink: string,
    loginMethods: api.LoginMethod[]
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
        phone: phone || null,
        tgAccount: tgAccount || null,
        linkedAccount: linkedAccount || null,
        inviteLink: inviteLink || null,
        loginMethods,
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
        setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setEditAccountOpen(false);
        setEditingAccount(null);
        toast.error(t("apiBilling.toasts.updatePasswordFailed"));
        return passwordChanged;
      }
    } else {
      updated.hasPassword = editingAccount.hasPassword;
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

  return (
    <div className="flex h-full min-h-0 gap-4">
      <StationColumn
        stations={stations}
        selectedId={selectedStationId}
        countByStation={accountCountByStation}
        onSelect={handleSelectStation}
        onAdd={() => setAddStationOpen(true)}
        onQuickLogin={() => setQuickLoginOpen(true)}
        onEdit={(station) => { setEditingStation(station); setEditStationOpen(true); }}
        onDelete={(station) => { setDeletingStation(station); setDeleteStationOpen(true); }}
        onReorder={(ids) => void handleReorderStations(ids)}
        reorderDisabled={reorderingStations}
        onRefreshAll={handleRefreshAll}
        refreshingAll={refreshingAll}
        onImportData={() => void handleImportData()}
        onExportData={() => void handleExportData()}
        importingData={importingData}
        exportingData={exportingData}
      />

      <AccountColumn
        station={selectedStation}
        accounts={stationAccounts}
        selectedId={selectedAccount?.id ?? ""}
        openingId={openingAccountId}
        refreshingIds={refreshingAccountIds}
        refreshingStationIds={refreshingStationIds}
        refreshingAll={refreshingAll}
        onSelect={setSelectedAccountId}
        onAdd={() => setAddAccountOpen(true)}
        onLogin={handleLogin}
        onRefresh={handleRefreshAccount}
        onRefreshStation={handleRefreshStation}
        onEdit={(account) => { setEditingAccount(account); setEditAccountOpen(true); }}
        onDelete={(account) => { setDeletingAccount(account); setDeleteAccountOpen(true); }}
        onReorder={(ids) => void handleReorderAccounts(ids)}
        reorderDisabled={reorderingAccounts}
      />

      <DetailColumn
        station={selectedStation}
        account={selectedAccount}
        onOpenWebsite={() => selectedStation && void openExternal(selectedStation.website)}
        onRedetectProfile={handleRedetectProfile}
      />

      <StationDialog
        open={isAddStationOpen || isEditStationOpen}
        station={editingStation}
        onOpenChange={(open) => {
          if (!open) {
            setAddStationOpen(false);
            setEditStationOpen(false);
            setEditingStation(null);
          }
        }}
        onSubmit={editingStation ? handleEditStation : handleAddStation}
      />

      <AddAccountDialog
        open={isAddAccountOpen}
        onOpenChange={setAddAccountOpen}
        stationName={selectedStation?.remark ?? ""}
        onSubmit={handleAddAccount}
      />

      <EditAccountDialog
        open={isEditAccountOpen}
        account={editingAccount}
        stationName={selectedStation?.remark ?? ""}
        onOpenChange={(open) => {
          setEditAccountOpen(open);
          if (!open) setEditingAccount(null);
        }}
        onSubmit={handleEditAccount}
      />

      <QuickLoginDialog
        open={isQuickLoginOpen}
        onOpenChange={setQuickLoginOpen}
        onSubmit={handleQuickLogin}
        defaultStationId={selectedStation?.id ?? null}
        history={readQuickLoginHistory()}
      />
      <DeleteConfirmDialog
        open={isDeleteStationOpen}
        title={t("apiBilling.deleteStationTitle")}
        description={deletingStation ? t("apiBilling.deleteStationDesc", { name: deletingStation.remark }) : ""}
        onOpenChange={setDeleteStationOpen}
        onConfirm={handleDeleteStation}
      />
      <DeleteConfirmDialog
        open={isDeleteAccountOpen}
        title={t("apiBilling.deleteAccountTitle")}
        description={deletingAccount ? t("apiBilling.deleteAccountDesc", { name: deletingAccount.username }) : ""}
        onOpenChange={setDeleteAccountOpen}
        onConfirm={handleDeleteAccount}
      />
    </div>
  );
}

function ColumnHeader({ title, action }: { title: string; action: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
      <h2 className="truncate text-sm font-semibold">{title}</h2>
      {action}
    </div>
  );
}

function StationColumn({
  stations,
  selectedId,
  countByStation,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onReorder,
  reorderDisabled,
  onRefreshAll,
  refreshingAll,
  onImportData,
  onExportData,
  importingData,
  exportingData,
  onQuickLogin,
}: {
  stations: RelayStation[];
  selectedId: string;
  countByStation: Record<string, number>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (station: RelayStation) => void;
  onDelete: (station: RelayStation) => void;
  onReorder: (orderedIds: string[]) => void;
  reorderDisabled: boolean;
  onRefreshAll: () => void;
  refreshingAll: boolean;
  onImportData: () => void;
  onExportData: () => void;
  importingData: boolean;
  exportingData: boolean;
  onQuickLogin: () => void;
}) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | null>(null);
  const renderCard = (station: RelayStation, dragging: boolean) => (
    <StationCardContent
      station={station}
      active={station.id === selectedId}
      count={countByStation[station.id] ?? 0}
      dragging={dragging}
      onSelect={onSelect}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
  return (
    <section className="flex w-[260px] shrink-0 flex-col rounded-lg border bg-card">
      <ColumnHeader
        title={t("apiBilling.stationTitle")}
        action={
          <div className="flex items-center gap-1.5">
            <Button
              size="icon-sm"
              variant="outline"
              onClick={onRefreshAll}
              disabled={refreshingAll}
              aria-label={t("apiBilling.refreshAll")}
              title={t("apiBilling.refreshAll")}
            >
              <RefreshCw className={refreshingAll ? "animate-spin" : undefined} />
            </Button>
            <Button size="sm" onClick={onAdd}>
              <Plus />
              {t("apiBilling.addStation")}
            </Button>
            {onQuickLogin && (
              <Button size="sm" variant="secondary" onClick={onQuickLogin} className="ml-2">
                ⚡ 快速登录
              </Button>
            )}
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {stations.length === 0 ? (
          <EmptyHint icon={<Inbox className="size-7 opacity-40" />} text={t("apiBilling.noStation")} />
        ) : (
          <SortableList
            items={stations}
            disabled={reorderDisabled || stations.length < 2}
            onReorder={onReorder}
            activeId={activeId}
            onActiveIdChange={setActiveId}
            renderItem={(station) => (
              <SortableStationItem
                key={station.id}
                station={station}
                disabled={reorderDisabled || stations.length < 2}
                render={renderCard}
              />
            )}
            renderOverlay={(station) => (
              <div className="rounded-lg border bg-card shadow-xl">{renderCard(station, true)}</div>
            )}
          />
        )}
      </div>
      <div className="flex items-center justify-end gap-1.5 border-t px-3 py-3">
        <Button
          size="icon-sm"
          variant="outline"
          onClick={onImportData}
          disabled={importingData}
          aria-label={t("apiBilling.importData")}
          title={t("apiBilling.importData")}
        >
          <Import className={importingData ? "animate-pulse" : undefined} />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          onClick={onExportData}
          disabled={exportingData}
          aria-label={t("apiBilling.exportData")}
          title={t("apiBilling.exportData")}
        >
          <Download className={exportingData ? "animate-pulse" : undefined} />
        </Button>
      </div>
    </section>
  );
}

function SortableStationItem({
  station,
  disabled,
  render,
}: {
  station: RelayStation;
  disabled: boolean;
  render: (station: RelayStation, dragging: boolean) => ReactNode;
}) {
  const { t } = useTranslation();
  const { setNodeRef, style, handleProps, isDragging } = useSortableCard(station.id, disabled);
  return (
    <StationCardShell
      ref={setNodeRef}
      style={style}
      isDragging={isDragging}
      handle={
        <DragHandle
          label={t("apiBilling.reorder.dragHandle")}
          disabled={disabled}
          handleProps={handleProps}
          className="absolute inset-y-0 left-0 z-10 w-4"
        />
      }
      content={render(station, false)}
    />
  );
}

const StationCardShell = ({
  ref,
  style,
  isDragging,
  handle,
  content,
}: {
  ref: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  isDragging: boolean;
  handle: ReactNode;
  content: ReactNode;
}) => (
  <div ref={ref} style={style} className={cn("relative", isDragging && "z-10")}>
    {handle}
    {content}
  </div>
);

function StationCardContent({
  station,
  active,
  count,
  dragging,
  onSelect,
  onEdit,
  onDelete,
}: {
  station: RelayStation;
  active: boolean;
  count: number;
  dragging: boolean;
  onSelect: (id: string) => void;
  onEdit: (station: RelayStation) => void;
  onDelete: (station: RelayStation) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(station.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(station.id);
        }
      }}
      className={cn(
        "relative w-full cursor-pointer rounded-lg border px-3 py-3 text-left transition",
        active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
        dragging && "shadow-xl"
      )}
    >
      <span className="absolute -top-2 -right-2">
        <Badge variant="secondary" className="size-5 flex items-center justify-center rounded-full p-0 text-[10px] leading-none">{count}</Badge>
      </span>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">{station.remark}</span>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(station);
            }}
            aria-label={t("apiBilling.editStation")}
            title={t("apiBilling.editStation")}
          >
            <Pencil size={13} />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(station);
            }}
            aria-label={t("apiBilling.deleteStation")}
            title={t("apiBilling.deleteStation")}
          >
            <Trash2 size={13} className="text-destructive" />
          </Button>
        </div>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{station.website}</p>
    </div>
  );
}

function AccountColumn({
  station,
  accounts,
  selectedId,
  openingId,
  refreshingIds,
  refreshingStationIds,
  refreshingAll,
  onSelect,
  onAdd,
  onLogin,
  onRefresh,
  onRefreshStation,
  onEdit,
  onDelete,
  onReorder,
  reorderDisabled,
}: {
  station: RelayStation | null;
  accounts: StationAccount[];
  selectedId: string;
  openingId: string | null;
  refreshingIds: Set<string>;
  refreshingStationIds: Set<string>;
  refreshingAll: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onLogin: (account: StationAccount) => void;
  onRefresh: (account: StationAccount) => void;
  onRefreshStation: (stationId: string) => void;
  onEdit: (account: StationAccount) => void;
  onDelete: (account: StationAccount) => void;
  onReorder: (orderedIds: string[]) => void;
  reorderDisabled: boolean;
}) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | null>(null);
  const stationRefreshing =
    refreshingAll || (station ? refreshingStationIds.has(station.id) : false);
  const renderCard = (account: StationAccount, dragging: boolean) => (
    <AccountCardContent
      account={account}
      selected={account.id === selectedId}
      opening={openingId === account.id}
      refreshing={stationRefreshing || refreshingIds.has(account.id)}
      dragging={dragging}
      onSelect={onSelect}
      onLogin={onLogin}
      onRefresh={onRefresh}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
  return (
    <section className="flex min-w-0 flex-[1.1] flex-col rounded-lg border bg-card">
      <ColumnHeader
        title={`${t("apiBilling.accountTitle")} (${accounts.length})`}
        action={
          <div className="flex items-center gap-1.5">
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => station && onRefreshStation(station.id)}
              disabled={!station || stationRefreshing || accounts.length === 0}
              aria-label={t("apiBilling.refreshStation")}
              title={t("apiBilling.refreshStation")}
            >
              <RefreshCw className={stationRefreshing ? "animate-spin" : undefined} />
            </Button>
            <Button size="sm" onClick={onAdd} disabled={!station}>
              <Plus />
              {t("apiBilling.addAccount")}
            </Button>
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!station ? (
          <EmptyHint
            icon={<Inbox className="size-8 opacity-40" />}
            text={t("apiBilling.pickStationFirst")}
          />
        ) : accounts.length === 0 ? (
          <EmptyHint
            icon={<UserRound className="size-8 opacity-40" />}
            text={t("apiBilling.noAccount")}
            hint={t("apiBilling.noAccountHint")}
          />
        ) : (
          <SortableList
            items={accounts}
            disabled={reorderDisabled || accounts.length < 2}
            onReorder={onReorder}
            activeId={activeId}
            onActiveIdChange={setActiveId}
            renderItem={(account) => (
              <SortableAccountItem
                key={account.id}
                account={account}
                disabled={reorderDisabled || accounts.length < 2}
                render={renderCard}
              />
            )}
            renderOverlay={(account) => (
              <div className="rounded-lg border bg-card shadow-xl">{renderCard(account, true)}</div>
            )}
          />
        )}
      </div>
    </section>
  );
}

function SortableAccountItem({
  account,
  disabled,
  render,
}: {
  account: StationAccount;
  disabled: boolean;
  render: (account: StationAccount, dragging: boolean) => ReactNode;
}) {
  const { t } = useTranslation();
  const { setNodeRef, style, handleProps, isDragging } = useSortableCard(account.id, disabled);
  return (
    <div ref={setNodeRef} style={style} className={cn("relative", isDragging && "z-10")}>
      <DragHandle
        label={t("apiBilling.reorder.dragHandle")}
        disabled={disabled}
        handleProps={handleProps}
        className="absolute inset-y-0 left-0 z-10 w-4"
      />
      {render(account, false)}
    </div>
  );
}

function AccountCardContent({
  account,
  selected,
  opening,
  refreshing,
  dragging,
  onSelect,
  onLogin,
  onRefresh,
  onEdit,
  onDelete,
}: {
  account: StationAccount;
  selected: boolean;
  opening: boolean;
  refreshing: boolean;
  dragging: boolean;
  onSelect: (id: string) => void;
  onLogin: (account: StationAccount) => void;
  onRefresh: (account: StationAccount) => void;
  onEdit: (account: StationAccount) => void;
  onDelete: (account: StationAccount) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(account.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(account.id);
        }
      }}
      className={cn(
        "w-full cursor-pointer rounded-lg border px-4 py-4 text-left transition",
        selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-muted/40",
        dragging && "shadow-xl"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{account.username}</span>
            <StatusBadge status={account.status} />
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {account.notes || t("apiBilling.notesEmpty")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onLogin(account);
              }}
              disabled={opening}
            >
              <LogIn />
              {opening ? t("apiBilling.opening") : t("apiBilling.card.login")}
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                onRefresh(account);
              }}
              disabled={refreshing}
              aria-label={t("apiBilling.refreshStatus")}
              title={t("apiBilling.refreshStatus")}
            >
              <RefreshCw className={refreshing ? "animate-spin" : undefined} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(account);
              }}
              aria-label={t("apiBilling.editAccount")}
              title={t("apiBilling.editAccount")}
            >
              <Pencil size={13} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(account);
              }}
              aria-label={t("apiBilling.deleteAccount")}
              title={t("apiBilling.deleteAccount")}
            >
              <Trash2 size={13} className="text-destructive" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailColumn({
  station,
  account,
  onOpenWebsite,
  onRedetectProfile,
}: {
  station: RelayStation | null;
  account: StationAccount | null;
  onOpenWebsite: () => void;
  onRedetectProfile: (stationId: string) => void;
}) {
  const { t } = useTranslation();
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    setPasswordHidden(true);
    setRevealedPassword(null);
  }, [account?.id]);

  const handleTogglePassword = async () => {
    if (!account) return;
    if (!passwordHidden) {
      setPasswordHidden(true);
      return;
    }
    if (!account.hasPassword) {
      setPasswordHidden(false);
      return;
    }
    if (revealedPassword !== null) {
      setPasswordHidden(false);
      return;
    }
    setRevealing(true);
    try {
      const pw = await api.revealPassword(account.id);
      setRevealedPassword(pw);
      setPasswordHidden(false);
    } catch (error) {
      toast.error(t("apiBilling.toasts.revealPasswordFailed"));
    } finally {
      setRevealing(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!account || !account.hasPassword) return;
    try {
      await api.copyPasswordToClipboard(account.id);
    } catch (error) {
      toast.error(t("apiBilling.toasts.copyPasswordFailed"));
    }
  };

  const handleCopyWebsite = async () => {
    if (!station) return;
    try {
      await navigator.clipboard.writeText(station.website);
    } catch {
      /* clipboard unavailable */
    }
  };

  const passwordValue = account?.hasPassword
    ? (revealedPassword ?? "••••••••")
    : "";

  return (
    <aside className="hidden w-[340px] shrink-0 rounded-lg border bg-card xl:flex xl:flex-col">
      <ColumnHeader title={t("apiBilling.detailTitle")} action={null} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {station ? (
          <div className="divide-y">
            <DetailSection
              title={t("apiBilling.detail.stationSection")}
              rows={[
                { label: t("apiBilling.detail.remark"), value: station.remark, truncate: true },
                { label: t("apiBilling.detail.website"), value: station.website, truncate: true },
                { label: t("apiBilling.detail.createdAt"), value: station.createdAt },
              ]}
              footer={
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={onOpenWebsite}>
                    <ExternalLink />
                    {t("apiBilling.detail.openWebsite")}
                  </Button>
                </div>
              }
            />

            {/* Account 详情 */}
            {account && (
              <DetailSection
                title="账号信息"
                rows={[
                  { label: "用户名", value: account.username },
                  {
                    label: "密码",
                    value: passwordValue,
                    reveal: {
                      hidden: passwordHidden,
                      onToggle: handleTogglePassword,
                      loading: revealing,
                    },
                    copy: account.hasPassword,
                    onCopy: handleCopyPassword,
                  },
                  { label: "备注", value: account.notes || "—" },
                  {
                    label: "网站",
                    value: station.website,
                    truncate: true,
                    copy: true,
                    onCopy: handleCopyWebsite,
                  },
                ]}
              />
            )}

            {/* AuthProfile */}
            {station.authProfile && (() => {
              const p = station.authProfile!;
              return (
                <div className="mx-5 mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-blue-400">
                    <span className="flex items-center gap-1.5">{t("apiBilling.sessionManager.authProfile.title")}</span>
                    <button
                      type="button"
                      onClick={() => onRedetectProfile(station.id)}
                      className="rounded px-1.5 py-0.5 text-[10px] font-normal text-blue-500 hover:bg-blue-500/10"
                      title={t("apiBilling.sessionManager.authProfile.redetectTooltip")}
                    >
                      {t("apiBilling.sessionManager.authProfile.redetect")}
                    </button>
                  </div>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>{t("apiBilling.sessionManager.authProfile.authType")}</span><span className="text-foreground">{String(p.authType)}</span></div>
                    <div className="flex justify-between"><span>{t("apiBilling.sessionManager.authProfile.tokenStorage")}</span><span className="text-foreground">{String(p.tokenStorage)}</span></div>
                    <div className="flex justify-between"><span>{t("apiBilling.sessionManager.authProfile.csrf")}</span><span className="text-foreground">{p.csrfProtection ? t("apiBilling.sessionManager.authProfile.csrfEnabled") : t("apiBilling.sessionManager.authProfile.csrfDisabled")}</span></div>
                    <div className="flex justify-between"><span>{t("apiBilling.sessionManager.authProfile.antiBot")}</span><span className="text-foreground">{p.antiBot ? t("apiBilling.sessionManager.authProfile.antiBotDetected") : t("apiBilling.sessionManager.authProfile.antiBotUndetected")}</span></div>
                    <div className="flex justify-between"><span>{t("apiBilling.sessionManager.authProfile.fingerprinting")}</span><span className="text-foreground">{String(p.fingerprinting)}</span></div>
                    <div className="flex justify-between"><span>{t("apiBilling.sessionManager.authProfile.probeStrategy")}</span><span className="rounded bg-blue-500/10 px-1 py-0.5 text-[10px] text-blue-400">{String(p.probeStrategy)}</span></div>
                    <div className="flex justify-between"><span>{t("apiBilling.sessionManager.authProfile.confidence")}</span><span className="text-foreground">{Math.round(p.confidence * 100)}%</span></div>
                    <div className="flex justify-between"><span>{t("apiBilling.sessionManager.authProfile.detectedAt")}</span><span className="text-foreground">{p.detectedAt}</span></div>
                  </div>
                </div>
              );
            })()}

          </div>
        ) : (
          <div className="px-5 py-6">
            <EmptyHint
              icon={<BadgeCheck className="size-8 opacity-40" />}
              text={t("apiBilling.detail.empty")}
            />

          </div>
        )}
      </div>
    </aside>
  );
}

function DetailSection({
  title,
  heading,
  rows,
  extras,
  footer,
  note,
}: {
  title: string;
  heading?: ReactNode;
  rows: DetailRow[];
  extras?: ReactNode;
  footer?: ReactNode;
  note?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 px-5 py-4">
      <SectionLabel>{title}</SectionLabel>
      {heading}
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="space-y-2">
          {rows.map(({ label, value, truncate, copy, onCopy, reveal }) => {
            const hasValue = value.length > 0;
            const display = reveal?.hidden
              ? hasValue
                ? "•".repeat(Math.min(value.length, 12))
                : "—"
              : hasValue
                ? value
                : "—";
            return (
              <div key={label} className="flex items-center justify-between gap-3 text-sm">
                <span className="shrink-0 text-muted-foreground">{label}</span>
                <div className="flex min-w-0 max-w-[68%] items-center justify-end gap-1">
                  <span
                    className={cn(
                      "min-w-0 text-right font-medium",
                      truncate ? "truncate" : "break-all"
                    )}
                  >
                    {display}
                  </span>
                  {reveal && (
                    <IconButton
                      onClick={reveal.onToggle}
                      icon={reveal.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                      label={
                        reveal.hidden
                          ? t("apiBilling.detail.revealPassword")
                          : t("apiBilling.detail.hidePassword")
                      }
                      disabled={reveal.loading}
                    />
                  )}
                  {copy && (
                    <CopyIconButton
                      value={value}
                      label={t("apiBilling.detail.copy")}
                      onCopy={onCopy}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {extras}
      {footer}
      {note && (
        <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {note}
        </div>
      )}
    </div>
  );
}

function IconButton({
  onClick,
  icon,
  label,
  disabled,
}: {
  onClick: () => void;
  icon: ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      {icon}
    </button>
  );
}

function CopyIconButton({
  value,
  label,
  onCopy,
}: {
  value: string;
  label?: string;
  onCopy?: () => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const handleClick = async () => {
    try {
      if (onCopy) {
        await onCopy();
      } else {
        await navigator.clipboard.writeText(value);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <IconButton
      onClick={handleClick}
      icon={copied ? <Check size={14} /> : <Copy size={14} />}
      label={label}
    />
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function LoginDetectionField({
  value,
  onChange,
}: {
  value: LoginDetectionConfig;
  onChange: (next: LoginDetectionConfig) => void;
}) {
  const { t } = useTranslation();
  const modes: LoginDetectionMode[] = ["presetLogout", "presetLogin", "custom"];
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1.5">
        {modes.map((mode) => {
          const selected = value.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ ...value, mode })}
              className={cn(
                "flex items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
                selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
              )}
            >
              <span
                className={cn(
                  "mt-1 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-primary" : "border-muted-foreground/40"
                )}
              >
                {selected && <span className="block size-2 rounded-full bg-primary" />}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">
                  {t(`apiBilling.loginDetection.${mode}`)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t(`apiBilling.loginDetection.${mode}Hint`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {value.mode === "custom" && (
        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <CustomDetectionRule
            title={t("apiBilling.loginDetection.loggedOutRule")}
            rule={value.loggedOutRule}
            onChange={(rule) => onChange({ ...value, loggedOutRule: rule })}
          />
          <CustomDetectionRule
            title={t("apiBilling.loginDetection.loggedInRule")}
            rule={value.loggedInRule}
            onChange={(rule) => onChange({ ...value, loggedInRule: rule })}
          />
        </div>
      )}
    </div>
  );
}

function CustomDetectionRule({
  title,
  rule,
  onChange,
}: {
  title: string;
  rule: LoginDetectionRule;
  onChange: (rule: LoginDetectionRule) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">{title}</span>
      <div className="flex gap-2">
        <Select
          value={rule.presence}
          onValueChange={(v) => onChange({ ...rule, presence: v as LoginDetectionPresence })}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="present">
              {t("apiBilling.loginDetection.presencePresent")}
            </SelectItem>
            <SelectItem value="absent">
              {t("apiBilling.loginDetection.presenceAbsent")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={rule.text}
          onChange={(e) => onChange({ ...rule, text: e.target.value })}
          placeholder={t("apiBilling.loginDetection.textPlaceholder")}
          className="flex-1"
        />
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  input,
}: {
  label: string;
  icon?: ReactNode;
  input: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      {input}
    </label>
  );
}

function StationDialog({
  open,
  station,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  station: RelayStation | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    remark: string,
    website: string,
    loginDetection: LoginDetectionConfig
  ) => void | Promise<void | boolean>;
}) {
  const { t } = useTranslation();
  const isEditing = !!station;
  const [remark, setRemark] = useState("");
  const [website, setWebsite] = useState("");
  const [detection, setDetection] = useState<LoginDetectionConfig>(DEFAULT_LOGIN_DETECTION);
  const [submitting, setSubmitting] = useState(false);

  // Session Manager: 编辑模式下的高级设置
  const [exclusivityMode, setExclusivityMode] = useState<ExclusivityMode>("coexisting");
  const [probeStrategy, setProbeStrategyLocal] = useState<ProbeStrategy>("httpFirst");
  const [probeOverride, setProbeOverride] = useState(false);
  const [sessionTtlHours, setSessionTtlHours] = useState<number>(720);

  const reset = () => {
    setRemark("");
    setWebsite("");
    setDetection(DEFAULT_LOGIN_DETECTION);
    setExclusivityMode("coexisting");
    setProbeStrategyLocal("httpFirst");
    setProbeOverride(false);
    setSessionTtlHours(720);
  };

  useEffect(() => {
    if (open && station) {
      setRemark(station.remark);
      setWebsite(station.website);
      setDetection(station.loginDetection ?? DEFAULT_LOGIN_DETECTION);
      setExclusivityMode(station.exclusivityMode ?? "coexisting");
      setSessionTtlHours(station.sessionTtlHours ?? 720);
      if (station.authProfile) {
        setProbeStrategyLocal(station.authProfile.probeStrategy);
      }
    } else if (open) {
      reset();
    }
    setSubmitting(false);
  }, [open, station]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const r = remark.trim();
    const w = website.trim();
    if (!r || !w) return;
    setSubmitting(true);
    try {
      await Promise.resolve(onSubmit(r, w, detection));
      // 编辑模式下同步 Session Manager 设置
      if (station) {
        const promises: Promise<unknown>[] = [];
        const targetMode = exclusivityMode;
        if (targetMode !== (station.exclusivityMode ?? "coexisting")) {
          promises.push(api.setExclusivityMode(station.id, targetMode));
        }
        if (probeOverride) {
          promises.push(api.setProbeStrategy(station.id, probeStrategy));
        }
        const targetTtl = sessionTtlHours;
        if (targetTtl !== (station.sessionTtlHours ?? 720)) {
          promises.push(api.setSessionTtl(station.id, targetTtl));
        }
        await Promise.all(promises);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("apiBilling.editStationDialog.title") : t("apiBilling.addStationDialog.title")}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? t("apiBilling.editStationDialog.subtitle") : t("apiBilling.addStationDialog.subtitle")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-5 sm:grid-cols-2">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("apiBilling.addStationDialog.sectionBasic")}
              </h3>
              <Field
                label={t("apiBilling.fields.remark")}
                icon={<StickyNote size={14} />}
                input={
                  <Input
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder={t("apiBilling.addStationDialog.remarkPlaceholder")}
                    required
                  />
                }
              />
              <Field
                label={t("apiBilling.fields.website")}
                icon={<Globe size={14} />}
                input={
                  <Input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder={t("apiBilling.addStationDialog.websitePlaceholder")}
                    type="url"
                    required
                  />
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("apiBilling.addStationDialog.inviteLinkPriority")}
              </p>
            </section>
            <section className="space-y-3 sm:border-l sm:border-border sm:pl-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("apiBilling.addStationDialog.sectionLoginDetection")}
              </h3>
              <LoginDetectionField value={detection} onChange={setDetection} />
            </section>
          </div>

          {isEditing && (
            <section className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("apiBilling.sessionManager.advancedSection.title")}
              </h3>
              <Field
                label={t("apiBilling.sessionManager.advancedSection.exclusivityMode")}
                input={
                  <Select
                    value={exclusivityMode}
                    onValueChange={(v) => setExclusivityMode(v as ExclusivityMode)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="coexisting">{t("apiBilling.sessionManager.advancedSection.exclusivityCoexisting")}</SelectItem>
                      <SelectItem value="exclusive">{t("apiBilling.sessionManager.advancedSection.exclusivityExclusive")}</SelectItem>
                      <SelectItem value="rotating">{t("apiBilling.sessionManager.advancedSection.exclusivityRotating")}</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
              <Field
                label={t("apiBilling.sessionManager.advancedSection.probeStrategy")}
                input={
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={probeOverride}
                        onChange={(e) => setProbeOverride(e.target.checked)}
                      />
                      {t("apiBilling.sessionManager.advancedSection.probeOverrideLabel")}
                    </label>
                    <Select
                      value={probeStrategy}
                      onValueChange={(v) => setProbeStrategyLocal(v as ProbeStrategy)}
                      disabled={!probeOverride}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="httpFirst">{t("apiBilling.sessionManager.advancedSection.probeHttpFirst")}</SelectItem>
                        <SelectItem value="httpOnly">{t("apiBilling.sessionManager.advancedSection.probeHttpOnly")}</SelectItem>
                        <SelectItem value="webviewOnly">{t("apiBilling.sessionManager.advancedSection.probeWebviewOnly")}</SelectItem>
                        <SelectItem value="hybrid">{t("apiBilling.sessionManager.advancedSection.probeHybrid")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                }
              />
              <Field
                label={t("apiBilling.sessionManager.advancedSection.sessionTtlLabel")}
                input={
                  <Input
                    type="number"
                    min={0}
                    value={sessionTtlHours}
                    onChange={(e) => setSessionTtlHours(Math.max(0, parseInt(e.target.value || "0", 10)))}
                  />
                }
              />
            </section>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("apiBilling.cancel")}
            </Button>
            <Button type="submit" disabled={!remark.trim() || !website.trim() || submitting}>
              {t("apiBilling.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddAccountDialog({
  open,
  onOpenChange,
  stationName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stationName: string;
  onSubmit: (username: string, password: string, notes: string, phone: string, tgAccount: string, linkedAccount: string, inviteLink: string, loginMethods: api.LoginMethod[]) => void | Promise<void | boolean>;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setUsername("");
    setPassword("");
    setPasswordHidden(true);
    setNotes("");
    setSubmitting(false);
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const u = username.trim();
    if (!u) return;
    setSubmitting(true);
    try {
      await Promise.resolve(onSubmit(u, password, notes.trim(), "", "", "", "", []));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("apiBilling.addAccountDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("apiBilling.addAccountDialog.subtitle", { name: stationName })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={t("apiBilling.fields.username")}
              icon={<UserRound size={14} />}
              input={<Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("apiBilling.addAccountDialog.usernamePlaceholder")} required />}
            />
            <Field
              label={t("apiBilling.fields.password")}
              icon={<KeyRound size={14} />}
              input={
                <div className="flex items-center gap-2">
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("apiBilling.addAccountDialog.passwordPlaceholder")} type={passwordHidden ? "password" : "text"} />
                  <IconButton onClick={() => setPasswordHidden(h => !h)} icon={passwordHidden ? <Eye size={14} /> : <EyeOff size={14} />} label={passwordHidden ? t("apiBilling.detail.revealPassword") : t("apiBilling.detail.hidePassword")} />
                </div>
              }
            />
          </div>
          <Field
            label={t("apiBilling.fields.notes")}
            icon={<StickyNote size={14} />}
            input={<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="备注（手机号、TG、邀请链接等）" rows={2} />}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={submitting || !username.trim()}>{submitting ? t("common.loading") : t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function EditAccountDialog({
  open,
  account,
  stationName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  account: StationAccount | null;
  stationName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    username: string,
    notes: string,
    password: string | null,
    phone: string,
    tgAccount: string,
    linkedAccount: string,
    inviteLink: string,
    loginMethods: api.LoginMethod[]
  ) => void | Promise<void | boolean>;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [phone, setPhone] = useState("");
  const [tgAccount, setTgAccount] = useState("");
  const [linkedAccount, setLinkedAccount] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [loginMethods, setLoginMethods] = useState<api.LoginMethod[]>([]);

  const loginMethodOptions: { value: api.LoginMethod; label: string }[] = [
    { value: "emailCode", label: t("apiBilling.loginMethods.emailCode") },
    { value: "usernamePassword", label: t("apiBilling.loginMethods.usernamePassword") },
    { value: "linkedLink", label: t("apiBilling.loginMethods.linkedLink") },
    { value: "phoneCode", label: t("apiBilling.loginMethods.phoneCode") },
  ];

  const toggleLoginMethod = (method: api.LoginMethod) => {
    setLoginMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  };

  useEffect(() => {
    let cancelled = false;
    if (open && account) {
      setUsername(account.username);
      setNotes(account.notes);
      setPassword("");
      setPasswordHidden(true);
      setPasswordDirty(false);
      setSubmitting(false);
      setPhone(account.phone ?? "");
      setTgAccount(account.tgAccount ?? "");
      setLinkedAccount(account.linkedAccount ?? "");
      setInviteLink(account.inviteLink ?? "");
      setLoginMethods(account.loginMethods ?? []);
      if (account.hasPassword) {
        setPasswordLoading(true);
        void api
          .revealPassword(account.id)
          .then((pw) => {
            if (!cancelled) setPassword(pw);
          })
          .catch(() => {
            if (!cancelled) toast.error(t("apiBilling.toasts.revealPasswordFailed"));
          })
          .finally(() => {
            if (!cancelled) setPasswordLoading(false);
          });
      } else {
        setPasswordLoading(false);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [open, account, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || passwordLoading) return;
    const u = username.trim();
    if (!u) return;
    setSubmitting(true);
    try {
      await Promise.resolve(
        onSubmit(
          u,
          notes.trim(),
          passwordDirty ? password : null,
          phone.trim(),
          tgAccount.trim(),
          linkedAccount.trim(),
          inviteLink.trim(),
          loginMethods,
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{t("apiBilling.editAccountDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("apiBilling.editAccountDialog.subtitle", { name: stationName })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            label={t("apiBilling.fields.username")}
            icon={<UserRound size={14} />}
            input={
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("apiBilling.addAccountDialog.usernamePlaceholder")}
                required
              />
            }
          />
          <Field
            label={t("apiBilling.fields.password")}
            icon={<KeyRound size={14} />}
            input={
              <div className="flex items-center gap-2">
                <Input
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordDirty(true);
                  }}
                  placeholder={t("apiBilling.editAccountDialog.passwordPlaceholder")}
                  type={passwordHidden ? "password" : "text"}
                  disabled={passwordLoading}
                />
                <IconButton
                  onClick={() => setPasswordHidden((hidden) => !hidden)}
                  icon={passwordHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                  label={
                    passwordHidden
                      ? t("apiBilling.detail.revealPassword")
                      : t("apiBilling.detail.hidePassword")
                  }
                  disabled={passwordLoading}
                />
                {password.length > 0 ? (
                  <CopyIconButton
                    value={password}
                    label={t("apiBilling.detail.copy")}
                  />
                ) : null}
              </div>
            }
          />
          <Field
            label={t("apiBilling.fields.phone")}
            icon={<Phone size={14} />}
            input={
              <Input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("apiBilling.addAccountDialog.phonePlaceholder")}
              />
            }
          />
          <Field
            label={t("apiBilling.fields.tgAccount")}
            icon={<MessageCircle size={14} />}
            input={
              <Input
                value={tgAccount}
                onChange={(e) => setTgAccount(e.target.value)}
                placeholder={t("apiBilling.addAccountDialog.tgAccountPlaceholder")}
              />
            }
          />
          <Field
            label={t("apiBilling.fields.linkedAccount")}
            icon={<Link size={14} />}
            input={
              <Input
                value={linkedAccount}
                onChange={(e) => setLinkedAccount(e.target.value)}
                placeholder={t("apiBilling.addAccountDialog.linkedAccountPlaceholder")}
              />
            }
          />
          <Field
            label={t("apiBilling.fields.inviteLink")}
            icon={<ExternalLink size={14} />}
            input={
              <Input
                value={inviteLink}
                onChange={(e) => setInviteLink(e.target.value)}
                placeholder={t("apiBilling.addAccountDialog.inviteLinkPlaceholder")}
                type="url"
              />
            }
          />
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <KeyRound size={14} />
              {t("apiBilling.fields.loginMethods")}
            </span>
            <div className="flex flex-wrap gap-2">
              {loginMethodOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleLoginMethod(option.value)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    loginMethods.includes(option.value)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </label>
          <Field
            label={t("apiBilling.fields.notes")}
            icon={<StickyNote size={14} />}
            input={
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("apiBilling.editAccountDialog.notesPlaceholder")}
                rows={3}
              />
            }
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("apiBilling.cancel")}
            </Button>
            <Button type="submit" disabled={!username.trim() || submitting || passwordLoading}>
              {t("apiBilling.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmptyHint({
  icon,
  text,
  hint,
}: {
  icon: ReactNode;
  text: string;
  hint?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center text-muted-foreground">
      {icon}
      <div>
        <p className="text-sm font-medium text-foreground">{text}</p>
        {hint && <p className="mt-1 text-sm">{hint}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AccountSessionStatus }) {
  const { t } = useTranslation();

  const variant = {
    ready: "secondary",
    loginRequired: "outline",
    expired: "destructive",
    fetchFailed: "outline",
    inactive: "outline",
  } as const;

  const className = {
    ready: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    loginRequired: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    expired: "",
    fetchFailed: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
    inactive: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  }[status];

  const dotColor = {
    ready: "bg-emerald-500",
    loginRequired: "bg-amber-500",
    expired: "bg-red-500",
    fetchFailed: "bg-slate-400",
    inactive: "bg-slate-400",
  }[status];

  return (
    <Badge variant={variant[status]} className={className}>
      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${dotColor}`} />
      {t(`apiBilling.status.${status}`)}
    </Badge>
  );
}


function DeleteConfirmDialog({
  open,
  title,
  description,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="pt-2 text-sm">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("apiBilling.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void Promise.resolve(onConfirm())}
          >
            {t("apiBilling.deleteAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ApiBillingPage;

// Session Manager: Quick Login Dialog
function QuickLoginDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultStationId,
  history,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (url: string, username: string, stationId?: string | null) => void | Promise<void>;
  defaultStationId?: string | null;
  history?: string[];
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => { if (!open) { setUrl(""); setUsername(""); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("apiBilling.sessionManager.quickLogin.title")}</DialogTitle>
          <DialogDescription>{t("apiBilling.sessionManager.quickLogin.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void Promise.resolve(onSubmit(url, username, defaultStationId)); }} className="space-y-4">
          <Field label={t("apiBilling.sessionManager.quickLogin.urlLabel")} icon={<Globe size={14} />} input={
            <div className="space-y-1">
              <Input value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com" required list="quick-login-history" />
              {history && history.length > 0 && (
                <datalist id="quick-login-history">
                  {history.map((h) => <option key={h} value={h} />)}
                </datalist>
              )}
            </div>
          } />
          <Field label={t("apiBilling.sessionManager.quickLogin.usernameLabel")} icon={<UserRound size={14} />} input={
            <Input value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="user@example.com" required />} />
          {defaultStationId && (
            <p className="text-xs text-muted-foreground">{t("apiBilling.sessionManager.quickLogin.attachToStation")}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("apiBilling.sessionManager.quickLogin.cancel")}</Button>
            <Button type="submit" disabled={!url.trim() || !username.trim()}>{t("apiBilling.sessionManager.quickLogin.openButton")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
