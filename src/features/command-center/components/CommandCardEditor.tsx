/**
 * Command Card Editor / 命令卡片编辑: create or edit a card; 只做卡片表单.
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Lightbulb, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { detectCardKind } from "@/features/command-center/services/detect-card-kind"
import type { CardKind, CommandCard } from "@/lib/tauri/types/command-center"

const KIND_OPTIONS: CardKind[] = ["shell", "shellAdmin", "copy", "open"]

export function CommandCardEditor({
  open,
  draft,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  draft: CommandCard | null
  onOpenChange: (open: boolean) => void
  onSubmit: (card: CommandCard) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<CommandCard | null>(draft)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(draft)
  }, [draft])

  const suggestedKind = useMemo(() => (form ? detectCardKind(form.command) : null), [form])

  if (!form) return null

  const canSubmit = form.title.trim().length > 0 && form.command.trim().length > 0
  const showSuggestion = suggestedKind !== null && suggestedKind !== form.kind

  const handleSubmit = async () => {
    if (!canSubmit || saving) return
    setSaving(true)
    const startedAt = Date.now()
    try {
      await onSubmit(form)
    } finally {
      const wait = Math.max(0, 300 - (Date.now() - startedAt))
      window.setTimeout(() => setSaving(false), wait)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("commandCenter.editor.title")}</DialogTitle>
          <DialogDescription>{t("commandCenter.editor.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="cc-title">{t("commandCenter.editor.fieldTitle")}</Label>
            <Input
              id="cc-title"
              value={form.title}
              placeholder={t("commandCenter.editor.titlePlaceholder")}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cc-desc">{t("commandCenter.editor.fieldDescription")}</Label>
            <Input
              id="cc-desc"
              value={form.description}
              placeholder={t("commandCenter.editor.descriptionPlaceholder")}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("commandCenter.editor.fieldKind")}</Label>
            <Select
              value={form.kind}
              onValueChange={(value) => setForm({ ...form, kind: value as CardKind })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {t(`commandCenter.kind.${kind}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cc-command">{t(`commandCenter.editor.command.${form.kind}`)}</Label>
            <Textarea
              id="cc-command"
              value={form.command}
              className="h-32 resize-none overflow-y-auto font-mono text-xs break-all"
              placeholder={t(`commandCenter.editor.commandPlaceholder.${form.kind}`)}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
            />
            {showSuggestion && suggestedKind && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                <Lightbulb size={14} className="shrink-0 text-amber-500" />
                <span className="text-muted-foreground flex-1">
                  {t("commandCenter.editor.suggestion", {
                    kind: t(`commandCenter.kind.${suggestedKind}`),
                  })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0"
                  onClick={() => setForm({ ...form, kind: suggestedKind })}
                >
                  {t("commandCenter.editor.applySuggestion")}
                </Button>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!canSubmit || saving} onClick={handleSubmit}>
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {t("common.save")}
              </>
            ) : (
              t("common.save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
