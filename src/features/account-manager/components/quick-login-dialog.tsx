/**
 * Quick login dialog / 快速登录对话框. (拆分自 dialogs.tsx — A1-3)
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Globe, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field } from "@/features/account-manager/components/shared"

export function QuickLoginDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultStationId,
  history,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (
    url: string,
    username: string,
    destroyOnClose: boolean,
    stationId?: string | null,
  ) => void | Promise<void>
  defaultStationId?: string | null
  history?: string[]
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState("")
  const [username, setUsername] = useState("")
  const [destroyOnClose, setDestroyOnClose] = useState(false)

  useEffect(() => {
    if (!open) {
      setUrl("")
      setUsername("")
      setDestroyOnClose(false)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("accountManager.sessionManager.quickLogin.title")}</DialogTitle>
          <DialogDescription>
            {t("accountManager.sessionManager.quickLogin.description")}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void Promise.resolve(onSubmit(url, username, destroyOnClose, defaultStationId))
          }}
          className="space-y-4"
        >
          <Field
            label={t("accountManager.sessionManager.quickLogin.urlLabel")}
            icon={<Globe size={14} />}
            input={
              <div className="space-y-1">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t("accountManager.addStationDialog.websitePlaceholder")}
                  required
                  list="quick-login-history"
                />
                {history && history.length > 0 && (
                  <>
                    <p className="text-muted-foreground text-xs">
                      {t("accountManager.sessionManager.quickLogin.historyDatalist")}
                    </p>
                    <datalist id="quick-login-history">
                      {history.map((h) => (
                        <option key={h} value={h} />
                      ))}
                    </datalist>
                  </>
                )}
              </div>
            }
          />
          <Field
            label={t("accountManager.sessionManager.quickLogin.usernameLabel")}
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
          {defaultStationId && (
            <p className="text-muted-foreground text-xs">
              {t("accountManager.sessionManager.quickLogin.attachToStation")}
            </p>
          )}
          <label className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={destroyOnClose}
              onChange={(e) => setDestroyOnClose(e.target.checked)}
              className="size-3.5 accent-blue-500"
            />
            {t("accountManager.sessionManager.quickLogin.destroyOnClose")}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("accountManager.sessionManager.quickLogin.cancel")}
            </Button>
            <Button type="submit" disabled={!url.trim() || !username.trim()}>
              {t("accountManager.sessionManager.quickLogin.openButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
