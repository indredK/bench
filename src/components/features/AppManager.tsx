import { useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "@tauri-apps/api/core";
import { RefreshCw, Search, AppWindow } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
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

  const setSearchQuery = useAppManagerStore((s) => s.setSearchQuery);
  const setActiveFilter = useAppManagerStore((s) => s.setActiveFilter);
  const setSorting = useAppManagerStore((s) => s.setSorting);
  const scanApps = useAppManagerStore((s) => s.scanApps);

  // Auto-scan on first visit
  useEffect(() => {
    if (active && isTauriEnv() && !scanned) {
      scanApps();
    }
  }, [active, scanApps, scanned]);

  // Filter apps based on search query and active filter
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
        case "all":
        default:
          break;
      }

      return true;
    });
  }, [apps, searchQuery, activeFilter]);

  const handleLaunch = useCallback(
    async (app: AppInfo) => {
      if (!isTauriEnv()) return;
      try {
        await launchApp(app.installPath);
      } catch (e) {
        console.warn("[AppManager] Launch failed:", e);
      }
    },
    [],
  );

  const handleReveal = useCallback(
    async (app: AppInfo) => {
      if (!isTauriEnv()) return;
      try {
        await revealAppInFinder(app.installPath);
      } catch (e) {
        console.warn("[AppManager] Reveal failed:", e);
      }
    },
    [],
  );

  const tableColumns = useMemo(
    () => createAppManagerColumns(t, handleLaunch, handleReveal),
    [t, handleLaunch, handleReveal],
  );

  const hasActiveFilter = searchQuery.trim().length > 0 || activeFilter !== "all";

  return (
    <div className="h-full flex flex-col gap-3">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AppWindow size={20} />
              {t("appManager.title")}
            </CardTitle>
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
        </CardHeader>

        <CardContent className="flex-1 min-h-0 flex flex-col">
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
              {/* Search input */}
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

              {/* Quick filters */}
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

          {/* Summary row */}
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
                      time: ((result.scanTimeMs ?? 0) / 1000).toFixed(2),
                    })}
              </p>
            </div>
          )}

          {/* Content area */}
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
                sorting={{
                  sorting,
                  onSortingChange: setSorting,
                }}
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
        </CardContent>
      </Card>
    </div>
  );
}

export default AppManager;
