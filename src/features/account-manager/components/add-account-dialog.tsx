/**
 * Add account dialog / 新增账号对话框. (拆分自 dialogs.tsx — A1-3)
 */
import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Eye, EyeOff, KeyRound, StickyNote, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, IconButton } from "@/features/account-manager/components/shared"

export function AddAccountDialog({
  open,
  onOpenChange,
  stationName,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stationName: string
  onSubmit: (username: string, password: string, notes: string) => void | Promise<void | boolean>
}) {
  const { t } = useTranslation()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [passwordHidden, setPasswordHidden] = useState(true)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setUsername("")
    setPassword("")
    setPasswordHidden(true)
    setNotes("")
    setSubmitting(false)
  }

  useEffect(() => {
    if (!open) reset()
  }, [open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const u = username.trim()
    if (!u) return
    setSubmitting(true)
    try {
      await Promise.resolve(onSubmit(u, password, notes.trim()))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("accountManager.addAccountDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("accountManager.addAccountDialog.subtitle", { name: stationName })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={t("accountManager.fields.username")}
              icon={<UserRound size={14} />}
              input={
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("accountManager.addAccountDialog.usernamePlaceholder")}
                  required
                />
              }
            />
            <Field
              label={t("accountManager.fields.password")}
              icon={<KeyRound size={14} />}
              input={
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("accountManager.addAccountDialog.passwordPlaceholder")}
                  type={passwordHidden ? "password" : "text"}
                  suffix={
                    <IconButton
                      onClick={() => setPasswordHidden((h) => !h)}
                      icon={passwordHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                      label={
                        passwordHidden
                          ? t("accountManager.detail.revealPassword")
                          : t("accountManager.detail.hidePassword")
                      }
                    />
                  }
                />
              }
            />
          </div>
          <Field
            label={t("accountManager.fields.notes")}
            icon={<StickyNote size={14} />}
            input={
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("accountManager.addAccountDialog.notesPlaceholder")}
                rows={2}
              />
            }
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !username.trim()}>
              {submitting ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
