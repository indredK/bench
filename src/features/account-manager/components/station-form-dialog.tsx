/**
 * Station form dialog / 站点表单对话框: add + edit station, session manager,
 * per-station network proxy. (拆分自 dialogs.tsx — A1-3)
 */
import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Globe, StickyNote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
} from "@/lib/tauri/types/account-manager"
import type { SessionSettings } from "@/features/account-manager/model/types"
import { Field } from "@/features/account-manager/components/shared"

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
