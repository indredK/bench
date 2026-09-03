/**
 * Keyboard Shortcuts / 键盘操作: 留/删/导航快捷键.
 * 对齐 Python `triage.html` 全局 keydown：
 * ←→ K D U R 0 空格 L F G Esc ⌘A 数字 1-9 ?
 */
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import type { PhotoTriageController } from "@/features/photo-triage/hooks/usePhotoTriageController"
import { usePhotoTriageStore } from "@/features/photo-triage/store"
import * as uc from "@/features/photo-triage/services/photo-triage.use-cases"
import { toast } from "sonner"

export function useKeyboardShortcuts(controller: PhotoTriageController) {
  const { t } = useTranslation()
  const {
    nav,
    markCurrent,
    undo,
    toggleLive,
    cycleFilter,
    toggleGroup,
    selectAll,
    moveToFolder,
    folderCandidates,
    deletedIds,
  } = controller

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return
      const store = usePhotoTriageStore.getState()

      // ⌘/Ctrl+A：全选当前筛选下的条目
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault()
        selectAll()
        const n = usePhotoTriageStore.getState().multiSel.length
        if (n) toast(t("photoTriage.selectedAll", { count: n }))
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case "ArrowLeft":
          nav(-1)
          break
        case "ArrowRight":
          nav(1)
          break
        case "k":
        case "K":
          markCurrent("keep")
          break
        case "d":
        case "D":
          markCurrent("drop")
          break
        case "u":
        case "U":
          undo()
          break
        case "r":
        case "R": {
          const cur = usePhotoTriageStore.getState().currentId
          if (cur && deletedIds.includes(cur)) {
            void uc.restoreItems([cur]).then((res) => {
              if (res.ok) toast(t("photoTriage.restored", { count: res.count }))
            })
          }
          break
        }
        case "0":
          controller.gotoNextTodo()
          break
        case "l":
        case "L":
          toggleLive()
          break
        case "g":
        case "G":
          toggleGroup()
          break
        case "f":
        case "F":
          cycleFilter()
          break
        case "Escape":
          if (store.helpOpen) store.setHelpOpen(false)
          if (store.emptyDirsOpen) {
            store.setEmptyDirsOpen(false)
            break
          }
          if (store.multiSel.length) store.clearMulti()
          break
        case "?":
        case "/":
          store.setHelpOpen(true)
          break
        case " ":
          e.preventDefault()
          // 视频播放/暂停由 PreviewStage 内元素处理（keydown 直达）
          break
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9": {
          const folder = folderCandidates[Number(e.key) - 1]
          if (folder) void moveToFolder(folder)
          break
        }
        default:
          break
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nav,
    markCurrent,
    undo,
    toggleLive,
    cycleFilter,
    toggleGroup,
    selectAll,
    moveToFolder,
    folderCandidates,
    deletedIds,
  ])
}
