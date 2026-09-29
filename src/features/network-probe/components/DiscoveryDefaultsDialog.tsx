/**
 * STUN/NTP source editor. Keeps discovery probe defaults independently editable/resettable.
 */
import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
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
import type { NetworkProbeDefaultsCatalog, ProbeServer } from "@/lib/tauri/types/network-probe"

const STUN_MIN = 2
const STUN_MAX = 6
const NTP_MIN = 1
const NTP_MAX = 8

interface DiscoveryDefaultsDialogProps {
  open: boolean
  busy: boolean
  defaults: NetworkProbeDefaultsCatalog | null
  onOpenChange: (open: boolean) => void
  onSave: (stunServers: ProbeServer[], ntpServers: ProbeServer[]) => Promise<boolean>
  onReset: () => Promise<boolean>
}

function isValidSources(sources: ProbeServer[], minimum: number, maximum: number): boolean {
  if (sources.length < minimum || sources.length > maximum) return false
  const ids = new Set<string>()
  const servers = new Set<string>()
  return sources.every(({ id, server }) => {
    const normalizedId = id.trim()
    const normalizedServer = server.trim()
    let parsedServer: URL | null = null
    try {
      parsedServer = new URL(`udp://${normalizedServer}`)
    } catch {
      parsedServer = null
    }
    const valid =
      id === normalizedId &&
      /^[a-z0-9-]{1,64}$/.test(normalizedId) &&
      server === normalizedServer &&
      !/[\s/?#@]/.test(normalizedServer) &&
      Boolean(parsedServer?.hostname) &&
      Number(parsedServer?.port) > 0 &&
      Number(parsedServer?.port) <= 65535 &&
      (!parsedServer || parsedServer.pathname === "" || parsedServer.pathname === "/") &&
      !ids.has(normalizedId) &&
      !servers.has(normalizedServer.toLowerCase())
    ids.add(normalizedId)
    servers.add(normalizedServer.toLowerCase())
    return valid
  })
}

function nextId(sources: ProbeServer[]): string {
  let index = sources.length + 1
  while (sources.some((source) => source.id === `custom-${index}`)) index += 1
  return `custom-${index}`
}

export function DiscoveryDefaultsDialog({
  open,
  busy,
  defaults,
  onOpenChange,
  onSave,
  onReset,
}: DiscoveryDefaultsDialogProps) {
  const { t } = useTranslation()
  const [stunServers, setStunServers] = useState<ProbeServer[]>([])
  const [ntpServers, setNtpServers] = useState<ProbeServer[]>([])
  const [feedback, setFeedback] = useState("")

  useEffect(() => {
    if (!open || !defaults) return
    setStunServers(defaults.stunServers.map((source) => ({ ...source })))
    setNtpServers(defaults.ntpServers.map((source) => ({ ...source })))
  }, [defaults, open])

  useEffect(() => {
    if (open) setFeedback("")
  }, [open])

  const valid =
    defaults !== null &&
    isValidSources(stunServers, STUN_MIN, STUN_MAX) &&
    isValidSources(ntpServers, NTP_MIN, NTP_MAX)

  const save = async () => {
    if (!valid || busy) return
    setFeedback("")
    setFeedback(
      (await onSave(stunServers, ntpServers))
        ? t("networkProbe.defaults.saved")
        : t("networkProbe.defaults.saveFailed"),
    )
  }

  const reset = async () => {
    if (busy) return
    setFeedback("")
    setFeedback(
      (await onReset())
        ? t("networkProbe.defaults.restored")
        : t("networkProbe.defaults.saveFailed"),
    )
  }

  const updateSource = (
    setter: React.Dispatch<React.SetStateAction<ProbeServer[]>>,
    index: number,
    field: keyof ProbeServer,
    value: string,
  ) => {
    setter((current) =>
      current.map((source, sourceIndex) =>
        sourceIndex === index ? { ...source, [field]: value } : source,
      ),
    )
    setFeedback("")
  }

  const renderSources = (
    kind: "stun" | "ntp",
    sources: ProbeServer[],
    setter: React.Dispatch<React.SetStateAction<ProbeServer[]>>,
    minimum: number,
    maximum: number,
  ) => (
    <section className="space-y-3 rounded-lg border p-3" aria-labelledby={`${kind}-sources-title`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`${kind}-sources-title`} className="text-sm font-semibold">
            {t(`networkProbe.defaults.${kind}.title`)}
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {t(`networkProbe.defaults.${kind}.hint`, { minimum, maximum })}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || sources.length >= maximum}
          onClick={() => setter((current) => [...current, { id: nextId(current), server: "" }])}
        >
          <Plus aria-hidden="true" />
          {t("networkProbe.defaults.add")}
        </Button>
      </div>
      <div className="space-y-2">
        {sources.map((source, index) => (
          <div
            key={`${kind}-${index}`}
            className="grid grid-cols-[minmax(5rem,0.8fr)_minmax(0,2fr)_auto] items-end gap-2"
          >
            <div className="min-w-0">
              <label
                className="text-muted-foreground mb-1 block text-xs"
                htmlFor={`${kind}-id-${index}`}
              >
                {t("networkProbe.defaults.id")}
              </label>
              <Input
                id={`${kind}-id-${index}`}
                value={source.id}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                aria-invalid={!/^[a-z0-9-]{1,64}$/.test(source.id.trim())}
                onChange={(event) => updateSource(setter, index, "id", event.target.value)}
              />
            </div>
            <div className="min-w-0">
              <label
                className="text-muted-foreground mb-1 block text-xs"
                htmlFor={`${kind}-server-${index}`}
              >
                {t("networkProbe.defaults.address")}
              </label>
              <Input
                id={`${kind}-server-${index}`}
                value={source.server}
                placeholder={kind === "stun" ? "stun.example.com:3478" : "time.example.com:123"}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                aria-invalid={!/^[^\s/?#@]+:\d{1,5}$/.test(source.server.trim())}
                onChange={(event) => updateSource(setter, index, "server", event.target.value)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={t("networkProbe.defaults.remove", { id: source.id || index + 1 })}
              disabled={busy || sources.length <= minimum}
              onClick={() =>
                setter((current) => current.filter((_, sourceIndex) => sourceIndex !== index))
              }
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("networkProbe.defaults.title")}</DialogTitle>
          <DialogDescription>{t("networkProbe.defaults.description")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {renderSources("stun", stunServers, setStunServers, STUN_MIN, STUN_MAX)}
          {renderSources("ntp", ntpServers, setNtpServers, NTP_MIN, NTP_MAX)}
          <p
            role="status"
            aria-live="polite"
            className={`${valid ? "text-muted-foreground" : "text-destructive"} min-h-5 text-xs`}
          >
            {!valid ? t("networkProbe.defaults.invalid") : feedback}
          </p>
        </div>
        <DialogFooter className="bg-background shrink-0 flex-wrap gap-2 border-t pt-3">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void reset()}>
            {t("networkProbe.defaults.restore")}
          </Button>
          <Button type="button" disabled={busy || !valid} onClick={() => void save()}>
            {busy ? t("networkProbe.defaults.saving") : t("networkProbe.defaults.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
