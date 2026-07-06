/**
 * Quick Launch Use Cases / 快捷启动业务编排
 *
 * 场景自动分类、用户覆盖应用、导出分类结果等业务编排。
 */
import type { AppInfo } from "@/lib/tauri/types/app-manager"
import { classifyAppToScene } from "@/features/quick-launch/scenes"
import type {
  LaunchSceneKey,
  OverrideEntry,
  FullClassificationEntry,
} from "@/features/quick-launch/types"

export function autoClassifyApps(apps: AppInfo[]): Record<LaunchSceneKey, string[]> {
  const scenes: Record<LaunchSceneKey, string[]> = {
    "ai-ide": [],
    "ai-claw": [],
    "ai-assistant": [],
    "ai-office": [],
    "ai-model": [],
    "ai-tool": [],
    dev: [],
    system: [],
    writing: [],
    browser: [],
    communication: [],
    design: [],
    entertainment: [],
    other: [],
  }

  for (const app of apps) {
    const scene = classifyAppToScene(app)
    if (app.isSystemApp && !app.allowedActions.launch) continue
    scenes[scene].push(app.appId)
  }

  const nameMap = new Map(apps.map((a) => [a.appId, a.name]))
  for (const key of Object.keys(scenes) as LaunchSceneKey[]) {
    scenes[key].sort((a, b) => (nameMap.get(a) || "").localeCompare(nameMap.get(b) || ""))
  }

  return scenes
}

export function applyOverrides(
  classified: Record<LaunchSceneKey, string[]>,
  overrides: Record<string, LaunchSceneKey>,
  appMap: Map<string, AppInfo>,
): Record<LaunchSceneKey, string[]> {
  const result: Record<LaunchSceneKey, string[]> = {
    "ai-ide": [],
    "ai-claw": [],
    "ai-assistant": [],
    "ai-office": [],
    "ai-model": [],
    "ai-tool": [],
    dev: [],
    system: [],
    writing: [],
    browser: [],
    communication: [],
    design: [],
    entertainment: [],
    other: [],
  }
  for (const key of Object.keys(classified) as LaunchSceneKey[]) {
    result[key] = [...classified[key]]
  }
  for (const [appId, targetScene] of Object.entries(overrides)) {
    if (!appMap.has(appId)) continue
    for (const key of Object.keys(result) as LaunchSceneKey[]) {
      result[key] = result[key].filter((id) => id !== appId)
    }
    result[targetScene] = [...result[targetScene], appId]
  }
  return result
}

export function exportOverrides(
  overrides: Record<string, LaunchSceneKey>,
  appMap: Map<string, AppInfo>,
  autoClassified: Record<LaunchSceneKey, string[]>,
): OverrideEntry[] {
  const entries: OverrideEntry[] = []
  for (const [appId, userScene] of Object.entries(overrides)) {
    const app = appMap.get(appId)
    if (!app) continue
    let autoScene: LaunchSceneKey = "other"
    for (const key of Object.keys(autoClassified) as LaunchSceneKey[]) {
      if (autoClassified[key].includes(appId)) {
        autoScene = key
        break
      }
    }
    entries.push({
      appId,
      appName: app.name,
      bundleId: app.bundleId,
      autoScene,
      userScene,
    })
  }
  return entries
}

export function exportFullClassification(
  apps: AppInfo[],
  autoClassified: Record<LaunchSceneKey, string[]>,
  overrides: Record<string, LaunchSceneKey>,
): FullClassificationEntry[] {
  const autoSceneMap = new Map<string, LaunchSceneKey>()
  for (const key of Object.keys(autoClassified) as LaunchSceneKey[]) {
    for (const appId of autoClassified[key]) {
      autoSceneMap.set(appId, key)
    }
  }

  return apps
    .filter((app) => autoSceneMap.has(app.appId))
    .map((app) => {
      const autoScene = autoSceneMap.get(app.appId) || "other"
      const userScene = overrides[app.appId]
      const overridden = !!userScene
      return {
        appId: app.appId,
        appName: app.name,
        bundleId: app.bundleId,
        autoScene,
        finalScene: overridden ? userScene : autoScene,
        overridden,
      }
    })
    .sort((a, b) => {
      if (a.overridden !== b.overridden) return a.overridden ? -1 : 1
      return a.appName.localeCompare(b.appName)
    })
}
