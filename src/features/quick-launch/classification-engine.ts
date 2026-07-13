/**
 * Versioned classification engine. Rule data stays in `scenes.ts`; this
 * module owns execution, filtering, and result initialization so consumers do
 * not duplicate rule-order semantics.
 */
import type { AppInfo } from "@/lib/tauri/types/app-manager"
import type { LaunchSceneKey } from "@/features/quick-launch/types"
import {
  classifyAppToScene,
  LAUNCH_SCENES,
  SCENE_RULES_VERSION,
} from "@/features/quick-launch/scenes"

export interface ClassificationSnapshot {
  ruleVersion: string
  scenes: Record<LaunchSceneKey, string[]>
}

export function createEmptyClassification(): Record<LaunchSceneKey, string[]> {
  const scenes = {} as Record<LaunchSceneKey, string[]>
  for (const scene of LAUNCH_SCENES) scenes[scene.key] = []
  return scenes
}

export function classifyInventory(apps: AppInfo[]): ClassificationSnapshot {
  const scenes = createEmptyClassification()
  const names = new Map(apps.map((app) => [app.appId, app.name]))

  for (const app of apps) {
    if (!app.allowedActions.launch) continue
    scenes[classifyAppToScene(app)].push(app.appId)
  }
  for (const scene of LAUNCH_SCENES) {
    scenes[scene.key].sort((left, right) =>
      (names.get(left) ?? "").localeCompare(names.get(right) ?? ""),
    )
  }

  return { ruleVersion: SCENE_RULES_VERSION, scenes }
}
