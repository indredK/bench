import { useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "@tauri-apps/api/core";
import {
  RefreshCw,
  Search,
  AppWindow,
  History,
  X,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  ArrowUpCircle,
  Trash2,
  Info,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/DataTable";
import { createAppManagerColumns } from "@/features/app-manager/columns";
import {
  useAppManagerStore,
  type AppFilterKey,
  APP_FILTER_OPTIONS,
  type OperationStatus,
} from "@/stores/app-manager";
import { launchApp, revealAppInFinder } from "@/lib/tauri/commands";
import type { AppInfo } from "@/lib/tauri/types";

function isTauriEnv(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

function AppManager({ active }: { active: boolean }) {
  const { t } = useTranslation();

  const apps = useAppManagerStore((s) => s.apps);
  const loading = useAppManagerStore((s) => s.loading);
  const error = useAppManagerStore((s) => s.error);
  const searchQuery = useAppManagerStore((s) => s.searchQuery);
  const activeFilter = useAppManagerStore((s) => s.activeFilter);
  const sorting = useAppManagerStore((s) => s.sorting);
  const scanned = useAppManagerStore((s) => s.scanned);
  const result = useAppManagerStore((s) => s.result);
  const operations = useAppManagerStore((s) => s.operations);
  const history = useAppManagerStore((s) => s.history);
  const confirmDialog = useAppManagerStore((s) => s.confirmDialog);
  const historyOpen = useAppManagerStore((s) => s.historyOpen);

  const setSearchQuery = useAppManagerStore((s) => s.setSearchQuery);
  const setActiveFilter = useAppManagerStore((s) => s.setActiveFilter);
  const setSorting = useAppManagerStore((s) => s.setSorting);
  const scanApps = useAppManagerStore((s) => s.scanApps);
  const refreshUpdates = useAppManagerStore((s) => s.refreshUpdates);
  const doUpgrade = useAppManagerStore((s) => s.doUpgrade);
  const doUninstall = useAppManagerStore((s) => s.doUninstall);
  const openConfirmDialog = useAppManagerStore((s) => s.openConfirmDialog);
  const closeConfirmDialog = useAppManagerStore((s) => s.closeConfirmDialog);
  const loadHistory = useAppManagerStore((s) => s.loadHistory);
  const setHistoryOpen = useAppManagerStore((s) => s.setHistoryOpen);

  // Auto-scan on first visit
  useEffect(() => {
    if (active && isTauriEnv() && !scanned) {
      scanApps();
    }
  }, [active, scanApps, scanned]);

  // Refresh update status after scan
  useEffect(() => {
    if (scanned && apps.length > 0) {
      refreshUpdates();
    }
  }, [scanned]);

  // Load history when panel opens
  useEffect(() => {
    if (historyOpen) {
      loadHistory();
    }
  }, [historyOpen]);

  const getOpStatus = useCallback(
    (appId: string): OperationStatus => {
      return operations[appId]?.status ?? "idle";
    },
    [operations],
  );

  // Filter apps
  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = app.name.toLowerCase().includes(q);
        const matchesPath = app.installPath.toLowerCase().includes(q);
        const matchesBundle = app.bundleId.toLowerCase().includes(q);
        if (!matchesName && !matchesPath && !matchesBundle) return false;
      }

      // Filter
      switch (activeFilter) {
        case "user":
          if (app.isSystemApp) return false;
          break;
        case "system":
          if (!app.isSystemApp) return false;
          break;
        case "launchable":
          if (!app.allowedActions.launch) return false;
          break;
        case "managed":
          if (!app.canUpgrade && !app.canUninstall) return false;
          break;
        case "upgradable":
          if (!app.upgradeAvailable) return false;
          break;
        case "all":
        default:
          break;
      }

      return true;
    });
  }, [apps, searchQuery, activeFilter]);

  // --- Action handlers ---

  const handleLaunch = useCallback(async (app: AppInfo) => {
    if (!isTauriEnv()) return;
    try {
      await launchApp(app.installPath);
    } catch (e) {
      console.warn("[AppManager] Launch failed:", e);
    }
  }, []);

  const handleReveal = useCallback(async (app: AppInfo) => {
    if (!isTauriEnv()) return;
    try {
      await revealAppInFinder(app.installPath);
    } catch (e) {
      console.warn("[AppManager] Reveal failed:", e);
    }
  }, []);

  const handleUpgradeClick = useCallback((app: AppInfo) => {
    openConfirmDialog(app.appId, app.name, "upgrade");
  }, [openConfirmDialog]);

  const handleUninstallClick = useCallback((app: AppInfo) => {
    openConfirmDialog(app.appId, app.name, "uninstall");
  }, [openConfirmDialog]);

  const handleConfirmAction = useCallback(async () => {
    const { appId, action } = confirmDialog;
    closeConfirmDialog();
    if (action === "upgrade") {
      await doUpgrade(appId);
    } else {
      await doUninstall(appId);
    }
  }, [confirmDialog, closeConfirmDialog, doUpgrade, doUninstall]);

  const tableColumns = useMemo(
    () =>
      createAppManagerColumns(
        t,
        getOpStatus,
        handleLaunch,
        handleReveal,
        handleUpgradeClick,
        handleUninstallClick,
      ),
    [t, getOpStatus, handleLaunch, handleReveal, handleUpgradeClick, handleUninstallClick],
  );

  const hasActiveFilter = searchQuery.trim().length > 0 || activeFilter !== "all";

  // --- History render helpers ---
  const actionIcon = (action: string, success: boolean) => {
    const cls = "size-3.5";
    switch (action) {
      case "uninstall":
        return success ? (
          <CheckCircle2 className={`${cls} text-green-500`} />
        ) : (
          <AlertCircle className={`${cls} text-red-500`} />
        );
      case "upgrade":
        return success ? (
          <CheckCircle2 className={`${cls} text-green-500`} />
        ) : (
          <AlertCircle className={`${cls} text-red-500`} />
        );
      default:
        return <Info className={`${cls} text-muted-foreground`} />;
    }
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AppWindow size={20} />
              {t("appManager.title")}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={t("appManager.operationHistory")}
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                <History size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={scanApps}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <RefreshCw size={14} className="mr-1.5 animate-spin" />
                    {t("appManager.scanning")}
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} className="mr-1.5" />
                    {t("appManager.refresh")}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 flex flex-row gap-3">
          {/* Main content */}
          <div className={`flex-1 min-w-0 flex flex-col ${historyOpen ? "mr-0" : ""}`}>
            {/* Error banner */}
            {error && (
              <Alert variant="destructive" className="mb-3 shrink-0">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Non-Tauri warning */}
            {!isTauriEnv() && !loading && apps.length === 0 && (
              <Alert className="mb-3 shrink-0 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800">
                <AlertDescription className="text-indigo-700 dark:text-indigo-300">
                  {t("appManager.browserWarning")}
                </AlertDescription>
              </Alert>
            )}

            {/* Search + Filter bar */}
            {scanned && (
              <div className="mb-3 shrink-0 space-y-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    placeholder={t("appManager.searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    disabled={loading}
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {APP_FILTER_OPTIONS.map((option) => (
                    <Badge
                      key={option.key}
                      variant={activeFilter === option.key ? "default" : "outline"}
                      className="cursor-pointer select-none text-xs"
                      onClick={() => setActiveFilter(option.key)}
                    >
                      {t(option.labelKey)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            {scanned && result && (
              <div className="flex items-center justify-between mb-2 shrink-0">
                <p className="text-sm text-muted-foreground">
                  {hasActiveFilter
                    ? t("appManager.filteredSummary", {
                        visible: filteredApps.length,
                        total: apps.length,
                      })
                    : t("appManager.summary", {
                        total: result.totalCount,
                        user: result.userCount,
                        system: result.systemCount,
                        managed: result.managedCount,
                        time: ((result.scanTimeMs ?? 0) / 1000).toFixed(2),
                      })}
                </p>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-h-0">
              {loading && apps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground rounded-lg border">
                  <RefreshCw size={28} className="animate-spin text-primary" />
                  <p>{t("appManager.scanning")}</p>
                </div>
              ) : scanned && apps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground rounded-lg border gap-2">
                  <AppWindow size={32} className="opacity-30" />
                  <p>{t("appManager.empty")}</p>
                </div>
              ) : scanned && apps.length > 0 && filteredApps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground rounded-lg border gap-2">
                  <Search size={32} className="opacity-30" />
                  <p>{t("appManager.noResults")}</p>
                </div>
              ) : scanned && apps.length > 0 ? (
                <DataTable
                  data={filteredApps}
                  columns={tableColumns}
                  getRowId={(app) => app.appId}
                  sorting={{ sorting, onSortingChange: setSorting }}
                  layout="fixed"
                  containerClassName="h-full min-h-0 rounded-lg border"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground rounded-lg border gap-2">
                  <AppWindow size={32} className="opacity-30" />
                  <p>{t("appManager.startHint")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Operation History Sidebar */}
          {historyOpen && (
            <div className="w-[280px] shrink-0 border rounded-lg bg-card flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
                <span className="text-sm font-semibold">
                  {t("appManager.operationHistory")}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setHistoryOpen(false)}
                >
                  <X size={14} />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    {t("appManager.historyEmpty")}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {[...history].reverse().map((record, idx) => (
                      <div
                        key={`${record.timestamp}-${idx}`}
                        className="rounded-md border bg-background p-2 text-xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            {actionIcon(record.action, record.success)}
                            <span className="font-medium">{record.action}</span>
                          </div>
                          <span className="text-muted-foreground">
                            {new Date(record.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-muted-foreground truncate">
                          {record.appName}
                        </div>
                        {record.output && (
                          <p
                            className={`mt-1 truncate ${
                              record.success
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                            title={record.output}
                          >
                            {record.output}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open: boolean) => {
          if (!open) closeConfirmDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirmDialog.action === "uninstall" ? (
                <Trash2 size={18} className="text-red-500" />
              ) : (
                <ArrowUpCircle size={18} className="text-orange-500" />
              )}
              {confirmDialog.action === "uninstall"
                ? t("appManager.confirmUninstallTitle")
                : t("appManager.confirmUpgradeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === "uninstall"
                ? t("appManager.confirmUninstallDescription", {
                    name: confirmDialog.appName,
                  })
                : t("appManager.confirmUpgradeDescription", {
                    name: confirmDialog.appName,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("appManager.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={
                confirmDialog.action === "uninstall"
                  ? "bg-red-600 hover:bg-red-700"
                  : ""
              }
            >
              {confirmDialog.action === "uninstall"
                ? t("appManager.confirmUninstall")
                : t("appManager.confirmUpgrade")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AppManager;
