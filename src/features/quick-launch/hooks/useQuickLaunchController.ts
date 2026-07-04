/**
 * Controller / 控制器: bind quick launch page state; 连接场景分类、扫描与导出.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useAppManagerStore } from "@/features/app-manager/store";
import { useQuickLaunchStore } from "@/features/quick-launch/store";
import {
  autoClassifyApps,
  applyOverrides,
  exportFullClassification,
} from "@/features/quick-launch/scenes";
import { launchApp, revealAppInFinder } from "@/lib/tauri/commands/app-manager";
import { writeTextFile } from "@/lib/tauri/commands/file-ops";
import { getErrorMessage } from "@/lib/tauri/errors";
import { savePlatformDialog } from "@/platform/dialog";
import { listenToPlatformEvent } from "@/platform/events";
import { preloadAppIcons } from "@/features/app-manager/components/AppIcon";
import { appManagerUseCases } from "@/features/app-manager/services/app-manager.use-cases";
import { useGuardedAsyncSet } from "@/hooks/useGuardedAsync";
import type { AppInfo } from "@/lib/tauri/types/app-manager";
import type { LaunchSceneKey } from "@/features/quick-launch/types";

/** 合并到「常用应用」Tab 下的场景 key */
export const MERGED_SCENE_KEYS: LaunchSceneKey[] = [
  "ai-ide",
  "ai-claw",
  "ai-assistant",
  "ai-office",
  "ai-model",
  "ai-tool",
  "dev",
  "system",
];

export function useQuickLaunchController(active: boolean) {
  const { t } = useTranslation();
  const { run: runLaunchAction } = useGuardedAsyncSet<string>();

  const appManagerApps = useAppManagerStore((s) => s.apps);
  const appManagerScanned = useAppManagerStore((s) => s.scanned);
  const appManagerLoading = useAppManagerStore((s) => s.loading);
  const appManagerScanProgress = useAppManagerStore((s) => s.scanProgress);

  const scenes = useQuickLaunchStore((s) => s.scenes);
  const sceneOrder = useQuickLaunchStore((s) => s.sceneOrder);
  const expandedScenes = useQuickLaunchStore((s) => s.expandedScenes);
  const searchQuery = useQuickLaunchStore((s) => s.searchQuery);
  const loading = useQuickLaunchStore((s) => s.loading);
  const isEditMode = useQuickLaunchStore((s) => s.isEditMode);
  const appOverrides = useQuickLaunchStore((s) => s.appOverrides);
  const autoClassified = useQuickLaunchStore((s) => s.autoClassified);

  const setLoading = useQuickLaunchStore((s) => s.setLoading);
  const setSearchQuery = useQuickLaunchStore((s) => s.setSearchQuery);
  const toggleExpandScene = useQuickLaunchStore((s) => s.toggleExpandScene);
  const batchSetScenes = useQuickLaunchStore((s) => s.batchSetScenes);
  const toggleEditMode = useQuickLaunchStore((s) => s.toggleEditMode);
  const loadOverrides = useQuickLaunchStore((s) => s.loadOverrides);
  const resetOverrides = useQuickLaunchStore((s) => s.resetOverrides);
  const moveAppToSceneOverride = useQuickLaunchStore((s) => s.moveAppToSceneOverride);
  const setAutoClassified = useQuickLaunchStore((s) => s.setAutoClassified);

  const [contextMenu, setContextMenu] = useState<{ appId: string; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [exporting, setExporting] = useState(false);

  // 右键菜单边界检测：超出视口时翻转
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const menu = contextMenuRef.current;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    const style: React.CSSProperties = {};

    if (contextMenu.y + rect.height + margin > vh) {
      style.bottom = `${vh - contextMenu.y}px`;
      style.top = "auto";
    } else {
      style.top = `${contextMenu.y}px`;
      style.bottom = "auto";
    }
    if (contextMenu.x + rect.width + margin > vw) {
      style.right = `${vw - contextMenu.x}px`;
      style.left = "auto";
    } else {
      style.left = `${contextMenu.x}px`;
      style.right = "auto";
    }

    setMenuStyle(style);
  }, [contextMenu]);

  // Auto-classify + load overrides when App Manager has data
  useEffect(() => {
    if (!active) return;
    if (appManagerScanned && appManagerApps.length > 0 && Object.keys(autoClassified).length === 0) {
      loadOverrides();
      const classified = autoClassifyApps(appManagerApps);
      setAutoClassified(classified);
      const overrides = useQuickLaunchStore.getState().appOverrides;
      const map = new Map(appManagerApps.map((a) => [a.appId, a]));
      const final = applyOverrides(classified, overrides, map);
      batchSetScenes(final);
    }
  }, [active, appManagerScanned, appManagerApps, autoClassified, loadOverrides, setAutoClassified, batchSetScenes]);

  // Sync loading state from App Manager
  useEffect(() => {
    setLoading(appManagerLoading);
  }, [appManagerLoading, setLoading]);

  // 点击外部关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => {
      window.removeEventListener("click", close);
    };
  }, [contextMenu]);

  const appMap = useMemo(
    () => new Map(appManagerApps.map((a) => [a.appId, a])),
    [appManagerApps]
  );

  const sceneApps = useMemo(() => {
    const result: Record<LaunchSceneKey, AppInfo[]> = {} as Record<LaunchSceneKey, AppInfo[]>;
    for (const key of sceneOrder) {
      const ids = scenes[key] || [];
      result[key] = ids
        .map((id) => appMap.get(id))
        .filter((a): a is AppInfo => !!a);

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        result[key] = result[key].filter(
          (a) => a.name.toLowerCase().includes(q) || a.bundleId.toLowerCase().includes(q)
        );
      }
    }
    return result;
  }, [scenes, sceneOrder, appMap, searchQuery]);

  const appIdToScene = useMemo(() => {
    const map: Record<string, LaunchSceneKey> = {};
    for (const key of sceneOrder) {
      for (const id of scenes[key] || []) {
        map[id] = key;
      }
    }
    return map;
  }, [scenes, sceneOrder]);

  const totalApps = useMemo(
    () => Object.values(sceneApps).reduce((sum, apps) => sum + apps.length, 0),
    [sceneApps]
  );

  const sceneCount = useMemo(() => {
    let count = 0;
    let mergedHasApps = false;
    for (const key of sceneOrder) {
      const has = (sceneApps[key]?.length || 0) > 0;
      if (MERGED_SCENE_KEYS.includes(key)) {
        if (has) mergedHasApps = true;
      } else if (has) {
        count++;
      }
    }
    return count + (mergedHasApps ? 1 : 0);
  }, [sceneOrder, sceneApps]);

  const handleLaunch = useCallback(async (app: AppInfo) => {
    if (isEditMode) return;
    await runLaunchAction(`launch:${app.appId}`, async () => {
      try {
        await launchApp(app.installPath);
      } catch {
        // Silently fail
      }
    });
  }, [isEditMode, runLaunchAction]);

  const handleReveal = useCallback(async (app: AppInfo) => {
    await runLaunchAction(`reveal:${app.appId}`, async () => {
      try {
        await revealAppInFinder(app.installPath);
      } catch {
        /* ignore */
      }
    });
  }, [runLaunchAction]);

  const handleContextMenuEdit = useCallback((app: AppInfo, x: number, y: number) => {
    setContextMenu({ appId: app.appId, x, y });
  }, []);

  const handleMoveApp = useCallback((appId: string, sceneKey: LaunchSceneKey) => {
    moveAppToSceneOverride(appId, sceneKey);
    setContextMenu(null);
  }, [moveAppToSceneOverride]);

  const handleResetOverrides = useCallback(() => {
    resetOverrides();
    const classified = useQuickLaunchStore.getState().autoClassified;
    if (Object.keys(classified).length > 0) {
      batchSetScenes(classified);
    }
  }, [resetOverrides, batchSetScenes]);

  const handleExportOverrides = useCallback(async () => {
    if (appManagerApps.length === 0 || exporting) return;
    const overrides = useQuickLaunchStore.getState().appOverrides;
    const classified = autoClassifyApps(appManagerApps);
    const data = exportFullClassification(appManagerApps, classified, overrides);
    if (data.length === 0) return;

    const selectedPath = await savePlatformDialog({
      canCreateDirectories: true,
      defaultPath: "quick-launch-classification.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selectedPath) return;

    setExporting(true);
    try {
      await writeTextFile(selectedPath, JSON.stringify(data, null, 2));
      toast.success(t("quickLaunch.toasts.exportSuccess", { count: data.length }));
    } catch (error) {
      toast.error(t("quickLaunch.toasts.exportFailed", { defaultValue: getErrorMessage(error) }));
    } finally {
      setExporting(false);
    }
  }, [appManagerApps, exporting, t]);

  const handleRescan = useCallback(async () => {
    if (loading) return;
    const currentAppLoading = useAppManagerStore.getState().loading;
    if (currentAppLoading) return;
    let unlisten: (() => void) | null = null;
    try {
      setLoading(true);
      useAppManagerStore.setState({
        loading: true,
        error: null,
        scanProgress: { current: 0, stage: "scanningDirectories" },
      });
      try {
        unlisten = await listenToPlatformEvent<{ current: number; stage: string }>(
          "app-scan:progress",
          (event) => {
            useAppManagerStore.setState({ scanProgress: event.payload });
          }
        );
      } catch {
        // ignore
      }
      const result = await appManagerUseCases.scanInstalledApps();
      useAppManagerStore.setState({
        apps: result.apps,
        result,
        scanned: true,
        loading: false,
        scanProgress: null,
        lastScanTime: result.lastScanTime,
        lastUpdateCheck: result.lastUpdateCheck,
      });
      const classified = autoClassifyApps(result.apps);
      setAutoClassified(classified);
      const overrides = useQuickLaunchStore.getState().appOverrides;
      const map = new Map(result.apps.map((a) => [a.appId, a]));
      const final = applyOverrides(classified, overrides, map);
      batchSetScenes(final);
      preloadAppIcons(result.apps);
    } catch {
      useAppManagerStore.setState({ loading: false, scanned: true, scanProgress: null });
    } finally {
      if (unlisten) unlisten();
      setLoading(false);
    }
  }, [loading, setLoading, setAutoClassified, batchSetScenes]);

  // Auto-start scan when entering quick launch and no scan has been done yet
  useEffect(() => {
    if (!active) return;
    if (appManagerScanned) return;
    if (loading || appManagerLoading) return;
    handleRescan();
  }, [active, appManagerScanned, loading, appManagerLoading, handleRescan]);

  const mergedSceneSet = useMemo(() => new Set(MERGED_SCENE_KEYS), []);
  const firstMergedKey = MERGED_SCENE_KEYS[0];

  return {
    appManagerApps,
    appManagerScanned,
    appManagerLoading,
    appManagerScanProgress,
    scenes,
    sceneOrder,
    expandedScenes,
    searchQuery,
    loading,
    isEditMode,
    appOverrides,
    autoClassified,
    setSearchQuery,
    toggleExpandScene,
    toggleEditMode,
    contextMenu,
    contextMenuRef,
    menuStyle,
    exporting,
    sceneApps,
    appIdToScene,
    totalApps,
    sceneCount,
    mergedSceneSet,
    firstMergedKey,
    handleLaunch,
    handleReveal,
    handleContextMenuEdit,
    handleMoveApp,
    handleResetOverrides,
    handleExportOverrides,
    handleRescan,
  };
}

export type QuickLaunchController = ReturnType<typeof useQuickLaunchController>;
