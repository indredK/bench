import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Minus, Square } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { hideMainWindow, quitApp, setCloseBehavior } from "@/lib/tauri/commands/app-preferences"

interface CloseBehaviorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm?: () => void
}

const BEHAVIOR_MINIMIZE_TO_TRAY = "minimize_to_tray"
const BEHAVIOR_QUIT = "quit"

export function CloseBehaviorDialog({ open, onOpenChange, onConfirm }: CloseBehaviorDialogProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string>(BEHAVIOR_MINIMIZE_TO_TRAY)
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    if (open) {
      setSelected(BEHAVIOR_MINIMIZE_TO_TRAY)
      setRemember(false)
    }
  }, [open])

  const handleConfirm = useCallback(async () => {
    const behavior = selected
    const shouldRemember = remember
    onOpenChange(false)
    try {
      if (shouldRemember) {
        await setCloseBehavior(behavior)
      }
      if (behavior === BEHAVIOR_QUIT) {
        await quitApp()
      } else {
        await hideMainWindow()
      }
    } catch {
      // silently ignore errors after dialog is closed
    }
    onConfirm?.()
  }, [selected, remember, onOpenChange, onConfirm])

  const options = [
    {
      value: BEHAVIOR_MINIMIZE_TO_TRAY,
      icon: Minus,
      title: t("closeBehavior.minimizeToTray"),
      desc: t("closeBehavior.minimizeToTrayDesc"),
    },
    {
      value: BEHAVIOR_QUIT,
      icon: Square,
      title: t("closeBehavior.quit"),
      desc: t("closeBehavior.quitDesc"),
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{t("closeBehavior.title")}</DialogTitle>
          <DialogDescription>{t("closeBehavior.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {options.map((opt) => {
            const Icon = opt.icon
            const isSelected = selected === opt.value
            return (
              <Button
                key={opt.value}
                variant={isSelected ? "default" : "outline"}
                onClick={() => setSelected(opt.value)}
                className={cn(
                  "flex w-full items-start gap-3 p-3 text-left",
                )}
              >
                <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground",
                )}
                >
                  {isSelected && <Check className="size-3" />}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="text-muted-foreground size-4 shrink-0" />
                    <span className="text-sm font-medium">{opt.title}</span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">{opt.desc}</p>
                </div>
                </Button>
              )
            })}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <label className="cursor-pointer text-sm select-none">
            {t("closeBehavior.remember")}
          </label>
          <Switch checked={remember} onCheckedChange={setRemember} />
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleConfirm}>{t("closeBehavior.confirm")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
