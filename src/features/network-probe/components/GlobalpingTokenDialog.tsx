import { useEffect, useState } from "react"
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
import { translateError } from "@/lib/tauri/errors"

interface GlobalpingTokenDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  getConfigured: () => Promise<boolean>
  saveToken: (token: string) => Promise<void>
  deleteToken: () => Promise<void>
}

export function GlobalpingTokenDialog({
  open,
  onOpenChange,
  getConfigured,
  saveToken,
  deleteToken,
}: GlobalpingTokenDialogProps) {
  const { t } = useTranslation()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setToken("")
    setError(null)
    setMessage(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingStatus(true)
    setError(null)
    setMessage(null)
    void getConfigured()
      .then((value) => {
        if (!cancelled) setConfigured(value)
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setConfigured(null)
          setError(translateError(t, reason, t("networkProbe.globalping.tokenStatusFailed")))
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingStatus(false)
      })
    return () => {
      cancelled = true
    }
  }, [getConfigured, open, t])

  async function handleSave() {
    if (busy || !token.trim()) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await saveToken(token)
      setConfigured(true)
      setToken("")
      setMessage(t("networkProbe.globalping.tokenSaved"))
    } catch (reason) {
      setError(translateError(t, reason, t("networkProbe.globalping.tokenSaveFailed")))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (busy || !configured) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await deleteToken()
      setConfigured(false)
      setToken("")
      setMessage(t("networkProbe.globalping.tokenRemoved"))
    } catch (reason) {
      setError(translateError(t, reason, t("networkProbe.globalping.tokenRemoveFailed")))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("networkProbe.globalping.tokenTitle")}</DialogTitle>
          <DialogDescription>{t("networkProbe.globalping.tokenDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            {loadingStatus
              ? t("networkProbe.globalping.tokenChecking")
              : configured === true
                ? t("networkProbe.globalping.tokenConfigured")
                : configured === false
                  ? t("networkProbe.globalping.tokenNotConfigured")
                  : t("networkProbe.globalping.tokenStatusUnknown")}
          </p>
          <label className="block space-y-1 text-xs font-medium" htmlFor="globalping-token">
            {t("networkProbe.globalping.tokenLabel")}
            <Input
              id="globalping-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              disabled={busy || loadingStatus}
            />
          </label>
          {error ? (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400" role="status">
              {message}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          {configured ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy || loadingStatus}
              onClick={handleDelete}
            >
              {busy
                ? t("networkProbe.globalping.tokenWorking")
                : t("networkProbe.globalping.tokenRemove")}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={busy || loadingStatus || !token.trim()}
            onClick={handleSave}
          >
            {busy
              ? t("networkProbe.globalping.tokenWorking")
              : t("networkProbe.globalping.tokenSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
