import { useEffect, useMemo, useCallback, useState, useRef, Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshCw, Search, AppWindow, History, X,
  CheckCircle2, AlertCircle, ArrowUpCircle, Trash2,
  Layers, CheckSquare, Filter,
  Play, Folder, Download, Package, ExternalLink, RotateCcw,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { FilterPanel } from "@/components/layout/FilterPanel";
import { DetailPanel, MetadataRow, DetailSection } from "@/components/layout/DetailPanel";
import { ContentView } from "@/components/content/ContentView";
import { useAppManagerStore, APP_FILTER_OPTIONS, type OperationStatus } from "@/features/app-manager/store";
import { createAppManagerColumns } from "@/features/app-manager/columns";
import { CategoryFilter, type CategorizableItem } from "@/features/app-manager/CategoryFilter";
import { AppIcon } from "@/features/app-manager/components/AppIcon";
import { filterAppManagerItems } from "@/features/app-manager/model/selectors";
import type { ColumnDef } from "@tanstack/react-table";
import type { AppInfo, InstallListAppInfo } from "@/lib/tauri/types";
import { appManagerPlatformConfig } from "@/platform/config";
import { useContextMenuRegistration } from "@/features/context-menu/useContextMenuRegistration";
import type { ContextMenuConfig, ContextMenuRegistration } from "@/features/context-menu/types";
import { DesktopOnly } from "@/components/common/DesktopOnly";
import { isDesktopRuntime } from "@/platform/runtime";

// --- Error Boundary for AppManager ---
class AppManagerErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: "" };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error: String(error) }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[AppManager] Render error:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <AlertCircle size={40} className="text-red-500" />
          <p className="font-semibold">App Manager crashed</p>
          <pre className="text-xs max-w-lg overflow-auto bg-muted p-2 rounded">{this.state.error}</pre>
          <Button variant="outline" onClick={() => this.setState({ hasError: false, error: "" })}>Retry</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function isTauriEnv(): boolean {
  return isDesktopRuntime();
}

function AppManager({ active }: { active: boolean }) {
  const { t } = useTranslation();

  const apps = useAppManagerStore((s) => s.apps);
  const loading = useAppManagerStore((s) => s.loading);
  const error = useAppManagerStore((s) => s.error);
  const searchQuery = useAppManagerStore((s) => s.searchQuery);
  const activeFilter = useAppManagerStore((s) => s.activeFilter);
  const categoryFilter = useAppManagerStore((s) => s.categoryFilter);
  const seriesFilter = useAppManagerStore((s) => s.seriesFilter);
  const sorting = useAppManagerStore((s) => s.sorting);
  const scanned = useAppManagerStore((s) => s.scanned);
  const result = useAppManagerStore((s) => s.result);
  const history = useAppManagerStore((s) => s.history);
  const confirmDialog = useAppManagerStore((s) => s.confirmDialog);
  const historyOpen = useAppManagerStore((s) => s.historyOpen);
  const lastScanTime = useAppManagerStore((s) => s.lastScanTime);
  const lastUpdateCheck = useAppManagerStore((s) => s.lastUpdateCheck);
  const viewMode = useAppManagerStore((s) => s.viewMode);
  const selectedItem = useAppManagerStore((s) => s.selectedItem);
  const filterPanelOpen = useAppManagerStore((s) => s.filterPanelOpen);
  const selectedAppIds = useAppManagerStore((s) => s.selectedAppIds);
  const batchMode = useAppManagerStore((s) => s.batchMode);
  const batchResults = useAppManagerStore((s) => s.batchResults);
  const batchConfirmDialog = useAppManagerStore((s) => s.batchConfirmDialog);

  const setSearchQuery = useAppManagerStore((s) => s.setSearchQuery);
  const setActiveFilter = useAppManagerStore((s) => s.setActiveFilter);
  const setCategoryFilter = useAppManagerStore((s) => s.setCategoryFilter);
  const setSeriesFilter = useAppManagerStore((s) => s.setSeriesFilter);
  const setSorting = useAppManagerStore((s) => s.setSorting);
  const scanApps = useAppManagerStore((s) => s.scanApps);
  const refreshUpdates = useAppManagerStore((s) => s.refreshUpdates);
  const doUpgrade = useAppManagerStore((s) => s.doUpgrade);
  const doUninstall = useAppManagerStore((s) => s.doUninstall);
  const openConfirmDialog = useAppManagerStore((s) => s.openConfirmDialog);
  const closeConfirmDialog = useAppManagerStore((s) => s.closeConfirmDialog);
  const loadHistory = useAppManagerStore((s) => s.loadHistory);
  const setHistoryOpen = useAppManagerStore((s) => s.setHistoryOpen);
  const clearSelection = useAppManagerStore((s) => s.clearSelection);
  const setBatchMode = useAppManagerStore((s) => s.setBatchMode);
  const toggleSelectApp = useAppManagerStore((s) => s.toggleSelectApp);
  const openBatchConfirmDialog = useAppManagerStore((s) => s.openBatchConfirmDialog);
  const closeBatchConfirmDialog = useAppManagerStore((s) => s.closeBatchConfirmDialog);
  const clearBatchResults = useAppManagerStore((s) => s.clearBatchResults);
  const doBatchUpgrade = useAppManagerStore((s) => s.doBatchUpgrade);
  const doBatchUninstall = useAppManagerStore((s) => s.doBatchUninstall);
  const setViewMode = useAppManagerStore((s) => s.setViewMode);
  const setSelectedItem = useAppManagerStore((s) => s.setSelectedItem);
  const setFilterPanelOpen = useAppManagerStore((s) => s.setFilterPanelOpen);
  const installListApps = useAppManagerStore((s) => s.installListApps);
  const installConfirmDialog = useAppManagerStore((s) => s.installConfirmDialog);
  const doInstall = useAppManagerStore((s) => s.doInstall);
  const openInstallConfirmDialog = useAppManagerStore((s) => s.openInstallConfirmDialog);
  const closeInstallConfirmDialog = useAppManagerStore((s) => s.closeInstallConfirmDialog);
  const launchApp = useAppManagerStore((s) => s.launchApp);
  const revealApp = useAppManagerStore((s) => s.revealApp);
  const openExternal = useAppManagerStore((s) => s.openExternal);

  const [selectedInstallIds, setSelectedInstallIds] = useState<Set<string>>(new Set());
  const [installBatchMode, setInstallBatchMode] = useState(false);
  const [installDetailItem, setInstallDetailItem] = useState<InstallListAppInfo | null>(null);
  const pendingBatchInstallIds = useRef<string[]>([]);

  useEffect(() => { if (active && isTauriEnv() && !scanned) scanApps(); }, [active, scanApps, scanned]);
  useEffect(() => { if (scanned && apps.length > 0) refreshUpdates(); }, [scanned]);
  useEffect(() => { if (historyOpen) loadHistory(); }, [historyOpen]);

  useEffect(() => {
    if (!historyOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setHistoryOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [historyOpen, setHistoryOpen]);

  useEffect(() => {
    if (!selectedItem) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedItem(null); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedItem, setSelectedItem]);

  useEffect(() => {
    if (!installDetailItem) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setInstallDetailItem(null); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [installDetailItem]);

  useEffect(() => {
    setSelectedItem(null);
    setInstallDetailItem(null);
  }, [activeFilter, categoryFilter, seriesFilter, searchQuery]);

  const getOpStatus = useCallback((appId: string): OperationStatus => {
    const state = useAppManagerStore.getState();
    return state.operations[appId]?.status ?? "idle";
  }, []);

  const filteredApps = useMemo(() => {
    return filterAppManagerItems({
      apps,
      installListApps,
      searchQuery,
      activeFilter,
      categoryFilter,
      seriesFilter,
    });
  }, [apps, installListApps, searchQuery, activeFilter, categoryFilter, seriesFilter]);

  const handleLaunch = useCallback(async (app: AppInfo) => {
    if (!isTauriEnv()) return;
    await launchApp(app);
  }, [launchApp]);

  const handleReveal = useCallback(async (app: AppInfo) => {
    if (!isTauriEnv()) return;
    await revealApp(app);
  }, [revealApp]);

  const handleUpgradeFromColumn = useCallback((app: AppInfo) => {
    openConfirmDialog(app.appId, app.name, "upgrade");
  }, [openConfirmDialog]);

  const handleUninstallFromColumn = useCallback((app: AppInfo) => {
    openConfirmDialog(app.appId, app.name, "uninstall");
  }, [openConfirmDialog]);

  const handleInstall = useCallback((app: InstallListAppInfo) => {
    if (app.installed) return;
    openInstallConfirmDialog(app.id, app.name);
  }, [openInstallConfirmDialog]);

  const toggleInstallSelect = useCallback((id: string) => {
    setSelectedInstallIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearInstallSelection = useCallback(() => {
    setSelectedInstallIds(new Set());
  }, []);

  const handleBatchInstall = useCallback(() => {
    if (selectedInstallIds.size === 0) return;
    pendingBatchInstallIds.current = [...selectedInstallIds];
    openBatchConfirmDialog("install", selectedInstallIds.size);
  }, [selectedInstallIds, openBatchConfirmDialog]);

  const handleInstallConfirm = useCallback(async () => {
    const { appId } = installConfirmDialog;
    closeInstallConfirmDialog();
    const app = installListApps.find((a) => a.id === appId);
    if (app && !app.installed) await doInstall(app.id, app.name, app.installSource);
  }, [installConfirmDialog, closeInstallConfirmDialog, installListApps, doInstall]);

  const getRowAttributes = useCallback((app: AppInfo) => ({
    "data-context-type": "app-manager-row",
    "data-row-id": app.appId,
  }), []);

  const appRegistration = useMemo(() => ({
    id: "app-manager-row",
    selector: '[data-context-type="app-manager-row"]',
    resolveContext: (target: HTMLElement) => target.dataset.rowId || null,
    buildMenu: (ctx: unknown): ContextMenuConfig | null => {
      const appId = ctx as string;
      if (!appId) return null;
      const app = apps.find((a) => a.appId === appId);
      if (!app) return null;
      return {
        id: "app-manager-menu",
        items: [
          {
            id: "launch",
            label: t("appManager.actionLaunch"),
            icon: undefined,
            disabled: !app.allowedActions.launch,
            onClick: () => handleLaunch(app),
          },
          {
            id: "reveal",
            label: t(appManagerPlatformConfig.revealActionLabel),
            icon: undefined,
            disabled: !app.allowedActions.reveal,
            onClick: () => handleReveal(app),
          },
          ...(app.allowedActions.upgrade ? [{
            id: "upgrade",
            label: t("appManager.actionUpgrade"),
            icon: undefined,
            onClick: () => handleUpgradeFromColumn(app),
          }] : []),
          ...(app.allowedActions.uninstall ? [{
            id: "uninstall",
            label: t("appManager.actionUninstall"),
            icon: undefined,
            destructive: true,
            onClick: () => handleUninstallFromColumn(app),
          }] : []),
        ],
      };
    },
  } satisfies ContextMenuRegistration), [apps, t, handleLaunch, handleReveal, handleUpgradeFromColumn, handleUninstallFromColumn]);

  useContextMenuRegistration(appRegistration);

  const confirmPendingRef = useRef(false);
  const handleConfirmAction = useCallback(async () => {
    if (confirmPendingRef.current) return;
    const { appId, action } = confirmDialog;
    if (!appId) return;
    confirmPendingRef.current = true;
    closeConfirmDialog();
    try {
      if (action === "upgrade") await doUpgrade(appId);
      else await doUninstall(appId);
    } finally {
      confirmPendingRef.current = false;
    }
  }, [confirmDialog, closeConfirmDialog, doUpgrade, doUninstall]);

  const handleToggleBatchMode = useCallback(() => {
    if (batchMode) { clearSelection(); setBatchMode(false); }
    else { setSelectedItem(null); setBatchMode(true); }
  }, [batchMode, clearSelection, setBatchMode, setSelectedItem]);

  const selectedUpgradable = activeFilter !== "installList"
    ? (filteredApps as AppInfo[]).filter(a => a.allowedActions.upgrade && selectedAppIds.has(a.appId)).length
    : 0;
  const selectedUninstallable = activeFilter !== "installList"
    ? (filteredApps as AppInfo[]).filter(a => a.allowedActions.uninstall && selectedAppIds.has(a.appId)).length
    : 0;

  const handleBatchUpgrade = useCallback(() => {
    if (selectedUpgradable === 0) return;
    openBatchConfirmDialog("upgrade", selectedUpgradable);
  }, [selectedUpgradable, openBatchConfirmDialog]);

  const handleBatchUninstall = useCallback(() => {
    if (selectedUninstallable === 0) return;
    openBatchConfirmDialog("uninstall", selectedUninstallable);
  }, [selectedUninstallable, openBatchConfirmDialog]);

  const handleBatchConfirm = useCallback(async () => {
    const action = batchConfirmDialog.action;
    closeBatchConfirmDialog();
    if (action === "upgrade") await doBatchUpgrade();
    else if (action === "uninstall") await doBatchUninstall();
    else if (action === "install") {
      const ids = pendingBatchInstallIds.current;
      pendingBatchInstallIds.current = [];
      clearInstallSelection();
      for (const id of ids) {
        const app = installListApps.find(a => a.id === id);
        if (app && !app.installed) await doInstall(app.id, app.name, app.installSource);
      }
    }
  }, [batchConfirmDialog, closeBatchConfirmDialog, doBatchUpgrade, doBatchUninstall, installListApps, doInstall, clearInstallSelection]);

  const handleDetailUpgrade = useCallback(() => {
    if (!selectedItem) return;
    openConfirmDialog(selectedItem.appId, selectedItem.name, "upgrade");
  }, [selectedItem, openConfirmDialog]);

  const handleDetailUninstall = useCallback(() => {
    if (!selectedItem) return;
    openConfirmDialog(selectedItem.appId, selectedItem.name, "uninstall");
  }, [selectedItem, openConfirmDialog]);

  const tableColumns = useMemo(() => {
    try {
      return createAppManagerColumns(t, getOpStatus, handleLaunch, handleReveal, handleUpgradeFromColumn, handleUninstallFromColumn);
    } catch (e) {
      console.error("[AppManager] Failed to create columns:", e);
      return [];
    }
  }, [t, getOpStatus, handleLaunch, handleReveal, handleUpgradeFromColumn, handleUninstallFromColumn]);

  const renderGridCard = useCallback((app: AppInfo) => (
    <div className="rounded-xl border bg-card p-3 hover:ring-2 hover:ring-primary/30 transition-all h-full flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <AppIcon iconBase64={app.iconBase64} size={20} className="shrink-0 rounded-sm" />
        <span className="font-medium text-sm truncate">{app.name}</span>
        {app.isSystemApp && <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">{t("appManager.systemLabel")}</Badge>}
        {app.upgradeAvailable && <Badge variant="destructive" className="text-[10px] px-1 py-0 shrink-0">{t("appManager.updateAvailable")}</Badge>}
      </div>
      <p className="text-xs text-muted-foreground truncate">{app.bundleId !== "unknown" ? app.bundleId : "—"}</p>
      <p className="text-xs text-muted-foreground truncate">{app.version}</p>
      <p className="text-[10px] text-muted-foreground truncate">{app.sourceType}</p>
    </div>
  ), [t]);

  const handleOpenWebsite = useCallback((url: string | undefined) => {
    if (!url) return;
    void openExternal(url);
  }, [openExternal]);

  const installListColumns = useMemo(() => {
    return [
      {
        id: "name",
        header: t("appManager.column.name"),
        accessorFn: (app: InstallListAppInfo) => app.name,
        cell: ({ getValue }: any) => <span className="font-medium text-sm truncate">{getValue() as string}</span>,
      },
      {
        id: "description",
        header: t("appManager.column.description"),
        accessorFn: (app: InstallListAppInfo) => app.description,
        cell: ({ getValue }: any) => <span className="text-xs text-muted-foreground truncate">{getValue() as string}</span>,
      },
      {
        id: "status",
        header: t("appManager.column.status"),
        accessorFn: (app: InstallListAppInfo) => app.installed,
        cell: ({ row }: any) => {
          const app = row.original as InstallListAppInfo;
          return app.installed ? (
            <Badge variant="secondary" className="text-[10px]">{t("appManager.installListInstalled")}</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">{t("appManager.installListPending")}</Badge>
          );
        },
      },
      {
        id: "source",
        header: "Source",
        accessorFn: (app: InstallListAppInfo) => {
          const src = app.installSource;
          if (src.brew) return "brew";
          if (src.winget) return "winget";
          if (src.flatpak) return "flatpak";
          if (src.snap) return "snap";
          if (src.apt) return "apt";
          return src.url ? "url" : "none";
        },
        cell: ({ row }: any) => {
          const app = row.original as InstallListAppInfo;
          const src = app.installSource;
          return (
            <div className="flex gap-1 flex-wrap">
              {src.brew && <Badge variant="secondary" className="text-[10px]">Homebrew</Badge>}
              {src.winget && <Badge variant="secondary" className="text-[10px]">winget</Badge>}
              {src.flatpak && <Badge variant="secondary" className="text-[10px]">Flatpak</Badge>}
              {src.snap && <Badge variant="secondary" className="text-[10px]">Snap</Badge>}
              {src.apt && <Badge variant="secondary" className="text-[10px]">APT</Badge>}
              {!src.brew && !src.winget && !src.flatpak && !src.snap && !src.apt && src.url && (
                <Badge variant="secondary" className="text-[10px]">Download</Badge>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }: any) => {
          const app = row.original as InstallListAppInfo;
          return (
            <div className="flex items-center gap-1.5 justify-end">
              <Button size="sm" className="h-7 text-xs" disabled={app.installed} onClick={() => handleInstall(app)}>
                <Download size={12} className="mr-1" />{t("appManager.install")}
              </Button>
              {app.installSource.url && (
                <ToolbarButton icon={<ExternalLink size={12} />} tooltip={t("appManager.openWebsite")} onClick={() => handleOpenWebsite(app.installSource.url)} />
              )}
            </div>
          );
        },
      },
    ] as ColumnDef<InstallListAppInfo>[];
  }, [t, handleInstall, handleOpenWebsite, toggleInstallSelect, selectedInstallIds]);

  const renderInstallListCard = useCallback((app: InstallListAppInfo) => {
    const state = useAppManagerStore.getState().installStates[app.id];
    const isInstalling = state?.status === "running";
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="rounded-xl border bg-card p-4 flex flex-col hover:ring-2 hover:ring-primary/30 transition-all h-full relative">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="size-9 shrink-0 rounded-md bg-muted flex items-center justify-center">
                {app.installed ? (
                  <CheckCircle2 size={18} className="text-green-600" />
                ) : (
                  <Package size={18} className="text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium truncate pr-16">{app.name}</h4>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{app.description}</p>
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {app.installSource.brew && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">Homebrew</Badge>
                  )}
                  {app.installSource.winget && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">winget</Badge>
                  )}
                  {app.installSource.flatpak && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">Flatpak</Badge>
                  )}
                  {app.installSource.snap && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">Snap</Badge>
                  )}
                  {app.installSource.apt && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">APT</Badge>
                  )}
                  {!app.installSource.brew && !app.installSource.winget && !app.installSource.flatpak && !app.installSource.snap && !app.installSource.apt && app.installSource.url && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">Download</Badge>
                  )}
                </div>
                {app.installed && (app.installedVersion || app.installedPath) && (
                  <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                    {app.installedVersion && <p className="truncate">{app.installedVersion}</p>}
                    {app.installedPath && <p className="truncate">{app.installedPath}</p>}
                  </div>
                )}
              </div>
            </div>
            {app.installed ? (
              <Badge variant="secondary" className="absolute top-3 right-3 text-[10px] px-1.5 py-0.5">{t("appManager.installListInstalled")}</Badge>
            ) : (
              <Badge variant="outline" className="absolute top-3 right-3 text-[10px] px-1.5 py-0.5">{t("appManager.installListPending")}</Badge>
            )}
            <div className="flex items-center gap-1.5 mt-2.5">
              <Button
                className="flex-1 h-8"
                size="sm"
                disabled={isInstalling || app.installed}
                onClick={() => handleInstall(app)}
              >
                {isInstalling ? (
                  <><RotateCcw size={13} className="mr-1 animate-spin" />{t("appManager.installing")}</>
                ) : app.installed ? (
                  <><CheckCircle2 size={13} className="mr-1" />{t("appManager.installListInstalled")}</>
                ) : (
                  <><Download size={13} className="mr-1" />{t("appManager.install")}</>
                )}
              </Button>
              {app.installSource.url && (
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <ToolbarButton
                      icon={<ExternalLink size={14} />}
                      tooltip={t("appManager.openWebsite")}
                      onClick={() => handleOpenWebsite(app.installSource.url)}
                    />
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => navigator.clipboard.writeText(app.installSource.url!)}>
                      {t("appManager.copyWebsite")}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )}
            </div>
          </div>
        </ContextMenuTrigger>
        {app.installedPath && (
          <ContextMenuContent>
            <ContextMenuItem onClick={() => navigator.clipboard.writeText(app.installedPath!)}>
              {t("appManager.copyPath")}
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>
    );
  }, [t, handleInstall, handleOpenWebsite]);

  const renderDetail = useCallback((app: AppInfo) => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AppIcon iconBase64={app.iconBase64} size={40} className="shrink-0 rounded-md" />
        <div>
          <h3 className="font-semibold text-sm">{app.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{app.bundleId}</p>
        </div>
      </div>
      <DetailSection label={t("appManager.info")}>
        <MetadataRow label={t("appManager.detailVersion")} value={app.version} />
        <MetadataRow label={t("appManager.detailPath")} value={app.installPath} />
        <MetadataRow label={t("appManager.detailSource")} value={app.sourceType} />
        <MetadataRow label={t("appManager.detailSourceId")} value={app.sourceId || "—"} />
        <MetadataRow label={t("appManager.detailType")} value={app.isSystemApp ? t("appManager.filterSystem") : t("appManager.filterUser")} />
        {app.lastModified > 0 && (
          <MetadataRow label={t("appManager.detailModified")} value={new Date(app.lastModified * 1000).toLocaleDateString()} />
        )}
      </DetailSection>
      <DetailSection label={t("appManager.column.actions")}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!app.allowedActions.launch} onClick={() => handleLaunch(app)}>
            <Play size={13} className="mr-1" />{t("appManager.actionLaunch")}
          </Button>
          <Button size="sm" variant="outline" disabled={!app.allowedActions.reveal} onClick={() => handleReveal(app)}>
            <Folder size={13} className="mr-1" />{t(appManagerPlatformConfig.revealActionLabel)}
          </Button>
          {app.allowedActions.upgrade && (
            <Button size="sm" variant="outline" onClick={handleDetailUpgrade}>
              <ArrowUpCircle size={13} className="mr-1" />{t("appManager.actionUpgrade")}
            </Button>
          )}
          {app.allowedActions.uninstall && (
            <Button size="sm" variant="outline" className="text-red-600" onClick={handleDetailUninstall}>
              <Trash2 size={13} className="mr-1" />{t("appManager.actionUninstall")}
            </Button>
          )}
        </div>
      </DetailSection>
    </div>
  ), [t, handleLaunch, handleReveal, handleDetailUpgrade, handleDetailUninstall]);

  const renderInstallDetail = useCallback((app: InstallListAppInfo) => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-10 shrink-0 rounded-md bg-muted flex items-center justify-center">
          {app.installed ? <CheckCircle2 size={20} className="text-green-600" /> : <Package size={20} className="text-muted-foreground" />}
        </div>
        <div>
          <h3 className="font-semibold text-sm">{app.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{app.bundleId}</p>
        </div>
      </div>
      <DetailSection label={t("appManager.info")}>
        {app.installedVersion && <MetadataRow label={t("appManager.detailVersion")} value={app.installedVersion} />}
        {app.installedPath && <MetadataRow label={t("appManager.detailPath")} value={app.installedPath} />}
        <MetadataRow label="Source" value={(() => {
          const s = app.installSource;
          if (s.brew) return "Homebrew";
          if (s.winget) return "winget";
          if (s.flatpak) return "Flatpak";
          if (s.snap) return "Snap";
          if (s.apt) return "APT";
          return "Download";
        })()} />
        {app.description && <MetadataRow label={t("appManager.column.description")} value={app.description} />}
      </DetailSection>
      <DetailSection label={t("appManager.column.actions")}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={app.installed} onClick={() => handleInstall(app)}>
            <Download size={13} className="mr-1" />{app.installed ? t("appManager.installListInstalled") : t("appManager.install")}
          </Button>
          {app.installSource.url && (
            <Button size="sm" variant="outline" onClick={() => handleOpenWebsite(app.installSource.url)}>
              <ExternalLink size={13} className="mr-1" />{t("appManager.openWebsite")}
            </Button>
          )}
        </div>
      </DetailSection>
    </div>
  ), [t, handleInstall, handleOpenWebsite]);

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (activeFilter !== "all" ? 1 : 0) +
    ((categoryFilter || seriesFilter) ? 1 : 0);
  const visibleInstallListApps = activeFilter === "installList" ? (filteredApps as InstallListAppInfo[]) : installListApps;
  const visibleInstallListInstalledCount = visibleInstallListApps.filter((app) => app.installed).length;
  const visibleInstallListPendingCount = visibleInstallListApps.length - visibleInstallListInstalledCount;
  const caps = result?.platformCapabilities;

  return (
    <AppManagerErrorBoundary>
      {!isTauriEnv() ? (
        <DesktopOnly title={t("appManager.title")} icon={<AppWindow size={32} className="opacity-40" />} />
      ) : (
      <div className="h-full flex flex-col gap-3">
        {/* --- Action Bar --- */}
        <Card className="shrink-0">
          <CardContent className="flex items-center gap-1.5 py-2.5">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("appManager.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-8"
                disabled={loading}
              />
            </div>
            <div className="flex-1" />
            <ToolbarButton
              icon={<RefreshCw size={15} className={loading ? "animate-spin" : ""} />}
              tooltip={loading ? t("appManager.scanning") : t("appManager.refresh")}
              onClick={scanApps}
            />
            <ToolbarButton
              icon={<History size={15} />}
              tooltip={t("appManager.operationHistory")}
              onClick={() => setHistoryOpen(!historyOpen)}
              active={historyOpen}
            />
          </CardContent>
        </Card>

        {/* Error Banner */}
        {error && <Alert variant="destructive" className="shrink-0"><AlertDescription>{error}</AlertDescription></Alert>}

        {/* Batch Results */}
        {batchResults && (
          <div className="shrink-0 rounded-lg border p-2 bg-background flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-green-600">{t("appManager.batchSucceeded", { n: batchResults.succeeded })}</span>
              {batchResults.failed > 0 && <span className="text-red-600">{t("appManager.batchFailed", { n: batchResults.failed })}</span>}
              <span className="text-muted-foreground">{t("appManager.batchTotal", { n: batchResults.total })}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearBatchResults}>
              <X size={12} />
            </Button>
          </div>
        )}

        {/* --- Three-Column Layout --- */}
        
          <ThreeColumnLayout
            filterOpen={filterPanelOpen}
            detailOpen={!!selectedItem || !!installDetailItem}
            onCloseDetail={() => { setSelectedItem(null); setInstallDetailItem(null); }}
            filter={
              <FilterPanel open={filterPanelOpen} onToggle={() => setFilterPanelOpen(!filterPanelOpen)}
                activeFilterCount={activeFilterCount} title={t("appManager.filters")}>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <button
                        onClick={() => setActiveFilter(activeFilter === "installList" ? "all" : activeFilter)}
                        className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                          activeFilter !== "installList"
                            ? "bg-primary text-primary-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        {t("appManager.filterBy")}
                      </button>
                      <span className="text-muted-foreground/50 text-xs select-none">|</span>
                      <button
                        onClick={() => setActiveFilter("installList")}
                        className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                          activeFilter === "installList"
                            ? "bg-primary text-primary-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                      >
                        {t("appManager.installList")}
                      </button>
                    </div>
                    {activeFilter !== "installList" && (
                      <div className="flex flex-col gap-1">
                        {APP_FILTER_OPTIONS.map((option) => (
                          <Badge key={option.key} variant={activeFilter === option.key ? "default" : "outline"}
                            className="cursor-pointer select-none text-xs justify-start"
                            onClick={() => setActiveFilter(option.key)}>
                            {t(option.labelKey)}
                            {option.key === "all" && ` (${apps.length})`}
                            {option.key === "managed" && ` (${result?.managedCount ?? 0})`}
                            {option.key === "upgradable" && ` (${apps.filter(a => a.upgradeAvailable).length})`}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="pt-2 border-t">
                    <CategoryFilter
                      apps={activeFilter === "installList" ? (installListApps as CategorizableItem[]) : apps}
                      categorySelected={categoryFilter}
                      seriesSelected={seriesFilter}
                      onCategoryChange={setCategoryFilter}
                      onSeriesChange={setSeriesFilter}
                    />
                  </div>
                  {caps && (
                    <div className="pt-2 border-t">
                      <p className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">{t("appManager.platform")}</p>
                      <div className="space-y-1.5 text-xs">
                        {caps.brewAvailable && <p className="text-green-600">✓ Homebrew</p>}
                        {caps.wingetAvailable && <p className="text-green-600">✓ winget</p>}
                        {caps.flatpakAvailable && <p className="text-green-600">✓ Flatpak</p>}
                        {caps.snapAvailable && <p className="text-green-600">✓ Snap</p>}
                        {caps.aptAvailable && <p className="text-green-600">✓ APT</p>}
                        {!caps.brewAvailable && !caps.wingetAvailable && !caps.flatpakAvailable && !caps.snapAvailable && !caps.aptAvailable && (
                          <p className="text-muted-foreground">{t("appManager.noPmAvailable")}</p>)}
                      </div>
                    </div>
                  )}
                  <div className="pt-2 border-t">
                    <div className="text-[11px] text-muted-foreground space-y-1">
                      {lastScanTime > 0 && <p>{t("appManager.lastScan")}: {new Date(lastScanTime).toLocaleTimeString()}</p>}
                      {lastUpdateCheck > 0 && <p>{t("appManager.lastUpdate")}: {new Date(lastUpdateCheck).toLocaleTimeString()}</p>}
                      {result && <p>{t("appManager.summaryShort", { total: result.totalCount, managed: result.managedCount })}</p>}
                    </div>
                  </div>
                </div>
              </FilterPanel>
            }
            content={
              <div className="h-full flex flex-col gap-3">
                <div className="flex-1 min-h-0">
                  {activeFilter === "installList" ? (
                    <ContentView<InstallListAppInfo>
                      data={filteredApps as InstallListAppInfo[]}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      columns={installListColumns}
                      getRowId={(app) => app.id}
                      renderGridCard={renderInstallListCard}
                      estimatedCardHeight={220}
                      gridGap={10}
                      gridRowPadding={[4, 12]}
                      onItemClick={(app) => setInstallDetailItem(app)}
                      batchMode={installBatchMode}
                      selectedIds={selectedInstallIds}
                      onToggleSelect={toggleInstallSelect}
                      showViewToggle={true}
                      summary={undefined}
                      actions={
                        <>
                          <ToolbarButton
                            icon={<CheckSquare size={15} />}
                            tooltip={installBatchMode ? t("appManager.batchModeOff") : t("appManager.batchMode")}
                            onClick={() => { setInstallBatchMode(v => !v); clearInstallSelection(); }}
                            active={installBatchMode}
                          />
                          <ToolbarButton
                            icon={<Filter size={15} />}
                            tooltip={t("appManager.filters")}
                            onClick={() => setFilterPanelOpen(!filterPanelOpen)}
                            active={filterPanelOpen}
                          />
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {t("appManager.installListSummary", {
                              total: visibleInstallListApps.length,
                              pending: visibleInstallListPendingCount,
                              installed: visibleInstallListInstalledCount,
                            })}
                          </span>
                        </>
                      }
                      rightActions={installBatchMode ? (
                        <div className="flex items-center gap-1">
                          <ToolbarButton
                            icon={<Download size={15} />}
                            tooltip={`${t("appManager.installSelected")} (${selectedInstallIds.size})`}
                            disabled={selectedInstallIds.size === 0}
                            onClick={handleBatchInstall}
                          />
                          <ToolbarButton
                            icon={<X size={15} />}
                            tooltip={t("appManager.clearSelection")}
                            onClick={() => { clearInstallSelection(); }}
                          />
                        </div>
                      ) : undefined}
                      emptyIcon={<Search size={32} className="opacity-30" />}
                      emptyText={t("appManager.installNoResults")}
                    />
                  ) : (
                    <ContentView<AppInfo>
                      data={filteredApps as AppInfo[]}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      columns={tableColumns}
                      getRowId={(app) => app.appId}
                      renderGridCard={renderGridCard}
                      estimatedCardHeight={120}
                      onItemClick={(app) => setSelectedItem(app)}
                      sorting={sorting}
                      onSortingChange={setSorting}
                      loading={loading}
                      selectedId={selectedItem?.appId ?? null}
                      batchMode={batchMode}
                      selectedIds={selectedAppIds}
                      onToggleSelect={toggleSelectApp}
                      getRowAttributes={getRowAttributes}
                      actions={
                        <>
                          {scanned && (
                            <ToolbarButton
                              icon={<CheckSquare size={15} />}
                              tooltip={batchMode ? t("appManager.batchModeOff") : t("appManager.batchMode")}
                              onClick={handleToggleBatchMode}
                              active={batchMode}
                            />
                          )}
                          <ToolbarButton
                            icon={<Filter size={15} />}
                            tooltip={t("appManager.filters")}
                            onClick={() => setFilterPanelOpen(!filterPanelOpen)}
                            active={filterPanelOpen || activeFilter !== "all"}
                          />
                        </>
                      }
                      rightActions={batchMode ? (
                        <div className="flex items-center gap-1">
                          <ToolbarButton
                            icon={<ArrowUpCircle size={15} className={selectedUpgradable > 0 ? "text-orange-500" : ""} />}
                            tooltip={`${t("appManager.batchUpgrade")} (${selectedUpgradable})`}
                            disabled={selectedUpgradable === 0}
                            onClick={handleBatchUpgrade}
                          />
                          <ToolbarButton
                            icon={<Trash2 size={15} />}
                            tooltip={`${t("appManager.batchUninstall")} (${selectedUninstallable})`}
                            disabled={selectedUninstallable === 0}
                            onClick={handleBatchUninstall}
                          />
                          <ToolbarButton
                            icon={<X size={15} />}
                            tooltip={t("appManager.batchClear")}
                            onClick={clearSelection}
                          />
                        </div>
                      ) : undefined}
                      emptyIcon={
                        scanned
                          ? <Search size={32} className="opacity-30" />
                          : <AppWindow size={32} className="opacity-30" />
                      }
                      emptyText={
                        scanned
                          ? (filteredApps.length === 0 && apps.length > 0 ? t("appManager.noResults") : t("appManager.empty"))
                          : t("appManager.startHint")
                      }
                    />
                  )}
                </div>
              </div>
            }
            detail={
              activeFilter === "installList" ? (
                <DetailPanel<InstallListAppInfo>
                  item={installDetailItem}
                  open={!!installDetailItem}
                  onClose={() => setInstallDetailItem(null)}
                  title={t("appManager.details")}
                  renderDetail={renderInstallDetail}
                />
              ) : (
                <DetailPanel
                  item={selectedItem}
                  open={!!selectedItem}
                  onClose={() => setSelectedItem(null)}
                  title={t("appManager.details")}
                  renderDetail={renderDetail}
                />
              )
            }
          />

        {/* --- History Drawer --- */}
        {historyOpen && (
          <>
            <div className="fixed inset-0 bg-black/30 z-40 transition-opacity" onClick={() => setHistoryOpen(false)} />
            <div className="fixed right-0 top-0 bottom-0 w-[300px] border-l bg-card z-50 flex flex-col shadow-lg animate-slide-in-right">
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                <span className="text-sm font-semibold">{t("appManager.operationHistory")}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setHistoryOpen(false)}><X size={14} /></Button>
              </div>
            <div className="flex-1 overflow-y-auto p-3">
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">{t("appManager.historyEmpty")}</p>
              ) : (
                <div className="space-y-1.5">
                  {[...history].reverse().map((record, idx) => (
                    <div key={`${record.timestamp}-${idx}`} className="rounded-md border bg-background p-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          {record.success ? <CheckCircle2 className="size-3.5 text-green-500" /> : <AlertCircle className="size-3.5 text-red-500" />}
                          <span className="font-medium">{record.action}</span>
                          {record.errorCode && <Badge variant={record.permissionIssue ? "destructive" : "outline"} className="text-[9px] px-1 py-0">{record.errorCode}</Badge>}
                        </div>
                        <span className="text-muted-foreground">{new Date(record.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-muted-foreground truncate">{record.appName}</div>
                      {record.output && (
                        <p className={`mt-1 truncate ${record.success ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} title={record.output}>{record.output}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
          </>
        )}

        {/* Single Confirm Dialog */}
        <AlertDialog open={confirmDialog.open} onOpenChange={(open) => { if (!open) closeConfirmDialog(); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {confirmDialog.action === "uninstall" ? <Trash2 size={18} className="text-red-500" /> : <ArrowUpCircle size={18} className="text-orange-500" />}
                {confirmDialog.action === "uninstall" ? t("appManager.confirmUninstallTitle") : t("appManager.confirmUpgradeTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDialog.action === "uninstall"
                  ? t("appManager.confirmUninstallDescription", { name: confirmDialog.appName })
                  : t("appManager.confirmUpgradeDescription", { name: confirmDialog.appName })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("appManager.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmAction}
                className={confirmDialog.action === "uninstall" ? "bg-red-600 hover:bg-red-700" : ""}>
                {confirmDialog.action === "uninstall" ? t("appManager.confirmUninstall") : t("appManager.confirmUpgrade")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Install Confirm Dialog */}
        <AlertDialog open={installConfirmDialog.open} onOpenChange={(open) => { if (!open) closeInstallConfirmDialog(); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Download size={18} className="text-blue-500" />
                {t("appManager.installConfirmTitle", { name: installConfirmDialog.appName })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("appManager.installConfirmDescription", { name: installConfirmDialog.appName })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("appManager.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleInstallConfirm}>
                {t("appManager.confirmInstall")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

          <AlertDialog open={batchConfirmDialog.open} onOpenChange={(open) => { if (!open) closeBatchConfirmDialog(); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {batchConfirmDialog.action === "install" ? (
                  <Download size={18} className="text-blue-500" />
                ) : (
                  <Layers size={18} />
                )}
                {batchConfirmDialog.action === "install"
                  ? t("appManager.batchInstallConfirmTitle", { count: batchConfirmDialog.count })
                  : t("appManager.batchConfirmTitle", {
                      action: batchConfirmDialog.action === "uninstall" ? t("appManager.batchActionUninstall") : t("appManager.batchActionUpgrade"),
                      count: batchConfirmDialog.count,
                    })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {batchConfirmDialog.action === "install"
                  ? t("appManager.batchInstallConfirmDescription", { count: batchConfirmDialog.count })
                  : batchConfirmDialog.action === "uninstall"
                  ? t("appManager.batchUninstallConfirmDescription", { count: batchConfirmDialog.count })
                  : t("appManager.batchUpgradeConfirmDescription", { count: batchConfirmDialog.count })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("appManager.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleBatchConfirm}
                className={batchConfirmDialog.action === "uninstall" ? "bg-red-600 hover:bg-red-700" : ""}>
                {batchConfirmDialog.action === "install"
                  ? t("appManager.confirmInstall")
                  : batchConfirmDialog.action === "uninstall" ? t("appManager.confirmUninstall") : t("appManager.confirmUpgrade")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      )}
    </AppManagerErrorBoundary>
  );
}

export default AppManager;
