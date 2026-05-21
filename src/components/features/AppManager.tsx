import { useEffect, useMemo, useCallback, Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "@tauri-apps/api/core";
import {
  RefreshCw, Search, AppWindow, History, X,
  CheckCircle2, AlertCircle, ArrowUpCircle, Trash2,
  Layers, CheckSquare, ArrowUp, Filter,
  Play, Folder,
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
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { FilterPanel } from "@/components/layout/FilterPanel";
import { DetailPanel, MetadataRow, DetailSection } from "@/components/layout/DetailPanel";
import { ContentView } from "@/components/content/ContentView";
import { useAppManagerStore, APP_FILTER_OPTIONS, type OperationStatus } from "@/stores/app-manager";
import { launchApp, revealAppInFinder } from "@/lib/tauri/commands";
import { createAppManagerColumns } from "@/features/app-manager/columns";
import { CategoryFilter } from "@/features/app-manager/CategoryFilter";
import { classifyApp } from "@/features/app-manager/app-categories";
import { classifySeries } from "@/features/app-manager/app-series";
import { AppIcon } from "@/components/features/AppIcon";
import type { AppInfo } from "@/lib/tauri/types";
import { useContextMenuRegistration } from "@/features/context-menu/useContextMenuRegistration";
import type { ContextMenuConfig, ContextMenuRegistration } from "@/features/context-menu/types";
import { DesktopOnly } from "@/components/common/DesktopOnly";

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
  try { return isTauri(); } catch { return false; }
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
  const doBatchUpgrade = useAppManagerStore((s) => s.doBatchUpgrade);
  const doBatchUninstall = useAppManagerStore((s) => s.doBatchUninstall);
  const setViewMode = useAppManagerStore((s) => s.setViewMode);
  const setSelectedItem = useAppManagerStore((s) => s.setSelectedItem);
  const setFilterPanelOpen = useAppManagerStore((s) => s.setFilterPanelOpen);

  useEffect(() => { if (active && isTauriEnv() && !scanned) scanApps(); }, [active, scanApps, scanned]);
  useEffect(() => { if (scanned && apps.length > 0) refreshUpdates(); }, [scanned]);
  useEffect(() => { if (historyOpen) loadHistory(); }, [historyOpen]);

  useEffect(() => {
    if (!historyOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setHistoryOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [historyOpen, setHistoryOpen]);

  const getOpStatus = useCallback((appId: string): OperationStatus => {
    const state = useAppManagerStore.getState();
    return state.operations[appId]?.status ?? "idle";
  }, []);

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!app.name.toLowerCase().includes(q) && !app.installPath.toLowerCase().includes(q) && !app.bundleId.toLowerCase().includes(q)) return false;
      }
      switch (activeFilter) {
        case "user": if (app.isSystemApp) return false; break;
        case "system": if (!app.isSystemApp) return false; break;
        case "launchable": if (!app.allowedActions.launch) return false; break;
        case "managed": if (!app.canUpgrade && !app.canUninstall) return false; break;
        case "upgradable": if (!app.upgradeAvailable) return false; break;
      }
      if (categoryFilter && classifyApp(app) !== categoryFilter) return false;
      if (seriesFilter && classifySeries(app) !== seriesFilter) return false;
      return true;
    });
  }, [apps, searchQuery, activeFilter, categoryFilter, seriesFilter]);

  const handleLaunch = useCallback(async (app: AppInfo) => {
    if (!isTauriEnv()) return;
    try { await launchApp(app.installPath); } catch (e) { console.warn(e); }
  }, []);

  const handleReveal = useCallback(async (app: AppInfo) => {
    if (!isTauriEnv()) return;
    try { await revealAppInFinder(app.installPath); } catch (e) { console.warn(e); }
  }, []);

  const handleUpgradeFromColumn = useCallback((app: AppInfo) => {
    openConfirmDialog(app.appId, app.name, "upgrade");
  }, [openConfirmDialog]);

  const handleUninstallFromColumn = useCallback((app: AppInfo) => {
    openConfirmDialog(app.appId, app.name, "uninstall");
  }, [openConfirmDialog]);

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
            label: t("appManager.actionReveal"),
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

  const handleConfirmAction = useCallback(async () => {
    const { appId, action } = confirmDialog;
    closeConfirmDialog();
    if (action === "upgrade") await doUpgrade(appId);
    else await doUninstall(appId);
  }, [confirmDialog, closeConfirmDialog, doUpgrade, doUninstall]);

  const handleToggleBatchMode = useCallback(() => {
    if (batchMode) { clearSelection(); setBatchMode(false); }
    else setBatchMode(true);
  }, [batchMode, clearSelection, setBatchMode]);

  const selectedCount = selectedAppIds.size;
  const selectedUpgradable = filteredApps.filter(a => a.allowedActions.upgrade && selectedAppIds.has(a.appId)).length;
  const selectedUninstallable = filteredApps.filter(a => a.allowedActions.uninstall && selectedAppIds.has(a.appId)).length;

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
    else await doBatchUninstall();
  }, [batchConfirmDialog, closeBatchConfirmDialog, doBatchUpgrade, doBatchUninstall]);

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
            <Folder size={13} className="mr-1" />{t("appManager.actionReveal")}
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

  const activeFilterCount = (searchQuery.trim() ? 1 : 0) + (activeFilter !== "all" ? 1 : 0) + ((categoryFilter || seriesFilter) ? 1 : 0);
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
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => useAppManagerStore.setState({ batchResults: null })}>
              <X size={12} />
            </Button>
          </div>
        )}

        {/* --- Three-Column Layout --- */}
        
          <ThreeColumnLayout
            filterOpen={filterPanelOpen}
            detailOpen={!!selectedItem}
            filter={
              <FilterPanel open={filterPanelOpen} onToggle={() => setFilterPanelOpen(!filterPanelOpen)}
                activeFilterCount={activeFilterCount} title={t("appManager.filters")}>
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">{t("appManager.filterBy")}</p>
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
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
                      {seriesFilter ? t("appManager.filterBySeries") : t("appManager.filterByCategory")}
                    </p>
                    <CategoryFilter
                      apps={apps}
                      categorySelected={categoryFilter}
                      seriesSelected={seriesFilter}
                      onCategoryChange={setCategoryFilter}
                      onSeriesChange={setSeriesFilter}
                    />
                  </div>
                  {batchMode && selectedCount > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
                        {t("appManager.batchSelected", { count: selectedCount })}</p>
                      <div className="flex flex-col gap-1.5">
                        <Button variant="outline" size="sm" disabled={selectedUpgradable === 0} onClick={handleBatchUpgrade}>
                          <ArrowUp size={13} className="mr-1" />{t("appManager.batchUpgrade")} ({selectedUpgradable})</Button>
                        <Button variant="outline" size="sm" className="text-red-600" disabled={selectedUninstallable === 0} onClick={handleBatchUninstall}>
                          <Trash2 size={13} className="mr-1" />{t("appManager.batchUninstall")} ({selectedUninstallable})</Button>
                        <Button variant="ghost" size="sm" onClick={clearSelection}>
                          <X size={13} className="mr-1" />{t("appManager.batchClear")}</Button>
                      </div>
                    </div>
                  )}
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
              <ContentView
                data={filteredApps}
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
            }
            detail={
              <DetailPanel
                item={selectedItem}
                open={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                title={t("appManager.details")}
                renderDetail={renderDetail}
              />
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

        {/* Batch Confirm Dialog */}
        <AlertDialog open={batchConfirmDialog.open} onOpenChange={(open) => { if (!open) closeBatchConfirmDialog(); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Layers size={18} />
                {t("appManager.batchConfirmTitle", {
                  action: batchConfirmDialog.action === "uninstall" ? t("appManager.batchActionUninstall") : t("appManager.batchActionUpgrade"),
                  count: batchConfirmDialog.count,
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {batchConfirmDialog.action === "uninstall"
                  ? t("appManager.batchUninstallConfirmDescription", { count: batchConfirmDialog.count })
                  : t("appManager.batchUpgradeConfirmDescription", { count: batchConfirmDialog.count })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("appManager.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleBatchConfirm}
                className={batchConfirmDialog.action === "uninstall" ? "bg-red-600 hover:bg-red-700" : ""}>
                {batchConfirmDialog.action === "uninstall" ? t("appManager.confirmUninstall") : t("appManager.confirmUpgrade")}
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
