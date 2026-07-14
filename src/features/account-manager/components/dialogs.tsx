/**
 * Dialogs / 对话框: station + account CRUD, delete confirm, quick login, proxy paste.
 */
import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Eye, EyeOff, Globe, KeyRound, StickyNote, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type {
  NetworkProxyConfig,
  NetworkProxyType,
  ProbeStrategy,
  RelayStation,
  StationAccount,
} from "@/lib/tauri/types/account-manager"
import type { SessionSettings } from "@/features/account-manager/model/types"
import { CopyIconButton, Field, IconButton } from "@/features/account-manager/components/shared"

export function StationDialog({
  open,
  station,
  onOpenChange,
  onSubmit,
  networkProxyAvailable = true,
  networkProxyNotice,
}: {
  open: boolean
  station: RelayStation | null
  onOpenChange: (open: boolean) => void
  networkProxyAvailable?: boolean
  networkProxyNotice?: string
  onSubmit: (
    remark: string,
    website: string,
    sessionSettings?: SessionSettings,
  ) => void | Promise<void | boolean>
}) {
  const { t } = useTranslation()
  const isEditing = !!station
  const [remark, setRemark] = useState("")
  const [website, setWebsite] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Session Manager: 编辑模式下的高级设置
  const [probeStrategy, setProbeStrategyLocal] = useState<ProbeStrategy>("httpFirst")
  const [probeOverride, setProbeOverride] = useState(false)
  const [sessionTtlHours, setSessionTtlHours] = useState<number>(720)

  // v1.18: per-station 网络代理
  const [proxyEnabled, setProxyEnabled] = useState(false)
  const [proxyType, setProxyType] = useState<NetworkProxyType>("http")
  const [proxyHost, setProxyHost] = useState("")
  const [proxyPort, setProxyPort] = useState<number>(8080)
  const [proxyUsername, setProxyUsername] = useState("")
  const [proxyPassword, setProxyPassword] = useState("")
  const [proxyHasPassword, setProxyHasPassword] = useState(false)

  const reset = () => {
    setRemark("")
    setWebsite("")
    setProbeStrategyLocal("httpFirst")
    setProbeOverride(false)
    setSessionTtlHours(720)
    setProxyEnabled(false)
    setProxyType("http")
    setProxyHost("")
    setProxyPort(8080)
    setProxyUsername("")
    setProxyPassword("")
    setProxyHasPassword(false)
  }

  useEffect(() => {
    if (open && station) {
      setRemark(station.remark)
      setWebsite(station.website)
      setSessionTtlHours(station.sessionTtlHours ?? 720)
      if (station.authProfile) {
        setProbeStrategyLocal(station.authProfile.probeStrategy)
      }
      const np = station.networkProxy ?? null
      if (np) {
        setProxyEnabled(true)
        setProxyType(np.proxyType)
        setProxyHost(np.host)
        setProxyPort(np.port)
        setProxyUsername(np.username ?? "")
        setProxyHasPassword(np.encryptedPassword != null)
      } else {
        setProxyEnabled(false)
        setProxyType("http")
        setProxyHost("")
        setProxyPort(8080)
        setProxyUsername("")
        setProxyHasPassword(false)
      }
      setProxyPassword("")
    } else if (open) {
      reset()
    }
    setSubmitting(false)
  }, [open, station])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const r = remark.trim()
    const w = website.trim()
    if (!r || !w) return
    setSubmitting(true)
    try {
      const networkProxy: NetworkProxyConfig | null = proxyEnabled
        ? {
            proxyType: proxyType,
            host: proxyHost.trim(),
            port: proxyPort,
            username: proxyUsername.trim() || null,
          }
        : null
      // password:仅在用户输入了内容时传(空串=不修改,undefined)
      const networkProxyPassword = proxyPassword.length > 0 ? proxyPassword : undefined
      await Promise.resolve(
        onSubmit(r, w, {
          probeOverride,
          probeStrategy,
          sessionTtlHours,
          networkProxy,
          networkProxyPassword,
        }),
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
          <DialogTitle>
            {isEditing
              ? t("accountManager.editStationDialog.title")
              : t("accountManager.addStationDialog.title")}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? t("accountManager.editStationDialog.subtitle")
              : t("accountManager.addStationDialog.subtitle")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {t("accountManager.addStationDialog.sectionBasic")}
            </h3>
            <Field
              label={t("accountManager.fields.website")}
              icon={<Globe size={14} />}
              input={
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder={t("accountManager.addStationDialog.websitePlaceholder")}
                  type="url"
                  required
                />
              }
            />
            <Field
              label={t("accountManager.fields.remark")}
              icon={<StickyNote size={14} />}
              input={
                <Input
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder={t("accountManager.addStationDialog.remarkPlaceholder")}
                  required
                />
              }
            />
          </div>

          <section className="border-border/60 bg-muted/30 space-y-3 rounded-lg border p-3">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {t("accountManager.sessionManager.advancedSection.title")}
            </h3>
            <Field
              label={t("accountManager.sessionManager.advancedSection.probeStrategy")}
              input={
                <div className="space-y-2">
                  <label className="text-muted-foreground flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={probeOverride}
                      onChange={(e) => setProbeOverride(e.target.checked)}
                    />
                    {t("accountManager.sessionManager.advancedSection.probeOverrideLabel")}
                  </label>
                  <Select
                    value={probeStrategy}
                    onValueChange={(v) => setProbeStrategyLocal(v as ProbeStrategy)}
                    disabled={!probeOverride}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="httpFirst">
                        {t("accountManager.sessionManager.advancedSection.probeHttpFirst")}
                      </SelectItem>
                      <SelectItem value="httpOnly">
                        {t("accountManager.sessionManager.advancedSection.probeHttpOnly")}
                      </SelectItem>
                      <SelectItem value="webviewOnly">
                        {t("accountManager.sessionManager.advancedSection.probeWebviewOnly")}
                      </SelectItem>
                      <SelectItem value="hybrid">
                        {t("accountManager.sessionManager.advancedSection.probeHybrid")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              }
            />
            <Field
              label={t("accountManager.sessionManager.advancedSection.sessionTtlLabel")}
              input={
                <Input
                  type="number"
                  min={0}
                  value={sessionTtlHours}
                  onChange={(e) =>
                    setSessionTtlHours(Math.max(0, parseInt(e.target.value || "0", 10)))
                  }
                />
              }
            />
          </section>

          <section className="border-border/60 bg-muted/30 space-y-3 rounded-lg border p-3">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {t("accountManager.sessionManager.networkProxy.title")}
            </h3>
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={proxyEnabled}
                disabled={!networkProxyAvailable && !proxyEnabled}
                onChange={(e) => setProxyEnabled(e.target.checked)}
              />
              {t("accountManager.sessionManager.networkProxy.enableLabel")}
            </label>
            {networkProxyNotice && (
              <p className="text-muted-foreground text-xs">{networkProxyNotice}</p>
            )}
            {proxyEnabled && (
              <div className="space-y-3">
                <Field
                  label={t("accountManager.sessionManager.networkProxy.typeLabel")}
                  input={
                    <Select
                      value={proxyType}
                      onValueChange={(v) => setProxyType(v as NetworkProxyType)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="http">HTTP</SelectItem>
                        <SelectItem value="socks5">SOCKS5</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <Field
                    label={t("accountManager.sessionManager.networkProxy.hostLabel")}
                    input={
                      <Input
                        value={proxyHost}
                        onChange={(e) => setProxyHost(e.target.value)}
                        placeholder="127.0.0.1"
                      />
                    }
                  />
                  <Field
                    label={t("accountManager.sessionManager.networkProxy.portLabel")}
                    input={
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        value={proxyPort}
                        onChange={(e) =>
                          setProxyPort(
                            Math.min(65535, Math.max(1, parseInt(e.target.value || "0", 10))),
                          )
                        }
                      />
                    }
                  />
                </div>
                <Field
                  label={t("accountManager.sessionManager.networkProxy.usernameLabel")}
                  input={
                    <Input
                      value={proxyUsername}
                      onChange={(e) => setProxyUsername(e.target.value)}
                      placeholder={t("accountManager.sessionManager.networkProxy.usernameOptional")}
                    />
                  }
                />
                <Field
                  label={t("accountManager.sessionManager.networkProxy.passwordLabel")}
                  input={
                    <div className="space-y-1">
                      <Input
                        type="password"
                        value={proxyPassword}
                        onChange={(e) => setProxyPassword(e.target.value)}
                        placeholder={
                          proxyHasPassword
                            ? t("accountManager.sessionManager.networkProxy.passwordSetHint")
                            : t("accountManager.sessionManager.networkProxy.passwordPlaceholder")
                        }
                      />
                      {proxyHasPassword && proxyPassword.length === 0 && (
                        <p className="text-muted-foreground text-[10px]">
                          {t("accountManager.sessionManager.networkProxy.passwordLeaveBlankHint")}
                        </p>
                      )}
                    </div>
                  }
                />
              </div>
            )}
          </section>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t("accountManager.cancel")}
            </Button>
            <Button type="submit" disabled={!remark.trim() || !website.trim() || submitting}>
              {t("accountManager.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

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

export function DeleteConfirmDialog({
  open,
  title,
  description,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="pt-2 text-sm">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("accountManager.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void Promise.resolve(onConfirm())}
          >
            {t("accountManager.deleteAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Session Manager: Quick Login Dialog
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
