/**
 * Quick Launch Types / 快捷启动类型
 */
import type { AppInfo } from "@/lib/tauri/types/app-manager"

/** 预定义的启动场景 */
export type LaunchSceneKey =
  | "dev"
  | "ai-ide"
  | "ai-claw"
  | "ai-assistant"
  | "ai-office"
  | "ai-model"
  | "ai-tool"
  | "writing"
  | "design"
  | "communication"
  | "browser"
  | "entertainment"
  | "system"
  | "other"

export interface LaunchScene {
  key: LaunchSceneKey
  labelKey: string
  icon: string
}

export interface LaunchAppEntry {
  app: AppInfo
  pinned: boolean
}

/** 用户自定义归类覆盖条目（用于导出） */
export interface OverrideEntry {
  appId: string
  appName: string
  bundleId: string
  autoScene: LaunchSceneKey
  userScene: LaunchSceneKey
}

/** 完整分类快照条目（导出全量数据用于完善 scenes.ts 规则） */
export interface FullClassificationEntry {
  appId: string
  appName: string
  bundleId: string
  autoScene: LaunchSceneKey
  finalScene: LaunchSceneKey
  overridden: boolean
}

export interface QuickLaunchState {
  scenes: Record<LaunchSceneKey, string[]>
  sceneOrder: LaunchSceneKey[]
  expandedScenes: Record<LaunchSceneKey, boolean>
  searchQuery: string
  loading: boolean
  isEditMode: boolean
  appOverrides: Record<string, LaunchSceneKey>
  overridePersistenceIssue: "recovered" | "newerSchema" | "tooLarge" | null
  /** 自动分类结果（不含 overrides），用于导出对比 */
  autoClassified: Record<LaunchSceneKey, string[]>

  setScenes: (scenes: Record<LaunchSceneKey, string[]>) => void
  setSceneOrder: (order: LaunchSceneKey[]) => void
  toggleExpandScene: (key: LaunchSceneKey) => void
  setSearchQuery: (query: string) => void
  setLoading: (loading: boolean) => void
  moveAppToScene: (appId: string, scene: LaunchSceneKey) => void
  removeAppFromScene: (appId: string, scene: LaunchSceneKey) => void
  batchSetScenes: (scenes: Record<LaunchSceneKey, string[]>) => void
  toggleEditMode: () => void
  loadOverrides: () => void
  saveOverrides: () => void
  resetOverrides: () => void
  moveAppToSceneOverride: (appId: string, sceneKey: LaunchSceneKey) => void
  setAutoClassified: (scenes: Record<LaunchSceneKey, string[]>) => void
}
