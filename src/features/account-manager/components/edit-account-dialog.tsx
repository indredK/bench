/**
 * Edit account dialog / 编辑账号对话框. (拆分自 dialogs.tsx — A1-3)
 */
import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
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
import type { StationAccount } from "@/lib/tauri/types/account-manager"
import { CopyIconButton, Field, IconButton } from "@/features/account-manager/components/shared"

export function EditAccountDialog({
  open,
  account,
  stationName,
  onOpenChange,
  onSubmit,
  onRevealPassword,
}: {
  open: boolean
  account: StationAccount | null
  stationName: string
  onOpenChange: (open: boolean) => void
  onSubmit: (
    username: string,
    notes: string,
    password: string | null,
    proxyEnabled: boolean,
  ) => void | Promise<void | boolean>
  onRevealPassword: (accountId: string) => Promise<string>
}) {
  const { t } = useTranslation()
  const [username, setUsername] = useState("")
  const [notes, setNotes] = useState("")
  const [password, setPassword] = useState("")
  const [passwordHidden, setPasswordHidden] = useState(true)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordDirty, setPasswordDirty] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [proxyEnabled, setProxyEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (open && account) {
      setUsername(account.username)
      setNotes(account.notes)
      setPassword("")
      setPasswordHidden(true)
      setPasswordDirty(false)
      setSubmitting(false)
      setProxyEnabled(account.proxyEnabled ?? false)
      if (account.hasPassword) {
        setPasswordLoading(true)
        void onRevealPassword(account.id)
          .then((pw: string) => {
            if (!cancelled) setPassword(pw)
          })
          .catch(() => {
            if (!cancelled) toast.error(t("accountManager.toasts.revealPasswordFailed"))
          })
          .finally(() => {
            if (!cancelled) setPasswordLoading(false)
          })
      } else {
        setPasswordLoading(false)
      }
    }
    return () => {
      cancelled = true
    }
  }, [open, account, onRevealPassword, t])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || passwordLoading) return
    const u = username.trim()
    if (!u) return
    setSubmitting(true)
    try {
      await Promise.resolve(
        onSubmit(u, notes.trim(), passwordDirty ? password : null, proxyEnabled),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false)
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{t("accountManager.editAccountDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("accountManager.editAccountDialog.subtitle", { name: stationName })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
                onChange={(e) => {
                  setPassword(e.target.value)
                  setPasswordDirty(true)
                }}
                placeholder={t("accountManager.editAccountDialog.passwordPlaceholder")}
                type={passwordHidden ? "password" : "text"}
                disabled={passwordLoading}
                suffix={
                  <div className="flex items-center">
                    <IconButton
                      onClick={() => setPasswordHidden((hidden) => !hidden)}
                      icon={passwordHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                      label={
                        passwordHidden
                          ? t("accountManager.detail.revealPassword")
                          : t("accountManager.detail.hidePassword")
                      }
                      disabled={passwordLoading}
                    />
                    {password.length > 0 ? (
                      <CopyIconButton value={password} label={t("accountManager.detail.copy")} />
                    ) : null}
                  </div>
                }
              />
            }
          />
          <Field
            label={t("accountManager.fields.notes")}
            icon={<StickyNote size={14} />}
            input={
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("accountManager.editAccountDialog.notesPlaceholder")}
                rows={3}
              />
            }
          />
          <div className="flex items-center gap-2 rounded-lg border p-3">
            <input
              type="checkbox"
              id="proxyEnabled"
              checked={proxyEnabled}
              onChange={(e) => setProxyEnabled(e.target.checked)}
              className="accent-primary size-4"
            />
            <label htmlFor="proxyEnabled" className="cursor-pointer text-sm">
              {t("accountManager.editAccountDialog.proxyEnabledLabel")}
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t("accountManager.cancel")}
            </Button>
            <Button type="submit" disabled={!username.trim() || submitting || passwordLoading}>
              {t("accountManager.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
