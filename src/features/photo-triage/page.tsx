/**
 * Page / 页面入口：欢迎页 / 筛选界面切换.
 * 组装 WelcomePicker → TriageHeader + TriageToolbar + 待选文件夹栏 +
 * Splitter + GroupIndexBar + ThumbnailStrip + PreviewStage + 弹窗。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { FolderPlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  usePhotoTriageController,
  prettyPath,
} from "@/features/photo-triage/hooks/usePhotoTriageController"
import { useKeyboardShortcuts } from "@/features/photo-triage/hooks/useKeyboardShortcuts"
import { usePhotoTriageStore } from "@/features/photo-triage/store"
import { WelcomePicker } from "@/features/photo-triage/components/WelcomePicker"
import { TriageHeader } from "@/features/photo-triage/components/TriageHeader"
import { TriageToolbar } from "@/features/photo-triage/components/TriageToolbar"
import { ThumbnailStrip } from "@/features/photo-triage/components/ThumbnailStrip"
import { GroupIndexBar } from "@/features/photo-triage/components/GroupIndexBar"
import { PreviewStage } from "@/features/photo-triage/components/PreviewStage"
import { ConfirmSheet } from "@/features/photo-triage/components/ConfirmSheet"
import { EmptyDirsDialog } from "@/features/photo-triage/components/EmptyDirsDialog"
import { KeyboardHelpDialog } from "@/features/photo-triage/components/KeyboardHelpDialog"
import { Splitter, loadStripWidth } from "@/features/photo-triage/components/Splitter"
import * as uc from "@/features/photo-triage/services/photo-triage.use-cases"
import type { PhotoItem } from "@/lib/tauri/types/photo-triage"

/** 待选文件夹栏（对齐 Python `folders`/`chips`：点击移动、拖放移动、右键 reveal、移除；拖拽中高亮 + 边缘自动滚动）。 */
function FoldersBar({
  controller,
  onAddFolder,
}: {
  controller: ReturnType<typeof usePhotoTriageController>
  onAddFolder: () => void
}) {
  const { t } = useTranslation()
  const {
    folderCandidates,
    movedCounts,
    multiSel,
    moveToFolder,
    selectAll,
    allSelected,
    dragActive,
  } = controller
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  /** 拖放后的移动确认（用户要求「二次确认放入」：显示条目数 + 目标路径，确认后才移动） */
  const [pendingMove, setPendingMove] = useState<{ ids: string[]; folder: string } | null>(null)
  const chipsRef = useRef<HTMLDivElement | null>(null)
  const scrollDirRef = useRef(0)
  const scrollRafRef = useRef(0)

  // 拖到待选栏上下边缘时自动滚动（对齐 py chipAutoScrollTick：文件夹多也能拖到被挡住的卡片）
  const autoScrollTick = useCallback(() => {
    if (!scrollDirRef.current) {
      scrollRafRef.current = 0
      return
    }
    const el = chipsRef.current
    if (el) el.scrollTop += scrollDirRef.current * 7
    scrollRafRef.current = requestAnimationFrame(autoScrollTick)
  }, [])
  const stopAutoScroll = useCallback(() => {
    scrollDirRef.current = 0
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = 0
    }
  }, [])
  useEffect(() => stopAutoScroll, [stopAutoScroll])

  const handleChipsDragOver = (e: React.DragEvent) => {
    e.preventDefault() // 空白处也可悬停，用于触发边缘滚动（对齐 py）
    e.dataTransfer.dropEffect = "move"
    const el = chipsRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const EDGE = 26
    scrollDirRef.current = e.clientY < r.top + EDGE ? -1 : e.clientY > r.bottom - EDGE ? 1 : 0
    if (scrollDirRef.current && !scrollRafRef.current) {
      scrollRafRef.current = requestAnimationFrame(autoScrollTick)
    }
  }

  const handleChipClick = (folder: string) => {
    void moveToFolder(folder).then((res) => {
      if (res.ok) {
        toast(t("photoTriage.movedItems", { count: res.count, path: prettyPath(folder) }))
      } else if (res.reason === "empty") {
        toast(t("photoTriage.pickFirst"))
      } else {
        toast(t("photoTriage.moveFailed"))
      }
    })
  }

  const handleDrop = (folder: string, e: React.DragEvent) => {
    e.preventDefault()
    // 不 stopPropagation：让事件冒泡到 chips 容器的 onDrop（停止边缘自动滚动）与页面根节点（阻止导航）
    setDragOverFolder(null)
    const ids = e.dataTransfer.getData("text/plain").split(",").filter(Boolean)
    if (!ids.length) return
    // 二次确认后放入（用户要求）：显示条目数 + 目标路径
    setPendingMove({ ids, folder })
  }

  const confirmMove = () => {
    if (!pendingMove) return
    const { ids, folder } = pendingMove
    setPendingMove(null)
    void moveToFolder(folder, ids).then((res) => {
      if (res.ok) {
        toast(t("photoTriage.movedItems", { count: res.count, path: prettyPath(folder) }))
      } else {
        toast(t("photoTriage.moveFailed"))
      }
    })
  }

  const handleSelectAll = () => {
    selectAll()
    const n = usePhotoTriageStore.getState().multiSel.length
    if (n) toast(t("photoTriage.selectedAll", { count: n }))
  }

  return (
    // 拖拽中：待选栏高亮聚焦、chips 泛蓝提示可放置（对齐 py body.file-dragging .folders/.chip）
    <div
      className={cn(
        "bg-background flex items-center gap-2 border-b px-3 py-2 transition-colors",
        dragActive && "bg-primary/5 ring-primary ring-2 ring-inset",
      )}
    >
      <span className="text-muted-foreground text-xs">{t("photoTriage.moveTo")}</span>
      <span className="text-primary text-xs font-semibold">
        {multiSel.length ? t("photoTriage.selectedCount", { count: multiSel.length }) : ""}
      </span>
      <div
        ref={chipsRef}
        className="flex max-h-[84px] min-h-0 flex-1 flex-wrap items-start gap-1.5 overflow-y-auto"
        onDragOver={handleChipsDragOver}
        onDragLeave={stopAutoScroll}
        onDrop={stopAutoScroll}
      >
        {folderCandidates.length === 0 ? (
          <span className="text-muted-foreground self-center text-xs">
            {t("photoTriage.folderEmptyHint")}
          </span>
        ) : (
          folderCandidates.map((folder, i) => (
            <div
              key={folder}
              className={cn(
                "group bg-muted/50 flex max-w-[210px] cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors",
                dragActive && "border-primary/50 [&>*]:pointer-events-none",
                dragOverFolder === folder &&
                  "border-primary bg-primary/15 shadow-[0_0_0_2px_var(--color-primary),0_0_20px_rgba(76,141,255,.5)]",
              )}
              title={`${t("photoTriage.moveInto", { path: prettyPath(folder) })}${i < 9 ? ` (${i + 1})` : ""}`}
              onClick={() => handleChipClick(folder)}
              onContextMenu={(e) => {
                e.preventDefault()
                void uc.revealPath(folder)
              }}
              onDragOver={(e) => {
                // 不 stopPropagation：容器 dragover 继续驱动边缘自动滚动（对齐 py：容器与卡片都监听）
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
                setDragOverFolder(folder)
              }}
              onDragLeave={(e) => {
                // 子元素间移动不算离开（对齐 py pointer-events 防抖动）
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverFolder(null)
              }}
              onDrop={(e) => handleDrop(folder, e)}
            >
              <span className="text-sm">📁</span>
              {i < 9 ? <span className="text-muted-foreground text-[10px]">{i + 1}</span> : null}
              <span className="max-w-[110px] min-w-0 truncate text-xs">
                {folder.split("/").filter(Boolean).pop()}
              </span>
              {movedCounts[folder] ? (
                <span className="bg-primary/15 text-primary rounded px-1 text-[10px]">
                  +{movedCounts[folder]}
                </span>
              ) : null}
              <button
                type="button"
                aria-label={t("photoTriage.removeFromBar")}
                className="text-muted-foreground hover:text-destructive ml-auto flex-none opacity-0 transition-opacity group-hover:opacity-100"
                title={t("photoTriage.removeFromBar")}
                onClick={(e) => {
                  e.stopPropagation()
                  usePhotoTriageStore.getState().removeFolderCandidate(folder)
                  uc.persistFolders()
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSelectAll}
        title={allSelected ? t("photoTriage.unselectAll") : t("photoTriage.selectAll")}
      >
        {allSelected ? t("photoTriage.unselectAll") : t("photoTriage.selectAll")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onAddFolder}
        title={t("photoTriage.addFolderHint")}
      >
        <FolderPlus size={14} className="mr-1" />
        {t("photoTriage.addFolder")}
      </Button>

      {/* 拖放放置确认（用户要求「二次确认放入」） */}
      <Dialog open={pendingMove !== null} onOpenChange={(open) => !open && setPendingMove(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("photoTriage.moveConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {pendingMove
              ? t("photoTriage.moveConfirmDesc", {
                  count: pendingMove.ids.length,
                  path: prettyPath(pendingMove.folder),
                })
              : ""}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingMove(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmMove}>{t("common.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function PhotoTriagePage() {
  const { t } = useTranslation()
  const controller = usePhotoTriageController()
  useKeyboardShortcuts(controller)

  const jumpRef = useRef<(folder: string) => void>(() => {})
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [confirmItems, setConfirmItems] = useState<PhotoItem[] | null>(null)
  const [busyTrash, setBusyTrash] = useState(false)

  // 缩略图栏宽度：首次进入从 localStorage 读取
  useEffect(() => {
    usePhotoTriageStore.setState({ stripWidth: loadStripWidth() })
  }, [])
  const stripWidth = usePhotoTriageStore((s) => s.stripWidth)
  const helpOpen = usePhotoTriageStore((s) => s.helpOpen)
  const emptyDirsOpen = usePhotoTriageStore((s) => s.emptyDirsOpen)
  const dragActive = usePhotoTriageStore((s) => s.dragActive)

  const handleAddFolder = async () => {
    const folder = await uc.pickFolder()
    if (!folder) return
    const s = usePhotoTriageStore.getState()
    if (s.folderCandidates.includes(folder)) {
      toast(t("photoTriage.alreadyInBar"))
      return
    }
    s.addFolderCandidate(folder)
    uc.persistFolders()
    setFolderDialogOpen(false)
    toast(t("photoTriage.addedFolder", { path: prettyPath(folder) }))
  }

  const handleRestore = useCallback(
    async (ids: string[]) => {
      const res = await uc.restoreItems(ids)
      if (res.ok) {
        toast(
          res.errorCount > 0
            ? t("photoTriage.restoredWarn", { count: res.count, count2: res.errorCount })
            : t("photoTriage.restored", { count: res.count }),
        )
      }
    },
    [t],
  )

  const handleTrashConfirm = useCallback(async () => {
    setBusyTrash(true)
    try {
      const ids = confirmItems?.map((it) => it.id) ?? []
      const res = await uc.trashItems(ids)
      if (res.ok) {
        toast(
          res.errorCount > 0
            ? t("photoTriage.trashMovedWarn", { count: res.count, count2: res.errorCount })
            : t("photoTriage.trashMoved", { count: res.count }),
        )
        const s = usePhotoTriageStore.getState()
        if (s.currentId && s.deletedIds.includes(s.currentId)) {
          controller.gotoNextTodo()
        }
      } else {
        toast(t("photoTriage.deleteFailed"))
      }
    } finally {
      setBusyTrash(false)
      setConfirmItems(null)
    }
  }, [confirmItems, controller, t])

  if (controller.view === "welcome") {
    return <WelcomePicker controller={controller} />
  }

  return (
    // 拖放落点兜底：整个页面声明为有效放置目标，防止 WKWebView 把 text/plain 当 URL 导航跳空白页
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      {/* 拖拽中淡化无关区域聚焦待选栏（对齐 py file-dragging header/toolbar/splitter；
          不可动缩略图/预览区——它们是拖拽源的祖先，WebKit 会在渲染上下文被改时取消拖拽） */}
      <div className={cn(dragActive && "pointer-events-none opacity-35")}>
        <TriageHeader
          controller={controller}
          onConfirmTrash={setConfirmItems}
          onOpenHelp={() => usePhotoTriageStore.getState().setHelpOpen(true)}
        />
      </div>
      <div className={cn(dragActive && "pointer-events-none opacity-35")}>
        <TriageToolbar controller={controller} />
      </div>
      <FoldersBar controller={controller} onAddFolder={() => setFolderDialogOpen(true)} />

      <div className="flex min-h-0 flex-1">
        {controller.showGroupBar ? (
          <GroupIndexBar
            controller={controller}
            onJumpToFolder={(folder) => jumpRef.current(folder)}
          />
        ) : null}
        <div className="flex flex-none flex-col border-r" style={{ width: stripWidth }}>
          <ThumbnailStrip
            controller={controller}
            onRegisterJump={(fn) => {
              jumpRef.current = fn
            }}
          />
        </div>
        <div className={cn("flex flex-none", dragActive && "pointer-events-none opacity-35")}>
          <Splitter />
        </div>
        <div className="flex min-w-0 flex-1">
          <PreviewStage controller={controller} onRestore={handleRestore} />
        </div>
      </div>

      <ConfirmSheet
        open={confirmItems !== null}
        onOpenChange={(open) => (!open ? setConfirmItems(null) : undefined)}
        items={confirmItems ?? []}
        onConfirm={handleTrashConfirm}
        busy={busyTrash}
      />

      <EmptyDirsDialog
        open={emptyDirsOpen}
        onOpenChange={(open) => usePhotoTriageStore.getState().setEmptyDirsOpen(open)}
      />
      <KeyboardHelpDialog
        open={helpOpen}
        onOpenChange={(open) => usePhotoTriageStore.getState().setHelpOpen(open)}
      />

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("photoTriage.addFolderHeader")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-muted-foreground text-sm">{t("photoTriage.addFolderSub")}</p>
            <Button variant="outline" className="w-full justify-start" onClick={handleAddFolder}>
              📂 {t("photoTriage.pickExistingBtn")}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
