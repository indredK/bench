/**
 * Feature Page / 功能页面: compose controller & view; 只做装配.
 *
 * v2 重设计：运行结果查看并入卡片聚焦层（左输出 / 右详情），
 * 原 CommandCardDetail 弹窗与 RunDrawer 已移除。确认弹窗（提权/删除）
 * 因安全约束保留。复制成功等提示走 sonner 右下角通知。
 */
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { Terminal } from "lucide-react"
import { toast } from "sonner"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { RuntimeFeatureGate } from "@/components/common/RuntimeFeatureGate"
import { CommandCardEditor } from "@/features/command-center/components/CommandCardEditor"
import { CommandCenterPageContent } from "@/features/command-center/components/CommandCenterPageContent"
import { RunDetailDrawer } from "@/features/command-center/components/RunDetailDrawer"
import { useCommandCenterController } from "@/features/command-center/hooks/useCommandCenterController"
import { useCommandCenterStore } from "@/features/command-center/store"
import type { FeatureDescriptor } from "@/platform/capabilities"
import { openPlatformDialog, savePlatformDialog } from "@/platform/dialog"
import type { CommandCard } from "@/lib/tauri/types/command-center"

export default function CommandCenter({ feature }: { feature?: FeatureDescriptor }) {
  const { t } = useTranslation()
  const controller = useCommandCenterController()
  const expandedId = useCommandCenterStore((s) => s.expandedId)
  const setExpandedId = useCommandCenterStore((s) => s.setExpandedId)

  const [editorCard, setEditorCard] = useState<CommandCard | null>(null)
  const [confirmRun, setConfirmRun] = useState<CommandCard | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CommandCard | null>(null)
  const [ioBusy, setIoBusy] = useState<"export" | "import" | null>(null)

  const handleAdd = useCallback(() => {
    setEditorCard(controller.createDraft())
  }, [controller])

  const handleExport = useCallback(async () => {
    if (ioBusy) return
    setIoBusy("export")
    try {
      const path = await savePlatformDialog({
        title: t("commandCenter.io.exportTitle"),
        defaultPath: "command-cards.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      })
      if (!path) {
        toast.message(t("commandCenter.io.exportCanceled"))
        return
      }
      const count = await controller.exportCards(path, controller.cards)
      if (count !== null) toast.success(t("commandCenter.io.exported", { count }))
    } finally {
      setIoBusy(null)
    }
  }, [controller, ioBusy, t])

  const handleImport = useCallback(async () => {
    if (ioBusy) return
    setIoBusy("import")
    try {
      const selected = await openPlatformDialog({
        title: t("commandCenter.io.importTitle"),
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      })
      const path = Array.isArray(selected) ? selected[0] : selected
      if (!path) {
        toast.message(t("commandCenter.io.importCanceled"))
        return
      }
      const next = await controller.importCards(path)
      if (next !== null) toast.success(t("commandCenter.io.imported", { count: next.length }))
    } finally {
      setIoBusy(null)
    }
  }, [controller, ioBusy, t])

  const runCard = useCallback(
    async (card: CommandCard) => {
      if (card.kind === "copy") {
        await controller.runCard(card)
        toast.success(t("commandCenter.result.copied"))
        return
      }
      setExpandedId(card.id)
      await controller.runCard(card)
      const outcome = useCommandCenterStore.getState().runOutcome[card.id]
      if (outcome?.result) {
        if (outcome.result.success) {
          toast.success(t("commandCenter.result.success"))
        } else {
          toast.error(t("commandCenter.result.failed", { code: outcome.result.exitCode ?? "?" }))
        }
      } else if (controller.error) {
        toast.error(controller.error)
      }
    },
    [controller, setExpandedId, t],
  )

  // 终止：仅向后端发取消信号；Esc/点遮罩只是关弹窗，不打断命令。
  const cancelRun = useCallback(() => {
    void controller.cancelRun()
  }, [controller])

  const handleRunRequest = useCallback(
    (card: CommandCard) => {
      if (controller.requiresConfirm(card.kind)) {
        setConfirmRun(card)
      } else {
        void runCard(card)
      }
    },
    [controller, runCard],
  )

  const handleReorder = useCallback(
    async (orderedIds: string[]) => {
      const ok = await controller.reorderCards(orderedIds)
      if (ok) toast.success(t("commandCenter.reordered"))
      else toast.error(controller.error || t("commandCenter.errors.saveFailed"))
    },
    [controller, t],
  )

  const handleSubmit = useCallback(
    async (card: CommandCard) => {
      const ok = await controller.saveCard(card)
      if (ok) setEditorCard(null)
    },
    [controller],
  )

  const hasResult = useCallback(
    (id: string) => Boolean(controller.runOutcome[id]?.result),
    [controller.runOutcome],
  )

  const runConsequence = confirmRun ? confirmRun.command : ""

  const expandedCard = expandedId
    ? (controller.cards.find((c) => c.id === expandedId) ?? null)
    : null

  // 抽屉内点编辑：先关抽屉，再开编辑器（避免 Sheet 与 Dialog 同时争焦点）
  const handleEditFromDrawer = useCallback(
    (card: CommandCard) => {
      setExpandedId(null)
      setEditorCard(card)
    },
    [setEditorCard, setExpandedId],
  )

  return (
    <RuntimeFeatureGate
      feature={feature}
      title={t("commandCenter.title")}
      icon={<Terminal size={32} className="opacity-40" />}
    >
      <CommandCenterPageContent
        cards={controller.cards}
        loading={controller.loading}
        error={controller.error}
        runningIds={controller.runningIds}
        onAdd={handleAdd}
        onEdit={setEditorCard}
        onRun={handleRunRequest}
        onDelete={setConfirmDelete}
        onExpand={(card) => setExpandedId(card.id)}
        onTerminate={cancelRun}
        onExport={handleExport}
        onImport={handleImport}
        ioBusy={ioBusy}
        onReorder={handleReorder}
        onDismissError={controller.clearError}
        hasResult={hasResult}
      />

      <RunDetailDrawer
        card={expandedCard}
        runningIds={controller.runningIds}
        runStatus={controller.runStatus}
        onRun={(card) => {
          if (controller.requiresConfirm(card.kind)) {
            setConfirmRun(card)
          } else {
            void runCard(card)
          }
        }}
        onEdit={handleEditFromDrawer}
        onTerminate={cancelRun}
        onOpenChange={(open) => {
          if (!open) setExpandedId(null)
        }}
      />

      <CommandCardEditor
        open={editorCard !== null}
        draft={editorCard}
        onOpenChange={(open) => {
          if (!open) setEditorCard(null)
        }}
        onSubmit={handleSubmit}
      />

      {confirmRun && (
        <DestructiveConfirmDialog
          open={confirmRun !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmRun(null)
          }}
          title={t("commandCenter.confirmRun.title")}
          description={t("commandCenter.confirmRun.description", { title: confirmRun.title })}
          consequence={<span className="font-mono text-xs break-all">{runConsequence}</span>}
          confirmLabel={t("commandCenter.confirmRun.action")}
          cancelLabel={t("common.cancel")}
          loading={controller.runningIds.has(confirmRun.id)}
          onConfirm={async () => {
            const card = confirmRun
            await runCard(card)
          }}
        />
      )}

      {confirmDelete && (
        <DestructiveConfirmDialog
          open={confirmDelete !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmDelete(null)
          }}
          title={t("commandCenter.confirmDelete.title")}
          description={t("commandCenter.confirmDelete.description", { title: confirmDelete.title })}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          onConfirm={async () => {
            const id = confirmDelete.id
            await controller.deleteCard(id)
          }}
        />
      )}
    </RuntimeFeatureGate>
  )
}
