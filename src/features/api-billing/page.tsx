import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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
  TriangleAlert,
  UserRound,
} from "lucide-react";
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
  LoginDetectionConfig,
  LoginDetectionMode,
  LoginDetectionPresence,
  LoginDetectionRule,
  RelayStation,
  StationAccount,
} from "@/features/api-billing/api";
import { DEFAULT_LOGIN_DETECTION } from "@/features/api-billing/api";

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

function ApiBillingPage() {
  const { t } = useTranslation();
  const [stations, setStations] = useState<RelayStation[]>([]);
  const [accounts, setAccounts] = useState<StationAccount[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [openingAccountId, setOpeningAccountId] = useState<string | null>(null);
  const [isAddStationOpen, setAddStationOpen] = useState(false);
  const [isAddAccountOpen, setAddAccountOpen] = useState(false);
  const [refreshingAccountIds, setRefreshingAccountIds] = useState<Set<string>>(
    () => new Set()
  );
  const refreshingAccountIdsRef = useRef<Set<string>>(new Set());
  const [refreshingStationIds, setRefreshingStationIds] = useState<Set<string>>(
    () => new Set()
  );
  const refreshingStationIdsRef = useRef<Set<string>>(new Set());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const refreshingAllRef = useRef(false);
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [s, a] = await Promise.all([api.listStations(), api.listAllAccounts()]);
        if (cancelled) return;
        setStations(s);
        setAccounts(a);
        if (s.length > 0) {
          setSelectedStationId(s[0].id);
          const firstAccount = a.find((acc) => acc.stationId === s[0].id);
          setSelectedAccountId(firstAccount?.id ?? "");
        }
      } catch (error) {
        toast.error(t("apiBilling.toasts.initFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // 仅初始化加载一次,不随 t 变化重新拉取数据
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleRefreshAccount = async (account: StationAccount) => {
    if (refreshingAccountIdsRef.current.has(account.id)) return;
    refreshingAccountIdsRef.current.add(account.id);
    setRefreshingAccountIds((prev) => {
      const next = new Set(prev);
      next.add(account.id);
      return next;
    });
    try {
      const updated = await api.refreshAccount(account.id);
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (error) {
      const info = classifyApiBillingError(error, t("apiBilling.toasts.refreshAccountFailed"));
      toast.error(t(`apiBilling.toasts.${info.kind}`));
    } finally {
      refreshingAccountIdsRef.current.delete(account.id);
      setRefreshingAccountIds((prev) => {
        if (!prev.has(account.id)) return prev;
        const next = new Set(prev);
        next.delete(account.id);
        return next;
      });
    }
  };

  const handleRefreshStation = async (stationId: string) => {
    if (!stationId) return;
    if (refreshingStationIdsRef.current.has(stationId)) return;
    refreshingStationIdsRef.current.add(stationId);
    setRefreshingStationIds((prev) => {
      const next = new Set(prev);
      next.add(stationId);
      return next;
    });
    try {
      const subset = await api.refreshStation(stationId);
      const byId = new Map(subset.map((a) => [a.id, a] as const));
      setAccounts((prev) => prev.map((a) => byId.get(a.id) ?? a));
    } catch (error) {
      const info = classifyApiBillingError(error, t("apiBilling.toasts.refreshStationFailed"));
      toast.error(t(`apiBilling.toasts.${info.kind}`));
    } finally {
      refreshingStationIdsRef.current.delete(stationId);
      setRefreshingStationIds((prev) => {
        if (!prev.has(stationId)) return prev;
        const next = new Set(prev);
        next.delete(stationId);
        return next;
      });
    }
  };

  const handleRefreshAll = async () => {
    if (refreshingAllRef.current) return;
    refreshingAllRef.current = true;
    setRefreshingAll(true);
    try {
      const all = await api.refreshAll();
      setAccounts(all);
    } catch (error) {
      const info = classifyApiBillingError(error, t("apiBilling.toasts.refreshAllFailed"));
      toast.error(t(`apiBilling.toasts.${info.kind}`));
    } finally {
      refreshingAllRef.current = false;
      setRefreshingAll(false);
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

  return (
    <div className="flex h-full min-h-0 gap-4">
      <StationColumn
        stations={stations}
        selectedId={selectedStationId}
        countByStation={accountCountByStation}
        onSelect={handleSelectStation}
        onAdd={() => setAddStationOpen(true)}
        onEdit={(station) => { setEditingStation(station); setEditStationOpen(true); }}
        onDelete={(station) => { setDeletingStation(station); setDeleteStationOpen(true); }}
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
      />

      <DetailColumn
        station={selectedStation}
        account={selectedAccount}
        onOpenWebsite={() => selectedStation && void openExternal(selectedStation.website)}
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
  onRefreshAll,
  refreshingAll,
  onImportData,
  onExportData,
  importingData,
  exportingData,
}: {
  stations: RelayStation[];
  selectedId: string;
  countByStation: Record<string, number>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (station: RelayStation) => void;
  onDelete: (station: RelayStation) => void;
  onRefreshAll: () => void;
  refreshingAll: boolean;
  onImportData: () => void;
  onExportData: () => void;
  importingData: boolean;
  exportingData: boolean;
}) {
  const { t } = useTranslation();
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
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {stations.length === 0 ? (
          <EmptyHint icon={<Inbox className="size-7 opacity-40" />} text={t("apiBilling.noStation")} />
        ) : (
          <div className="space-y-2">
            {stations.map((station) => {
              const active = station.id === selectedId;
              const count = countByStation[station.id] ?? 0;
              return (
                <button
                  key={station.id}
                  type="button"
                  onClick={() => onSelect(station.id)}
                  className={cn(
                    "relative w-full rounded-lg border px-3 py-3 text-left transition",
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
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
                </button>
              );
            })}
          </div>
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
}) {
  const { t } = useTranslation();
  const stationRefreshing =
    refreshingAll || (station ? refreshingStationIds.has(station.id) : false);
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
          <div className="space-y-2">
            {accounts.map((account) => {
              const selected = account.id === selectedId;
              const opening = openingId === account.id;
              const refreshing = stationRefreshing || refreshingIds.has(account.id);
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => onSelect(account.id)}
                  className={cn(
                    "w-full rounded-lg border px-4 py-4 text-left transition",
                    selected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:bg-muted/40"
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
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function DetailColumn({
  station,
  account,
  onOpenWebsite,
}: {
  station: RelayStation | null;
  account: StationAccount | null;
  onOpenWebsite: () => void;
}) {
  const { t } = useTranslation();
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [websiteCopied, setWebsiteCopied] = useState(false);

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
      setWebsiteCopied(true);
      window.setTimeout(() => setWebsiteCopied(false), 1200);
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
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={handleCopyWebsite}
                    aria-label={t("apiBilling.detail.copyWebsite")}
                    title={t("apiBilling.detail.copyWebsite")}
                  >
                    {websiteCopied ? <Check /> : <Copy />}
                  </Button>
                </div>
              }
            />

            {account ? (
              <DetailSection
                title={t("apiBilling.detail.accountSection")}
                heading={
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-base font-semibold">{account.username}</span>
                    <StatusBadge status={account.status} />
                  </div>
                }
                rows={[
                  { label: t("apiBilling.detail.username"), value: account.username, copy: true, truncate: true },
                  {
                    label: t("apiBilling.detail.password"),
                    value: passwordValue,
                    copy: account.hasPassword,
                    truncate: true,
                    onCopy: account.hasPassword ? handleCopyPassword : undefined,
                    reveal: account.hasPassword
                      ? {
                          hidden: passwordHidden,
                          onToggle: () => void handleTogglePassword(),
                          loading: revealing,
                        }
                      : undefined,
                  },
                  ...(account.phone ? [{ label: t("apiBilling.detail.phone"), value: account.phone, copy: true, truncate: true }] : []),
                  ...(account.tgAccount ? [{ label: t("apiBilling.detail.tgAccount"), value: account.tgAccount, copy: true, truncate: true }] : []),
                  ...(account.linkedAccount ? [{ label: t("apiBilling.detail.linkedAccount"), value: account.linkedAccount, copy: true, truncate: true }] : []),
                  ...(account.inviteLink ? [{ label: t("apiBilling.detail.inviteLink"), value: account.inviteLink, copy: true, truncate: true }] : []),
                  ...(account.loginMethods && account.loginMethods.length > 0 ? [
                    { 
                      label: t("apiBilling.detail.loginMethods"), 
                      value: account.loginMethods.map(m => t(`apiBilling.loginMethods.${m}`)).join(", "),
                      truncate: true 
                    }
                  ] : []),
                  {
                    label: t("apiBilling.detail.status"),
                    value: t(`apiBilling.status.${account.status}`),
                  },
                  {
                    label: t("apiBilling.detail.lastLogin"),
                    value: account.lastLoginAt ?? t("apiBilling.neverLogin"),
                  },
                  { label: t("apiBilling.detail.createdAt"), value: account.createdAt },
                  { label: t("apiBilling.detail.lastRefreshedAt"), value: account.lastRefreshedAt ?? t("apiBilling.neverRefreshed") },
                ]}
                extras={
                  account.notes ? (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("apiBilling.detail.notes")}
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-sm leading-6 text-muted-foreground">
                        {account.notes}
                      </p>
                    </div>
                  ) : undefined
                }
                note={
                  <div className="flex items-start gap-2">
                    <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                    <p>{t("apiBilling.detail.webviewHint")}</p>
                  </div>
                }
              />
            ) : (
              <div className="px-5 py-6">
                <SectionLabel>{t("apiBilling.detail.accountSection")}</SectionLabel>
                <EmptyHint
                  icon={<UserRound className="size-7 opacity-40" />}
                  text={t("apiBilling.detail.noAccount")}
                />
              </div>
            )}
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

  const reset = () => {
    setRemark("");
    setWebsite("");
    setDetection(DEFAULT_LOGIN_DETECTION);
  };

  useEffect(() => {
    if (open && station) {
      setRemark(station.remark);
      setWebsite(station.website);
      setDetection(station.loginDetection ?? DEFAULT_LOGIN_DETECTION);
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
  const [phone, setPhone] = useState("");
  const [tgAccount, setTgAccount] = useState("");
  const [linkedAccount, setLinkedAccount] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [loginMethods, setLoginMethods] = useState<api.LoginMethod[]>([]);
  const [submitting, setSubmitting] = useState(false);

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

  const reset = () => {
    setUsername("");
    setPassword("");
    setPasswordHidden(true);
    setNotes("");
    setPhone("");
    setTgAccount("");
    setLinkedAccount("");
    setInviteLink("");
    setLoginMethods([]);
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
      await Promise.resolve(
        onSubmit(u, password, notes.trim(), phone.trim(), tgAccount.trim(), linkedAccount.trim(), inviteLink.trim(), loginMethods),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <DialogContent size="xl">
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
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("apiBilling.addAccountDialog.passwordPlaceholder")}
                    type={passwordHidden ? "password" : "text"}
                  />
                  <IconButton
                    onClick={() => setPasswordHidden((hidden) => !hidden)}
                    icon={passwordHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                    label={
                      passwordHidden
                        ? t("apiBilling.detail.revealPassword")
                        : t("apiBilling.detail.hidePassword")
                    }
                  />
                  {!passwordHidden && password.length > 0 ? (
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
          </div>
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
            <p className="text-xs text-muted-foreground">
              {t("apiBilling.addAccountDialog.inviteLinkPriority")}
            </p>
          </label>
          <Field
            label={t("apiBilling.fields.notes")}
            icon={<StickyNote size={14} />}
            input={
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("apiBilling.addAccountDialog.notesPlaceholder")}
                rows={3}
              />
            }
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("apiBilling.cancel")}
            </Button>
            <Button type="submit" disabled={!username.trim() || submitting}>
              {t("apiBilling.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  icon,
  input,
}: {
  label: string;
  icon: ReactNode;
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
  } as const;

  const className = {
    ready: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    loginRequired: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    expired: "",
  }[status];

  return (
    <Badge variant={variant[status]} className={className}>
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
