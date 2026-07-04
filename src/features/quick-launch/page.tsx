/**
 * Quick Launch Page / 快捷启动页面
 *
 * Scenario-based app launcher grid.
 * Shares scan data with App Manager; zero duplicated backend calls.
 *
 * 「常用应用」场景使用 Tab 折叠: AI 编程 / AI 助手 / AI 办公 / AI 模型 / 开发 / 系统工具
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import {
  Bot,
  Briefcase,
  Code2,
  Sparkles,
  Zap,
  Cpu,
  PenTool,
  Globe,
  MessageCircle,
  Palette,
  Play,
  Cog,
  MoreHorizontal,
  LayoutGrid,
  Search,
  RefreshCw,
  ChevronDown,
  Pencil,
  Check,
  Download,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LAUNCH_SCENES } from "@/features/quick-launch/scenes";
import { cn } from "@/lib/utils";
import type { AppFeature } from "@/features/types";
import type { AppInfo } from "@/lib/tauri/types/app-manager";
import type { LaunchSceneKey } from "@/features/quick-launch/types";
import { AppIcon } from "@/features/app-manager/components/AppIcon";
import { useQuickLaunchController, MERGED_SCENE_KEYS } from "@/features/quick-launch/hooks/useQuickLaunchController";

const MERGED_DEFAULT_TAB = "ai-assistant";

const SCENE_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Bot, Briefcase, Code2, Sparkles, Zap, Cpu, Wrench, PenTool, Globe, MessageCircle, Palette, Play, Cog, MoreHorizontal, LayoutGrid,
};

function SceneIcon({ icon, size = 16 }: { icon: string; size?: number }) {
  const Icon = SCENE_ICON_MAP[icon];
  return Icon ? <Icon size={size} /> : <MoreHorizontal size={size} />;
}

function formatLastModified(ts: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!ts || ts === 0) return "";
  const now = Date.now();
  const diff = now - ts;
  const days = Math.floor(diff / 86400000);
  if (days < 1) return t("quickLaunch.time.today");
  if (days < 2) return t("quickLaunch.time.yesterday");
  if (days < 7) return t("quickLaunch.time.daysAgo", { days });
  if (days < 30) return t("quickLaunch.time.weeksAgo", { weeks: Math.floor(days / 7) });
  return t("quickLaunch.time.monthsAgo", { months: Math.floor(days / 30) });
}

function AppCard({
  app,
  onLaunch,
  onReveal,
  isEditMode,
  sceneLabel,
  onContextMenuEdit,
}: {
  app: AppInfo;
  onLaunch: (app: AppInfo) => void;
  onReveal: (app: AppInfo) => void;
  isEditMode?: boolean;
  sceneLabel?: string;
  onContextMenuEdit?: (app: AppInfo, x: number, y: number) => void;
}) {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);

  return (
    <motion.button
      layout
      onClick={() => onLaunch(app)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isEditMode && onContextMenuEdit) {
          onContextMenuEdit(app, e.clientX, e.clientY);
        } else {
          onReveal(app);
        }
      }}
      onMouseEnter={() => setShowInfo(true)}
      onMouseLeave={() => setShowInfo(false)}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border bg-card p-3 transition hover:border-primary/40 hover:bg-accent/30 hover:shadow-sm",
        isEditMode ? "border-primary/40 ring-1 ring-primary/20" : "border-border",
      )}
      title={app.name}
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted/50">
        <AppIcon
          iconBase64={app.iconBase64}
          installPath={app.installPath}
          size={40}
          className="rounded-lg object-contain"
        />
      </div>
      <span className="w-full truncate text-center text-xs font-medium leading-tight text-foreground">
        {app.name}
      </span>
      {isEditMode && sceneLabel && (
        <span className="absolute -right-1 -top-1 max-w-[80px] truncate rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary shadow-sm" title={sceneLabel}>
          {sceneLabel}
        </span>
      )}
      <AnimatePresence>
        {showInfo && !isEditMode && (
          <motion.div
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-0 -bottom-1 translate-y-full px-1 z-10"
          >
            <div className="rounded-md border border-border bg-popover px-2 py-1 text-[10px] leading-tight text-muted-foreground shadow">
              {app.version && <div>v{app.version}</div>}
              {app.lastModified > 0 && (
                <div className="opacity-70">{formatLastModified(app.lastModified * 1000, t)}</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function SceneSection({
  scene,
  apps,
  expanded,
  onToggle,
  onLaunch,
  onReveal,
  isEditMode,
  appIdToScene,
  onContextMenuEdit,
}: {
  scene: (typeof LAUNCH_SCENES)[number];
  apps: AppInfo[];
  expanded: boolean;
  onToggle: () => void;
  onLaunch: (app: AppInfo) => void;
  onReveal: (app: AppInfo) => void;
  isEditMode: boolean;
  appIdToScene: Record<string, LaunchSceneKey>;
  onContextMenuEdit: (app: AppInfo, x: number, y: number) => void;
}) {
  const { t } = useTranslation();
  const displayApps = expanded ? apps : apps.slice(0, 6);

  if (apps.length === 0) return null;

  return (
    <section className="space-y-2">
      <div
        className="flex cursor-pointer items-center gap-2 select-none rounded-lg px-1 py-1 transition hover:bg-muted/50"
        onClick={onToggle}
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <SceneIcon icon={scene.icon} size={14} />
        </span>
        <h3 className="text-sm font-semibold text-foreground">
          {t(scene.labelKey)}
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground">
          {apps.length}
        </span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-auto text-muted-foreground"
        >
          <ChevronDown size={14} />
        </motion.span>
      </div>
      <motion.div
        layout
        className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8"
      >
        {displayApps.map((app) => (
          <AppCard
            key={app.appId}
            app={app}
            onLaunch={onLaunch}
            onReveal={onReveal}
            isEditMode={isEditMode}
            sceneLabel={isEditMode ? t(LAUNCH_SCENES.find((s) => s.key === appIdToScene[app.appId])?.labelKey || "") : undefined}
            onContextMenuEdit={onContextMenuEdit}
          />
        ))}
        {!expanded && apps.length > 6 && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border bg-transparent p-3 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-primary"
          >
            {t("quickLaunch.showMore", { count: apps.length - 6 })}
          </button>
        )}
      </motion.div>
    </section>
  );
}

/** 合并 Tabbed Section — 将多个场景合并为一个带 Tab 的「常用应用」区域 */
function MergedSceneSection({
  sceneApps,
  onLaunch,
  onReveal,
  isEditMode,
  appIdToScene,
  onContextMenuEdit,
}: {
  sceneApps: Record<LaunchSceneKey, AppInfo[]>;
  onLaunch: (app: AppInfo) => void;
  onReveal: (app: AppInfo) => void;
  isEditMode: boolean;
  appIdToScene: Record<string, LaunchSceneKey>;
  onContextMenuEdit: (app: AppInfo, x: number, y: number) => void;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>(MERGED_DEFAULT_TAB);

  // Total apps across all merged sub-scenes
  const totalMergedApps = MERGED_SCENE_KEYS.reduce((sum, k) => sum + (sceneApps[k]?.length || 0), 0);
  if (totalMergedApps === 0) return null;

  const currentApps = sceneApps[activeTab as LaunchSceneKey] || [];



  return (
    <section className="space-y-2">
      {/* Header row: icon + title + tab bar */}
      <div className="flex items-center gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <LayoutGrid size={14} />
        </span>
        <h3 className="text-sm font-semibold text-foreground shrink-0">
          {t("quickLaunch.scene.commonApps")}
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground shrink-0">
          {totalMergedApps}
        </span>

        {/* Tab pills */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="shrink-0">
          <TabsList className="h-auto gap-1 rounded-none bg-transparent p-0">
            {MERGED_SCENE_KEYS.map((key) => {
              const count = sceneApps[key]?.length || 0;
              const scene = LAUNCH_SCENES.find((s) => s.key === key)!;
              return (
                <TabsTrigger key={key} value={key} className="relative h-8 px-3 text-xs select-none !rounded-full !border !border-border !bg-transparent !shadow-none transition text-muted-foreground hover:text-foreground data-[state=active]:!bg-primary/10 data-[state=active]:!border-primary/30 data-[state=active]:!text-primary">
                  <SceneIcon icon={scene.icon} size={12} />
                  <span className="ml-1">{t(scene.labelKey)}</span>
                  {count > 0 && (
                    <span className="ml-1 text-[10px] tabular-nums opacity-60">{count}</span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* App cards grid */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8"
        >
          {currentApps.map((app) => (
            <AppCard
              key={app.appId}
              app={app}
              onLaunch={onLaunch}
              onReveal={onReveal}
              isEditMode={isEditMode}
              sceneLabel={isEditMode ? t(LAUNCH_SCENES.find((s) => s.key === appIdToScene[app.appId])?.labelKey || "") : undefined}
              onContextMenuEdit={onContextMenuEdit}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function EmptyState({ onRescan }: { onRescan: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
      <LayoutGridIcon />
      <p className="text-sm">{t("quickLaunch.empty")}</p>
      <button
        onClick={onRescan}
        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
      >
        <RefreshCw size={14} />
        {t("quickLaunch.scanFirst")}
      </button>
    </div>
  );
}

function LayoutGridIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/40">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export default function QuickLaunch({ active }: { active: boolean; feature: AppFeature }) {
  const { t } = useTranslation();
  const {
    appManagerApps,
    appManagerScanned,
    appManagerScanProgress,
    sceneOrder,
    expandedScenes,
    searchQuery,
    loading,
    isEditMode,
    appOverrides,
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
  } = useQuickLaunchController(active);

  if (loading && appManagerApps.length === 0) {
    const current = appManagerScanProgress?.current ?? 0;
    const stage = appManagerScanProgress?.stage ?? "scanningDirectories";
    const stageText = stage === "processingMetadata"
      ? t("quickLaunch.scanStage.processing")
      : stage === "resolvingSources"
        ? t("quickLaunch.scanStage.resolving")
        : t("quickLaunch.scanStage.scanning");

    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex w-64 flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw size={24} className="animate-spin" />
          <p className="text-sm font-medium text-foreground">{t("quickLaunch.scanning")}</p>
          <div className="w-full">
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full bg-primary/60"
                initial={{ width: "0%" }}
                animate={{ width: current > 0 ? `${Math.min(100, Math.max(5, current / 3))}%` : "5%" }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground/80">
              <span>{stageText}</span>
              <span className="tabular-nums">{current > 0 ? `${current}` : "..."}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!appManagerScanned || appManagerApps.length === 0) {
    return <EmptyState onRescan={handleRescan} />;
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("quickLaunch.searchPlaceholder")}
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/40"
          />
        </div>

        {/* 编辑模式按钮组 */}
        {isEditMode && (
          <>
            <button
              onClick={handleResetOverrides}
              disabled={Object.keys(appOverrides).length === 0}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              title={t("quickLaunch.resetClassification")}
            >
              <RotateCcw size={13} />
              {t("quickLaunch.resetClassification")}
            </button>
            <button
              onClick={handleExportOverrides}
              disabled={exporting}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              title={t("quickLaunch.exportOverridesTooltip")}
            >
              <Download size={13} className={exporting ? "animate-spin" : ""} />
              {t("quickLaunch.exportOverrides")}
            </button>
          </>
        )}

        <button
          onClick={toggleEditMode}
          className={cn(
            "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition",
            isEditMode
              ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {isEditMode ? <Check size={13} /> : <Pencil size={13} />}
          {isEditMode ? t("quickLaunch.done") : t("quickLaunch.edit")}
        </button>

        <button
          onClick={handleRescan}
          disabled={loading}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {t("quickLaunch.rescan")}
        </button>
      </div>

      {/* Stats */}
      {totalApps > 0 && (
        <p className="shrink-0 text-xs text-muted-foreground">
          {searchQuery
            ? t("quickLaunch.searchResult", { count: totalApps })
            : t("quickLaunch.totalApps", { count: appManagerApps.length, scenes: sceneCount })}
        </p>
      )}

      {/* Scene Grids */}
      <div className="flex-1 space-y-6 overflow-y-auto pr-1">
        {sceneOrder.map((key) => {
          // Skip merged sub-scenes (rendered inside MergedSceneSection)
          if (mergedSceneSet.has(key) && key !== firstMergedKey) return null;

          // Render merged scenes as tabbed section
          if (key === firstMergedKey) {
            return (
              <MergedSceneSection
                key="merged"
                sceneApps={sceneApps}
                onLaunch={handleLaunch}
                onReveal={handleReveal}
                isEditMode={isEditMode}
                appIdToScene={appIdToScene}
                onContextMenuEdit={handleContextMenuEdit}
              />
            );
          }

          // Regular scene
          return (
            <SceneSection
              key={key}
              scene={LAUNCH_SCENES.find((s) => s.key === key)!}
              apps={sceneApps[key]}
              expanded={!!expandedScenes[key]}
              onToggle={() => toggleExpandScene(key)}
              onLaunch={handleLaunch}
              onReveal={handleReveal}
              isEditMode={isEditMode}
              appIdToScene={appIdToScene}
              onContextMenuEdit={handleContextMenuEdit}
            />
          );
        })}

        {searchQuery && totalApps === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("quickLaunch.noResults")}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border pt-2 text-center text-[10px] text-muted-foreground/50">
        {isEditMode ? t("quickLaunch.editModeHint") : t("quickLaunch.hint")}
      </div>

      {/* 编辑模式右键上下文菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          style={menuStyle}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("quickLaunch.moveToScene")}
          </div>
          {LAUNCH_SCENES.map((scene) => (
            <button
              key={scene.key}
              onClick={() => handleMoveApp(contextMenu.appId, scene.key)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition hover:bg-accent",
                appIdToScene[contextMenu.appId] === scene.key
                  ? "font-medium text-primary"
                  : "text-foreground",
              )}
            >
              <SceneIcon icon={scene.icon} size={12} />
              {t(scene.labelKey)}
              {appIdToScene[contextMenu.appId] === scene.key && (
                <Check size={12} className="ml-auto" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
