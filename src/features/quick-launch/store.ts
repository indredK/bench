/**
 * Quick Launch Store / 快捷启动状态
 *
 * 编辑模式下用户可右键移动应用归类，数据仅存于内存，重启后恢复自动分类默认值。
 * 导出功能为开发者工具，用于导出全量数据优化分类规则。
 */
import { create } from "zustand";
import type { LaunchSceneKey, QuickLaunchState } from "@/features/quick-launch/types";

const DEFAULT_SCENE_ORDER: LaunchSceneKey[] = [
  "ai-ide", "ai-claw", "ai-assistant", "ai-office", "ai-model", "ai-tool", "dev", "system",
  "writing", "browser", "communication", "design", "entertainment", "other",
];

export const useQuickLaunchStore = create<QuickLaunchState>((set) => ({
  scenes: {} as Record<LaunchSceneKey, string[]>,
  sceneOrder: DEFAULT_SCENE_ORDER,
  expandedScenes: {} as Record<LaunchSceneKey, boolean>,
  searchQuery: "",
  loading: false,
  isEditMode: false,
  appOverrides: {},
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
      const next = { ...state.scenes };
      for (const key of Object.keys(next) as LaunchSceneKey[]) {
        next[key] = next[key].filter((id) => id !== appId);
      }
      next[scene] = [appId, ...(next[scene] || [])];
      return { scenes: next };
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
        {} as Record<LaunchSceneKey, boolean>
      ),
    }),

  toggleEditMode: () => set((state) => ({ isEditMode: !state.isEditMode })),

  setAutoClassified: (scenes) => set({ autoClassified: scenes }),

  /** 重置覆盖数据（内存态，重启后自动清空） */
  loadOverrides: () => {
    // 无持久化，每次启动都是空覆盖
  },

  /** 保留接口兼容性，实际无操作 */
  saveOverrides: () => {
    // 无持久化
  },

  /** 清除用户覆盖数据，回到自动分类默认值 */
  resetOverrides: () => {
    set({ appOverrides: {} });
  },

  /** 移动应用到目标场景，仅更新内存状态 */
  moveAppToSceneOverride: (appId, sceneKey) =>
    set((state) => {
      // 1. 更新 overrides 映射
      const nextOverrides = { ...state.appOverrides, [appId]: sceneKey };

      // 2. 同步更新 scenes：从所有场景移除，加入目标场景
      const nextScenes = { ...state.scenes };
      for (const key of Object.keys(nextScenes) as LaunchSceneKey[]) {
        nextScenes[key] = nextScenes[key].filter((id) => id !== appId);
      }
      nextScenes[sceneKey] = [appId, ...(nextScenes[sceneKey] || [])];

      return { appOverrides: nextOverrides, scenes: nextScenes };
    }),
}));
