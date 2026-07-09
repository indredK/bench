/**
 * Controller / 控制器: bind clean-space state; 工具切换、扫描状态.
 */
import { useCleanSpaceStore } from "@/features/clean-space/store"
import type { CleanSpaceTool } from "@/features/clean-space/store"

export type { CleanSpaceTool }

export function useCleanSpaceController() {
  const activeTool = useCleanSpaceStore((s) => s.activeTool)
  const setActiveTool = useCleanSpaceStore((s) => s.setActiveTool)

  return {
    activeTool,
    setActiveTool,
  }
}

export type CleanSpaceController = ReturnType<typeof useCleanSpaceController>
