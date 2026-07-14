/**
 * Quick Launch Store / 快捷启动状态
 *
 * 编辑模式下用户可右键移动应用归类，覆盖数据带 schema 版本持久化。
 * 导出功能为开发者工具，用于导出全量数据优化分类规则。
 */
import { create } from "zustand"
import type { LaunchSceneKey, QuickLaunchState } from "@/features/quick-launch/types"
import { readStorageItem, writeStorageItem } from "@/platform/storage"

const OVERRIDE_STORAGE_KEY = "quick-launch-overrides"
const OVERRIDE_BACKUP_KEY = "quick-launch-overrides.corrupt-backup"
const OVERRIDE_SCHEMA_VERSION = 1
const MAX_OVERRIDE_STORAGE_BYTES = 2 * 1024 * 1024
const MAX_OVERRIDE_ENTRIES = 10_000

export type OverridePersistenceIssue = "recovered" | "newerSchema" | "tooLarge" | null

export function parseOverrideStorage(raw: string): {
  overrides: Record<string, LaunchSceneKey>
  issue: OverridePersistenceIssue
} {
  if (new TextEncoder().encode(raw).length > MAX_OVERRIDE_STORAGE_BYTES) {
    return { overrides: {}, issue: "tooLarge" }
  }

  try {
    const parsed = JSON.parse(raw) as { version?: number; overrides?: Record<string, string> }
    if (typeof parsed.version === "number" && parsed.version > OVERRIDE_SCHEMA_VERSION) {
      return { overrides: {}, issue: "newerSchema" }
    }
    if (parsed.version !== OVERRIDE_SCHEMA_VERSION || !parsed.overrides) {
      return { overrides: {}, issue: "recovered" }
    }
    const allowed = new Set<string>(DEFAULT_SCENE_ORDER)
    const overrides = Object.fromEntries(
      Object.entries(parsed.overrides)
        .slice(0, MAX_OVERRIDE_ENTRIES)
        .filter(
          ([appId, scene]) =>
            appId.length <= 128 && appId.startsWith("app-v1-") && allowed.has(scene),
        ),
    ) as Record<string, LaunchSceneKey>
    return { overrides, issue: null }
  } catch {
    return { overrides: {}, issue: "recovered" }
  }
}

const DEFAULT_SCENE_ORDER: LaunchSceneKey[] = [
  "ai-ide",
  "ai-claw",
  "ai-assistant",
  "ai-office",
  "ai-model",
  "ai-tool",
  "dev",
  "system",
  "writing",
  "browser",
  "communication",
  "design",
  "entertainment",
  "other",
]

function loadPersistedOverrides() {
  const raw = readStorageItem(OVERRIDE_STORAGE_KEY)
  if (!raw) return { overrides: {}, issue: null }
  const result = parseOverrideStorage(raw)
  if (result.issue === "recovered") {
    writeStorageItem(OVERRIDE_BACKUP_KEY, raw)
  }
  return result
}

function persistOverrides(overrides: Record<string, LaunchSceneKey>): boolean {
  const serialized = JSON.stringify({ version: OVERRIDE_SCHEMA_VERSION, overrides })
  if (new TextEncoder().encode(serialized).length > MAX_OVERRIDE_STORAGE_BYTES) return false
  writeStorageItem(OVERRIDE_STORAGE_KEY, serialized)
  return true
}

export const useQuickLaunchStore = create<QuickLaunchState>((set) => ({
  scenes: {} as Record<LaunchSceneKey, string[]>,
  sceneOrder: DEFAULT_SCENE_ORDER,
  expandedScenes: {} as Record<LaunchSceneKey, boolean>,
  searchQuery: "",
  loading: false,
  isEditMode: false,
  appOverrides: {},
  overridePersistenceIssue: null,
  autoClassified: {} as Record<LaunchSceneKey, string[]>,

  setScenes: (scenes) => set({ scenes }),
  setSceneOrder: (order) => set({ sceneOrder: order }),
  toggleExpandScene: (key) =>
    set((state) => ({
      expandedScenes: {
        ...state.expandedScenes,
        [key]: !state.expandedScenes[key],
      },
    })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setLoading: (loading) => set({ loading }),

  moveAppToScene: (appId, scene) =>
    set((state) => {
      const next = { ...state.scenes }
      for (const key of Object.keys(next) as LaunchSceneKey[]) {
        next[key] = next[key].filter((id) => id !== appId)
      }
      next[scene] = [appId, ...(next[scene] || [])]
      return { scenes: next }
    }),

  removeAppFromScene: (appId, scene) =>
    set((state) => ({
      scenes: {
        ...state.scenes,
        [scene]: state.scenes[scene].filter((id) => id !== appId),
      },
    })),

  batchSetScenes: (scenes) =>
    set({
      scenes,
      expandedScenes: Object.keys(scenes).reduce(
        (acc, key) => ({ ...acc, [key]: true }),
        {} as Record<LaunchSceneKey, boolean>,
      ),
    }),

  toggleEditMode: () =>
    set((state) => ({
      isEditMode:
        state.overridePersistenceIssue === "newerSchema" ||
        state.overridePersistenceIssue === "tooLarge"
          ? false
          : !state.isEditMode,
    })),

  setAutoClassified: (scenes) => set({ autoClassified: scenes }),

  loadOverrides: () => {
    const result = loadPersistedOverrides()
    set({ appOverrides: result.overrides, overridePersistenceIssue: result.issue })
  },

  saveOverrides: () => {
    // Writes happen atomically with each mutation; this remains a compatibility hook.
  },

  /** 清除用户覆盖数据，回到自动分类默认值 */
  resetOverrides: () => {
    set((state) => {
      if (
        state.overridePersistenceIssue === "newerSchema" ||
        state.overridePersistenceIssue === "tooLarge"
      ) {
        return state
      }
      return persistOverrides({})
        ? { appOverrides: {}, overridePersistenceIssue: null }
        : { overridePersistenceIssue: "tooLarge" }
    })
  },

  /** 移动应用到目标场景，仅更新内存状态 */
  moveAppToSceneOverride: (appId, sceneKey) =>
    set((state) => {
      if (
        state.overridePersistenceIssue === "newerSchema" ||
        state.overridePersistenceIssue === "tooLarge"
      ) {
        return state
      }
      // 1. 更新 overrides 映射
      const nextOverrides = { ...state.appOverrides, [appId]: sceneKey }
      if (!persistOverrides(nextOverrides)) {
        return { overridePersistenceIssue: "tooLarge" }
      }

      // 2. 同步更新 scenes：从所有场景移除，加入目标场景
      const nextScenes = { ...state.scenes }
      for (const key of Object.keys(nextScenes) as LaunchSceneKey[]) {
        nextScenes[key] = nextScenes[key].filter((id) => id !== appId)
      }
      nextScenes[sceneKey] = [appId, ...(nextScenes[sceneKey] || [])]

      return { appOverrides: nextOverrides, scenes: nextScenes, overridePersistenceIssue: null }
    }),
}))
