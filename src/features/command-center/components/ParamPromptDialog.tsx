/**
 * Param Prompt Dialog / 运行前参数填写: 收集卡片命令里的 {{name}} 占位符取值。
 *
 * 安全约束: 只有当每个占位符都填了非空值时才允许运行（fail-closed）。否则像
 * `rm -rf {{path}}` 这类命令会在值为空时被替换成危险形态。实时预览最终命令，让用户
 * 在提交前看清将执行什么。
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
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
import { extractParamNames, fillParams } from "@/features/command-center/services/command-params"
import type { CommandCard } from "@/lib/tauri/types/command-center"

export function ParamPromptDialog({
  card,
  onOpenChange,
  onRunFilled,
}: {
  card: CommandCard | null
  onOpenChange: (open: boolean) => void
  onRunFilled: (filledCommand: string) => void
}) {
  const { t } = useTranslation()
  const names = useMemo(() => (card ? extractParamNames(card.command) : []), [card])
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (card) setValues({})
  }, [card])

  if (!card) return null

  const allFilled = names.every((name) => (values[name] ?? "").trim().length > 0)
  const preview = fillParams(card.command, values)

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("commandCenter.params.title")}</DialogTitle>
          <DialogDescription>
            {t("commandCenter.params.description", { title: card.title })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {names.map((name) => (
            <div key={name} className="space-y-1">
              <Label htmlFor={`cc-param-${name}`}>{`{{${name}}}`}</Label>
              <Input
                id={`cc-param-${name}`}
                value={values[name] ?? ""}
                onChange={(event) => setValues((prev) => ({ ...prev, [name]: event.target.value }))}
                placeholder={t("commandCenter.params.valuePlaceholder")}
              />
            </div>
          ))}
          <div className="space-y-1">
            <span className="text-muted-foreground text-xs">
              {t("commandCenter.params.preview")}
            </span>
            <pre className="bg-muted overflow-auto rounded p-2 font-mono text-xs break-all">
              {preview}
            </pre>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!allFilled} onClick={() => onRunFilled(preview)}>
            {t("commandCenter.params.run")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
