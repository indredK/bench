/**
 * Quick Launch Page / 快捷启动页面
 *
 * Scenario-based app launcher grid.
 * Shares scan data with App Manager; zero duplicated backend calls.
 *
 * 「常用应用」场景使用 Tab 折叠: AI 编程 / AI 助手 / AI 办公 / AI 模型 / 开发 / 系统工具
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { motion, AnimatePresence } from "motion/react"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VirtualGridView } from "@/components/content/VirtualGridView"
import { LAUNCH_SCENES } from "@/features/quick-launch/scenes"
import { cn } from "@/lib/utils"
import { useReducedMotionProps } from "@/lib/motion-utils"
import type { AppFeature } from "@/features/types"
import type { AppInfo } from "@/lib/tauri/types/app-manager"
import type { LaunchSceneKey } from "@/features/quick-launch/types"
import { AppIcon } from "@/features/app-manager/components/AppIcon"
import {
  useQuickLaunchController,
  MERGED_SCENE_KEYS,
} from "@/features/quick-launch/hooks/useQuickLaunchController"

const MERGED_DEFAULT_TAB = "ai-assistant"

const SCENE_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Bot,
  Briefcase,
  Code2,
  Sparkles,
  Zap,
  Cpu,
  Wrench,
  PenTool,
  Globe,
  MessageCircle,
  Palette,
  Play,
  Cog,
  MoreHorizontal,
  LayoutGrid,
}

function SceneIcon({ icon, size = 16 }: { icon: string; size?: number }) {
  const Icon = SCENE_ICON_MAP[icon]
  return Icon ? <Icon size={size} /> : <MoreHorizontal size={size} />
}

function formatLastModified(
  ts: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!ts || ts === 0) return ""
  const now = Date.now()
  const diff = now - ts
  const days = Math.floor(diff / 86400000)
  if (days < 1) return t("quickLaunch.time.today")
  if (days < 2) return t("quickLaunch.time.yesterday")
  if (days < 7) return t("quickLaunch.time.daysAgo", { days })
  if (days < 30) return t("quickLaunch.time.weeksAgo", { weeks: Math.floor(days / 7) })
  return t("quickLaunch.time.monthsAgo", { months: Math.floor(days / 30) })
}

function AppCard({
  app,
  onLaunch,
  onReveal,
  isEditMode,
  sceneLabel,
  onContextMenuEdit,
  animated = true,
}: {
  app: AppInfo
  onLaunch: (app: AppInfo) => void
  onReveal: (app: AppInfo) => void
  isEditMode?: boolean
  sceneLabel?: string
  onContextMenuEdit?: (app: AppInfo, x: number, y: number) => void
  animated?: boolean
}) {
  const { t } = useTranslation()
  const [showInfo, setShowInfo] = useState(false)
  const { reduce } = useReducedMotionProps()

  return (
    <motion.button
      layout={animated}
      onClick={() => {
        if (app.allowedActions.launch) onLaunch(app)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (isEditMode && onContextMenuEdit) {
          onContextMenuEdit(app, e.clientX, e.clientY)
        } else {
          onReveal(app)
        }
      }}
      onMouseEnter={() => setShowInfo(true)}
      onMouseLeave={() => setShowInfo(false)}
      className={cn(
        "group bg-card hover:border-primary/40 hover:bg-accent/30 relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 transition hover:shadow-sm",
        isEditMode ? "border-primary/40 ring-primary/20 ring-1" : "border-border",
      )}
      title={app.allowedActions.launch ? app.name : t("quickLaunch.notLaunchable")}
      disabled={!app.allowedActions.launch}
    >
      <div className="bg-muted/50 flex size-12 shrink-0 items-center justify-center rounded-xl">
        <AppIcon
          iconBase64={app.iconBase64}
          appId={app.appId}
          size={40}
          className="rounded-lg object-contain"
        />
      </div>
      <span className="text-foreground w-full truncate text-center text-xs leading-tight font-medium">
        {app.name}
      </span>
      {isEditMode && sceneLabel && (
        <span
          className="bg-primary/10 text-primary absolute -top-1 -right-1 max-w-[80px] truncate rounded-full px-1.5 py-0.5 text-[9px] font-medium shadow-sm"
          title={sceneLabel}
        >
          {sceneLabel}
        </span>
      )}
      <AnimatePresence>
        {showInfo && !isEditMode && (
          <motion.div
            initial={reduce({ opacity: 0, y: 2 })}
            animate={reduce({ opacity: 1, y: 0 })}
            exit={{ opacity: 0 }}
            className="absolute inset-x-0 -bottom-1 z-10 translate-y-full px-1"
          >
            <div className="border-border bg-popover text-muted-foreground rounded-md border px-2 py-1 text-[10px] leading-tight shadow">
              {app.version && <div>v{app.version}</div>}
              {app.lastModified > 0 && (
                <div className="opacity-70">{formatLastModified(app.lastModified * 1000, t)}</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

function VirtualizedAppGrid({
  apps,
  onLaunch,
  onReveal,
  isEditMode,
  appIdToScene,
  onContextMenuEdit,
}: {
  apps: AppInfo[]
  onLaunch: (app: AppInfo) => void
  onReveal: (app: AppInfo) => void
  isEditMode: boolean
  appIdToScene: Record<string, LaunchSceneKey>
  onContextMenuEdit: (app: AppInfo, x: number, y: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="h-[420px] min-h-0">
      <VirtualGridView
        data={apps}
        getRowId={(app) => app.appId}
        renderGridCard={(app) => (
          <AppCard
            app={app}
            onLaunch={onLaunch}
            onReveal={onReveal}
            isEditMode={isEditMode}
            sceneLabel={
              isEditMode
                ? t(
                    LAUNCH_SCENES.find((scene) => scene.key === appIdToScene[app.appId])
                      ?.labelKey || "",
                  )
                : undefined
            }
            onContextMenuEdit={onContextMenuEdit}
            animated={false}
          />
        )}
        onItemClick={() => {}}
        estimatedCardHeight={104}
        gridColumns={8}
        minCardWidth={84}
        gap={8}
        rowPadding={[0, 8]}
        wrapperPadding="p-0"
      />
    </div>
  )
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
  scene: (typeof LAUNCH_SCENES)[number]
  apps: AppInfo[]
  expanded: boolean
  onToggle: () => void
  onLaunch: (app: AppInfo) => void
  onReveal: (app: AppInfo) => void
  isEditMode: boolean
  appIdToScene: Record<string, LaunchSceneKey>
  onContextMenuEdit: (app: AppInfo, x: number, y: number) => void
}) {
  const { t } = useTranslation()
  const { reduce } = useReducedMotionProps()
  const displayApps = expanded ? apps : apps.slice(0, 6)

  if (apps.length === 0) return null

  return (
    <section className="space-y-2">
      <div
        className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 transition select-none"
        onClick={onToggle}
      >
        <span className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md">
          <SceneIcon icon={scene.icon} size={14} />
        </span>
        <h3 className="text-foreground text-sm font-semibold">{t(scene.labelKey)}</h3>
        <span className="text-muted-foreground text-xs tabular-nums">{apps.length}</span>
        <motion.span
          animate={reduce({ rotate: expanded ? 180 : 0 })}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground ml-auto"
        >
          <ChevronDown size={14} />
        </motion.span>
      </div>
      {expanded && apps.length > 48 ? (
        <VirtualizedAppGrid
          apps={apps}
          onLaunch={onLaunch}
          onReveal={onReveal}
          isEditMode={isEditMode}
          appIdToScene={appIdToScene}
          onContextMenuEdit={onContextMenuEdit}
        />
      ) : (
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
              sceneLabel={
                isEditMode
                  ? t(LAUNCH_SCENES.find((s) => s.key === appIdToScene[app.appId])?.labelKey || "")
                  : undefined
              }
              onContextMenuEdit={onContextMenuEdit}
            />
          ))}
          {!expanded && apps.length > 6 && (
            <Button
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground hover:border-primary/30 hover:text-primary flex items-center justify-center rounded-xl border border-dashed bg-transparent p-3 text-xs transition"
            >
              {t("quickLaunch.showMore", { count: apps.length - 6 })}
            </Button>
          )}
        </motion.div>
      )}
    </section>
  )
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
  sceneApps: Record<LaunchSceneKey, AppInfo[]>
  onLaunch: (app: AppInfo) => void
  onReveal: (app: AppInfo) => void
  isEditMode: boolean
  appIdToScene: Record<string, LaunchSceneKey>
  onContextMenuEdit: (app: AppInfo, x: number, y: number) => void
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<string>(MERGED_DEFAULT_TAB)

  // Total apps across all merged sub-scenes
  const totalMergedApps = MERGED_SCENE_KEYS.reduce((sum, k) => sum + (sceneApps[k]?.length || 0), 0)
  if (totalMergedApps === 0) return null

  const currentApps = sceneApps[activeTab as LaunchSceneKey] || []

  return (
    <section className="space-y-2">
      {/* Header row: icon + title + tab bar */}
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-md">
          <LayoutGrid size={14} />
        </span>
        <h3 className="text-foreground shrink-0 text-sm font-semibold">
          {t("quickLaunch.scene.commonApps")}
        </h3>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {totalMergedApps}
        </span>

        {/* Tab pills */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="shrink-0">
          <TabsList className="h-auto gap-1 rounded-none bg-transparent p-0">
            {MERGED_SCENE_KEYS.map((key) => {
              const count = sceneApps[key]?.length || 0
              const scene = LAUNCH_SCENES.find((s) => s.key === key)!
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="!border-border text-muted-foreground hover:text-foreground data-[state=active]:!bg-primary/10 data-[state=active]:!border-primary/30 data-[state=active]:!text-primary relative h-8 !rounded-full !border !bg-transparent px-3 text-xs !shadow-none transition select-none"
                >
                  <SceneIcon icon={scene.icon} size={12} />
                  <span className="ml-1">{t(scene.labelKey)}</span>
                  {count > 0 && (
                    <span className="ml-1 text-[10px] tabular-nums opacity-60">{count}</span>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* App cards grid */}
      {currentApps.length > 48 ? (
        <VirtualizedAppGrid
          apps={currentApps}
          onLaunch={onLaunch}
          onReveal={onReveal}
          isEditMode={isEditMode}
          appIdToScene={appIdToScene}
          onContextMenuEdit={onContextMenuEdit}
        />
      ) : (
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
                sceneLabel={
                  isEditMode
                    ? t(
                        LAUNCH_SCENES.find((s) => s.key === appIdToScene[app.appId])?.labelKey ||
                          "",
                      )
                    : undefined
                }
                onContextMenuEdit={onContextMenuEdit}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </section>
  )
}

function QuickLaunchSkeleton({
  stageText,
  cancellable,
  onCancel,
}: {
  stageText: string
  cancellable: boolean
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col gap-4 p-2" aria-busy="true">
      <div className="bg-muted h-9 w-full animate-pulse rounded-lg" />
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">{stageText}</p>
        {cancellable && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        )}
      </div>
      <div className="bg-muted h-1 w-full animate-pulse overflow-hidden rounded-full" />
      {[0, 1, 2].map((section) => (
        <section key={section} className="space-y-2">
          <div className="bg-muted h-6 w-40 animate-pulse rounded-md" />
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="bg-muted aspect-square animate-pulse rounded-xl" />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function EmptyState({ onRescan, error }: { onRescan: () => void; error?: string | null }) {
  const { t } = useTranslation()
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-4 py-24">
      <LayoutGridIcon />
      <p className="text-sm">{error || t("quickLaunch.empty")}</p>
      <Button
        onClick={onRescan}
        variant="outline"
        size="sm"
        className="border-border bg-card text-foreground hover:bg-accent inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition"
      >
        <RefreshCw size={14} />
        {t("quickLaunch.scanFirst")}
      </Button>
    </div>
  )
}

function LayoutGridIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="text-muted-foreground/40"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export default function QuickLaunch({ active }: { active: boolean; feature: AppFeature }) {
  const { t } = useTranslation()
  const {
    appManagerApps,
    appManagerScanned,
    appManagerLoading,
    appManagerScanProgress,
    inventoryError,
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
    handleCancelScan,
  } = useQuickLaunchController(active)

  const [confirmResetOpen, setConfirmResetOpen] = useState(false)

  if (loading && appManagerApps.length === 0) {
    const stage = appManagerScanProgress?.stage ?? "scanningDirectories"
    const stageText =
      stage === "processingMetadata"
        ? t("quickLaunch.scanStage.processing")
        : stage === "resolvingSources"
          ? t("quickLaunch.scanStage.resolving")
          : t("quickLaunch.scanStage.scanning")

    return (
      <QuickLaunchSkeleton
        stageText={stageText}
        cancellable={appManagerScanProgress?.cancellable === true}
        onCancel={handleCancelScan}
      />
    )
  }

  if (inventoryError && appManagerApps.length === 0) {
    return <EmptyState onRescan={handleRescan} error={inventoryError} />
  }

  if (!appManagerScanned || appManagerApps.length === 0) {
    return <EmptyState onRescan={handleRescan} />
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {inventoryError && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{inventoryError}</span>
            <Button variant="outline" size="sm" onClick={handleRescan}>
              {t("quickLaunch.rescan")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("quickLaunch.searchPlaceholder")}
            className="border-border bg-background placeholder:text-muted-foreground/50 focus:border-primary/40 h-9 w-full rounded-lg border pr-3 pl-9 text-sm transition outline-none"
          />
        </div>

        {/* 编辑模式按钮组 */}
        {isEditMode && (
          <>
            <Button
              onClick={() => setConfirmResetOpen(true)}
              disabled={appManagerLoading || Object.keys(appOverrides).length === 0}
              variant="outline"
              size="sm"
              className="border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
              title={t("quickLaunch.resetClassification")}
            >
              <RotateCcw size={13} />
              {t("quickLaunch.resetClassification")}
            </Button>
            <Button
              onClick={handleExportOverrides}
              disabled={appManagerLoading || exporting}
              variant="outline"
              size="sm"
              className="border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
              title={t("quickLaunch.exportOverridesTooltip")}
            >
              <Download size={13} className={exporting ? "animate-spin" : ""} />
              {t("quickLaunch.exportOverrides")}
            </Button>
          </>
        )}

        <DestructiveConfirmDialog
          open={confirmResetOpen}
          onOpenChange={setConfirmResetOpen}
          title={t("quickLaunch.resetConfirmTitle")}
          description={t("quickLaunch.resetConfirmDescription")}
          consequence={t("quickLaunch.resetConsequence")}
          confirmLabel={t("quickLaunch.resetClassification")}
          cancelLabel={t("common.cancel")}
          onConfirm={handleResetOverrides}
        />

        <Button
          onClick={toggleEditMode}
          disabled={appManagerLoading}
          variant="outline"
          size="sm"
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition",
            isEditMode
              ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {isEditMode ? <Check size={13} /> : <Pencil size={13} />}
          {isEditMode ? t("quickLaunch.done") : t("quickLaunch.edit")}
        </Button>

        <Button
          onClick={handleRescan}
          disabled={loading}
          variant="outline"
          size="sm"
          className="border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {t("quickLaunch.rescan")}
        </Button>
      </div>

      {appManagerLoading && (
        <div className="flex shrink-0 items-center gap-3" aria-live="polite">
          <span className="text-muted-foreground shrink-0 text-xs">
            {appManagerScanProgress?.stage === "processingMetadata"
              ? t("quickLaunch.scanStage.processing")
              : appManagerScanProgress?.stage === "resolvingSources"
                ? t("quickLaunch.scanStage.resolving")
                : t("quickLaunch.scanStage.scanning")}
          </span>
          <div className="bg-muted h-1 min-w-0 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full animate-pulse transition-[width]"
              style={{
                width:
                  appManagerScanProgress?.total && appManagerScanProgress.total > 0
                    ? `${Math.min(
                        100,
                        ((appManagerScanProgress.completed ?? appManagerScanProgress.current) /
                          appManagerScanProgress.total) *
                          100,
                      )}%`
                    : "35%",
              }}
            />
          </div>
          {appManagerScanProgress?.cancellable !== false && (
            <Button variant="outline" size="xs" onClick={handleCancelScan}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
      )}

      {/* Stats */}
      {totalApps > 0 && (
        <p className="text-muted-foreground shrink-0 text-xs">
          {searchQuery
            ? t("quickLaunch.searchResult", { count: totalApps })
            : t("quickLaunch.totalApps", { count: appManagerApps.length, scenes: sceneCount })}
        </p>
      )}

      {/* Scene Grids */}
      <div
        className={cn(
          "flex-1 space-y-6 overflow-y-auto pr-1 transition-opacity",
          appManagerLoading && "opacity-60",
        )}
        aria-busy={appManagerLoading}
      >
        {sceneOrder.map((key) => {
          // Skip merged sub-scenes (rendered inside MergedSceneSection)
          if (mergedSceneSet.has(key) && key !== firstMergedKey) return null

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
            )
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
          )
        })}

        {searchQuery && totalApps === 0 && (
          <div className="text-muted-foreground py-16 text-center text-sm">
            {t("quickLaunch.noResults")}
          </div>
        )}
      </div>

      <div className="border-border text-muted-foreground/50 shrink-0 border-t pt-2 text-center text-[10px]">
        {isEditMode ? t("quickLaunch.editModeHint") : t("quickLaunch.hint")}
      </div>

      {/* 编辑模式右键上下文菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="border-border bg-popover fixed z-50 max-h-[70vh] min-w-[160px] overflow-y-auto rounded-lg border p-1 shadow-lg"
          style={menuStyle}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <div className="text-muted-foreground px-2 py-1 text-[10px] font-medium tracking-wide uppercase">
            {t("quickLaunch.moveToScene")}
          </div>
          {LAUNCH_SCENES.map((scene) => (
            <Button
              key={scene.key}
              onClick={() => handleMoveApp(contextMenu.appId, scene.key)}
              variant="ghost"
              size="sm"
              className={cn(
                "hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition",
                appIdToScene[contextMenu.appId] === scene.key
                  ? "text-primary font-medium"
                  : "text-foreground",
              )}
            >
              <SceneIcon icon={scene.icon} size={12} />
              {t(scene.labelKey)}
              {appIdToScene[contextMenu.appId] === scene.key && (
                <Check size={12} className="ml-auto" />
              )}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
