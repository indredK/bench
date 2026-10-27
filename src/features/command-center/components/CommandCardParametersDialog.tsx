import { useEffect, useId, useState, type FormEvent } from "react"
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
import {
  MAX_COMMAND_CARD_PARAMETER_VALUE_LENGTH,
  parseCommandTemplateParameters,
  resolveCommandTemplate,
} from "@/features/command-center/services/command-center.parameters"
import type { CommandCard } from "@/lib/tauri/types/command-center"

export function CommandCardParametersDialog({
  card,
  onOpenChange,
  onSubmit,
}: {
  card: CommandCard | null
  onOpenChange: (open: boolean) => void
  onSubmit: (command: string) => void
}) {
  const { t } = useTranslation()
  const idPrefix = useId()
  const [values, setValues] = useState<Record<string, string | undefined>>({})
  const open = card !== null

  useEffect(() => {
    setValues({})
  }, [card?.id, open])

  const parsed = card
    ? parseCommandTemplateParameters(card.command)
    : { ok: true as const, names: [] }
  const names = parsed.ok ? parsed.names : []
  const resolved = card ? resolveCommandTemplate(card.command, values) : null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!resolved?.ok) return
    onSubmit(resolved.command)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        {card ? (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {t("commandCenter.parameters.title", { title: card.title })}
              </DialogTitle>
              <DialogDescription>{t("commandCenter.parameters.description")}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {names.map((name) => {
                const inputId = `${idPrefix}-${name}`
                return (
                  <div key={name} className="space-y-1.5">
                    <Label htmlFor={inputId}>{t("commandCenter.parameters.field", { name })}</Label>
                    <Input
                      id={inputId}
                      value={values[name] ?? ""}
                      maxLength={MAX_COMMAND_CARD_PARAMETER_VALUE_LENGTH * 2}
                      autoComplete="off"
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [name]: event.target.value }))
                      }
                    />
                  </div>
                )
              })}
            </div>

            <div
              role="region"
              aria-labelledby={`${idPrefix}-preview-heading`}
              className="space-y-2 rounded-md border p-3"
            >
              <p id={`${idPrefix}-preview-heading`} className="text-sm font-medium">
                {t("commandCenter.parameters.preview")}
              </p>
              <pre className="bg-muted max-h-40 overflow-auto rounded-md p-2 font-mono text-xs break-all whitespace-pre-wrap">
                {resolved?.ok ? resolved.command : card.command}
              </pre>
              {resolved && !resolved.ok && resolved.reason !== "missingValue" ? (
                <p role="alert" className="text-destructive text-xs">
                  {t(
                    resolved.reason === "invalidSyntax"
                      ? "commandCenter.parameters.errors.invalidSyntax"
                      : resolved.reason === "tooManyParameters"
                        ? "commandCenter.parameters.errors.tooManyParameters"
                        : resolved.reason === "invalidValue"
                          ? "commandCenter.parameters.errors.invalidValue"
                          : "commandCenter.parameters.errors.commandTooLong",
                  )}
                </p>
              ) : null}
              <p className="text-muted-foreground text-xs">
                {t("commandCenter.parameters.rawSubstitutionHint")}
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!resolved?.ok}>
                {t("commandCenter.parameters.run")}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
