/**
 * Feature UI / 功能界面: Sites L1 · regional site packs + custom targets.
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NetworkProbeCancelButton } from "@/features/network-probe/components/NetworkProbeCancelButton"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { useSiteMonitor } from "@/features/network-probe/hooks/useSiteMonitor"
import type { SiteMonitorError } from "@/features/network-probe/hooks/useSiteMonitor"
import type { SiteSampleResult, SitesProbeResult } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

const PACK_LABEL_KEYS: Record<string, string> = {
  global: "networkProbe.sites.packs.global",
  "cn-friendly": "networkProbe.sites.packs.cn-friendly",
  dev: "networkProbe.sites.packs.dev",
  official: "networkProbe.sites.packs.official",
}

const CUSTOM_SITES_KEY = "network-probe:custom-sites"
const MAX_CUSTOM_SITES = 24
const MAX_CUSTOM_SITE_BYTES = 2048
const MAX_CUSTOM_SITE_STORAGE_BYTES = 128 * 1024
const customSiteEncoder = new TextEncoder()

function customSiteByteLength(value: string): number {
  if (value.length > MAX_CUSTOM_SITE_BYTES) return MAX_CUSTOM_SITE_BYTES + 1
  return customSiteEncoder.encode(value).byteLength
}

function customSiteKey(value: string): string {
  const target = value.trim()
  const urlTarget = /^https?:\/\//i.test(target)
    ? target
    : `https://${target.includes(":") && !target.startsWith("[") && target.split(":").length > 2 ? `[${target}]` : target}`
  try {
    return new URL(urlTarget).toString()
  } catch {
    return target
  }
}

interface SitesProbePanelProps {
  loading: boolean
  canCancel: boolean
  cancelling: boolean
  result: SitesProbeResult | null
  streaming: SiteSampleResult[]
  sparklines: Record<string, number[]>
  packIds: string[]
  toolEnabled: boolean
  toolStatus?: string
  onRunPack: (packId: string) => void
  onRunCustom: (targets: string[]) => void
  onCancel: () => void
}

function loadCustomSites(): string[] {
  if (typeof sessionStorage === "undefined") return []
  try {
    const raw = sessionStorage.getItem(CUSTOM_SITES_KEY)
    if (!raw) return []
    if (raw.length > MAX_CUSTOM_SITE_STORAGE_BYTES) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    const sites: string[] = []
    const seen = new Set<string>()
    for (const item of parsed) {
      if (
        typeof item !== "string" ||
        item.trim().length === 0 ||
        customSiteByteLength(item.trim()) > MAX_CUSTOM_SITE_BYTES
      ) {
        continue
      }
      const key = customSiteKey(item)
      if (seen.has(key)) continue
      seen.add(key)
      sites.push(item)
      if (sites.length >= MAX_CUSTOM_SITES) break
    }
    return sites
  } catch {
    return []
  }
}

function persistCustomSites(sites: string[]) {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.setItem(CUSTOM_SITES_KEY, JSON.stringify(sites))
  } catch {
    // ignore
  }
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <span className="text-muted-foreground font-mono text-[10px]">—</span>
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 1)
  const w = 64
  const h = 18
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - ((v - min) / span) * (h - 2) - 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg width={w} height={h} className="text-emerald-600 dark:text-emerald-400" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
    </svg>
  )
}

export function SitesProbePanel({
  loading,
  canCancel,
  cancelling,
  result,
  streaming,
  sparklines,
  packIds,
  toolEnabled,
  toolStatus,
  onRunPack,
  onRunCustom,
  onCancel,
}: SitesProbePanelProps) {
  const { t, i18n } = useTranslation()
  const defaultPack = packIds.includes("cn-friendly") ? "cn-friendly" : (packIds[0] ?? "global")
  const [packId, setPackId] = useState(defaultPack)
  const [customSites, setCustomSites] = useState<string[]>(loadCustomSites)
  const [monitorTargets, setMonitorTargets] = useState<string[]>([])
  const [draft, setDraft] = useState("")
  const monitor = useSiteMonitor(monitorTargets, toolEnabled)
  const customTargetTooLong = customSiteByteLength(draft.trim()) > MAX_CUSTOM_SITE_BYTES
  const customSitesFull = customSites.length >= MAX_CUSTOM_SITES

  useEffect(() => {
    persistCustomSites(customSites)
  }, [customSites])

  const packs = useMemo(() => (packIds.length > 0 ? packIds : ["global"]), [packIds])
  useEffect(() => {
    if (packs.includes(packId)) return
    setPackId(packs.includes("cn-friendly") ? "cn-friendly" : (packs[0] ?? ""))
  }, [packId, packs])
  // 跑动中以本轮 streaming 为准: 旧 result 优先会让新一轮逐站推进看起来「没反应」。
  const rows = loading ? streaming : result?.results?.length ? result.results : streaming

  const addCustom = () => {
    const value = draft.trim()
    if (
      !value ||
      customSiteByteLength(value) > MAX_CUSTOM_SITE_BYTES ||
      customSites.length >= MAX_CUSTOM_SITES
    ) {
      return
    }
    if (customSites.some((site) => customSiteKey(site) === customSiteKey(value))) {
      setDraft("")
      return
    }
    setCustomSites((prev) => [...prev, value].slice(0, MAX_CUSTOM_SITES))
    setDraft("")
  }

  const removeCustom = (site: string) => {
    setCustomSites((prev) => prev.filter((candidate) => candidate !== site))
    setMonitorTargets((prev) => prev.filter((candidate) => candidate !== site))
  }

  const toggleMonitorTarget = (site: string) => {
    setMonitorTargets((prev) =>
      prev.includes(site)
        ? prev.filter((candidate) => candidate !== site)
        : prev.length < 3
          ? [...prev, site]
          : prev,
    )
  }

  const monitorErrorMessage = (key: SiteMonitorError | null) => {
    switch (key) {
      case "networkProbe.siteMonitor.errors.desktopOnly":
        return t("networkProbe.siteMonitor.errors.desktopOnly")
      case "networkProbe.siteMonitor.errors.targetsRequired":
        return t("networkProbe.siteMonitor.errors.targetsRequired")
      case "networkProbe.siteMonitor.errors.tooManyTargets":
        return t("networkProbe.siteMonitor.errors.tooManyTargets", { max: 3 })
      case "networkProbe.siteMonitor.errors.targetsChanged":
        return t("networkProbe.siteMonitor.errors.targetsChanged")
      case "networkProbe.siteMonitor.errors.permissionDenied":
        return t("networkProbe.siteMonitor.errors.permissionDenied")
      case "networkProbe.siteMonitor.errors.permissionRevoked":
        return t("networkProbe.siteMonitor.errors.permissionRevoked")
      case "networkProbe.siteMonitor.errors.permissionFailed":
        return t("networkProbe.siteMonitor.errors.permissionFailed")
      case "networkProbe.siteMonitor.errors.probeFailed":
        return t("networkProbe.siteMonitor.errors.probeFailed")
      case "networkProbe.siteMonitor.errors.probeUnavailable":
        return t("networkProbe.siteMonitor.errors.probeUnavailable")
      case "networkProbe.siteMonitor.errors.deliveryFailed":
        return t("networkProbe.siteMonitor.errors.deliveryFailed")
      default:
        return null
    }
  }

  const monitorError = monitorErrorMessage(monitor.error)

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.sites.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "sitesProbe",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-44 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-sites-pack">
                {t("networkProbe.sites.pack")}
              </label>
              <select
                id="np-sites-pack"
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={packId}
                onChange={(e) => setPackId(e.target.value)}
                disabled={loading || monitor.monitoring || monitor.starting}
              >
                {packs.map((id) => (
                  <option key={id} value={id}>
                    {PACK_LABEL_KEYS[id] ? t(PACK_LABEL_KEYS[id]) : id}
                  </option>
                ))}
              </select>
            </div>
            <CommandHint hint={t("networkProbe.cmd.sitesProbe", { packId })}>
              <Button
                type="button"
                disabled={loading || monitor.monitoring || !packId || !toolEnabled}
                onClick={() => onRunPack(packId)}
              >
                {loading ? t("networkProbe.sites.running") : t("networkProbe.sites.run")}
              </Button>
            </CommandHint>
            {canCancel ? (
              <NetworkProbeCancelButton
                label={t("networkProbe.sites.cancel")}
                cancelling={cancelling}
                onCancel={onCancel}
              />
            ) : null}
          </div>

          <div className="space-y-2 rounded-lg border px-3 py-2">
            <p className="text-xs font-medium">{t("networkProbe.sites.customTitle")}</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1 space-y-1">
                <label className="text-xs font-medium" htmlFor="np-sites-custom">
                  {t("networkProbe.sites.customInput")}
                </label>
                <Input
                  id="np-sites-custom"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t("networkProbe.sites.customPlaceholder")}
                  autoComplete="off"
                  aria-invalid={customTargetTooLong}
                  aria-describedby={customTargetTooLong ? "np-sites-custom-error" : undefined}
                  disabled={loading || monitor.monitoring || monitor.starting}
                />
                {customTargetTooLong ? (
                  <p id="np-sites-custom-error" role="alert" className="text-destructive text-xs">
                    {t("networkProbe.sites.customTargetTooLong", {
                      maxBytes: MAX_CUSTOM_SITE_BYTES,
                    })}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  loading ||
                  monitor.monitoring ||
                  monitor.starting ||
                  !draft.trim() ||
                  customTargetTooLong ||
                  customSitesFull
                }
                onClick={addCustom}
              >
                {t("networkProbe.sites.customAdd")}
              </Button>
              <CommandHint hint={t("networkProbe.cmd.sitesProbeCustom", { n: customSites.length })}>
                <Button
                  type="button"
                  disabled={
                    loading || monitor.monitoring || customSites.length === 0 || !toolEnabled
                  }
                  onClick={() => onRunCustom(customSites)}
                >
                  {t("networkProbe.sites.customRun")}
                </Button>
              </CommandHint>
            </div>
            {customSitesFull ? (
              <p role="status" className="text-muted-foreground text-xs">
                {t("networkProbe.sites.customSiteLimitReached", { max: MAX_CUSTOM_SITES })}
              </p>
            ) : null}
            {customSites.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {customSites.map((site) => (
                  <li
                    key={site}
                    className="bg-muted flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px]"
                  >
                    <span className="max-w-[14rem] truncate">{site}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      disabled={loading || monitor.monitoring || monitor.starting}
                      onClick={() => removeCustom(site)}
                      aria-label={t("networkProbe.sites.customRemove")}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-xs">{t("networkProbe.sites.customEmpty")}</p>
            )}

            <div className="space-y-2 border-t pt-2">
              <div>
                <p className="text-xs font-medium">{t("networkProbe.siteMonitor.title")}</p>
                <p className="text-muted-foreground text-xs">
                  {t("networkProbe.siteMonitor.hint", { interval: 60, max: 3 })}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("networkProbe.siteMonitor.thresholdHint")}
                </p>
              </div>
              {customSites.length > 0 ? (
                <fieldset
                  disabled={loading || monitor.monitoring || monitor.starting || !toolEnabled}
                  className="flex flex-col gap-1"
                >
                  <legend className="sr-only">{t("networkProbe.siteMonitor.selectTargets")}</legend>
                  {customSites.map((site) => (
                    <label key={site} className="flex min-w-0 items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={monitorTargets.includes(site)}
                        disabled={!monitorTargets.includes(site) && monitorTargets.length >= 3}
                        onChange={() => toggleMonitorTarget(site)}
                      />
                      <span className="truncate font-mono">{site}</span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {t("networkProbe.siteMonitor.noTargets")}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {monitor.monitoring ? (
                  <Button type="button" variant="secondary" onClick={monitor.stop}>
                    {t("networkProbe.siteMonitor.stop")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={
                      loading || !toolEnabled || monitorTargets.length === 0 || monitor.starting
                    }
                    onClick={() => void monitor.start(monitorTargets)}
                  >
                    {monitor.starting
                      ? t("networkProbe.siteMonitor.starting")
                      : t("networkProbe.siteMonitor.start")}
                  </Button>
                )}
                <span
                  className="text-muted-foreground text-xs"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {monitor.monitoring
                    ? monitor.paused
                      ? t("networkProbe.siteMonitor.paused")
                      : monitor.checking
                        ? t("networkProbe.siteMonitor.checking")
                        : t("networkProbe.siteMonitor.active")
                    : t("networkProbe.siteMonitor.off")}
                </span>
              </div>
              {monitorError ? (
                <p role="alert" className="text-destructive text-xs">
                  {monitorError}
                </p>
              ) : null}
              {monitor.lastCheckedAt ? (
                <p className="text-muted-foreground text-xs">
                  {t("networkProbe.siteMonitor.lastChecked", {
                    time: new Date(monitor.lastCheckedAt).toLocaleTimeString(
                      i18n.resolvedLanguage ?? i18n.language,
                    ),
                  })}
                </p>
              ) : null}
              {monitor.samples.length > 0 ? (
                <ul className="space-y-1 text-xs">
                  {monitor.samples.map((sample) => {
                    const latency = sample.icmpRttMs ?? sample.httpTtfbMs
                    return (
                      <li key={sample.id} className="flex flex-wrap justify-between gap-1">
                        <span className="min-w-0 truncate font-mono">{sample.target}</span>
                        <span
                          className={
                            sample.ok
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-destructive"
                          }
                        >
                          {sample.ok
                            ? latency != null
                              ? t("networkProbe.siteMonitor.reachableMs", {
                                  ms: latency.toFixed(0),
                                })
                              : t("networkProbe.siteMonitor.reachable")
                            : t("networkProbe.siteMonitor.unreachable")}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          </div>
        </>
      }
    >
      {rows.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {t("networkProbe.sites.resultTitle", {
              packId: result?.packId ?? packId,
            })}
            {result?.cancelled ? (
              <span className="text-muted-foreground ml-2 text-xs">
                {t("networkProbe.sites.cancelled")}
              </span>
            ) : null}
          </p>
          <ul className="divide-border divide-y rounded-lg border text-sm">
            {rows.map((row) => (
              <li
                key={row.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 px-3 py-2",
                  row.ok ? "bg-background" : "bg-destructive/5",
                )}
              >
                <div className="min-w-0">
                  <div className="font-medium">{row.id}</div>
                  <div className="text-muted-foreground truncate font-mono text-xs">
                    {row.target} · {row.channel}
                    {row.degraded ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        {" "}
                        · {t("networkProbe.sites.degraded")}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Sparkline values={sparklines[row.id] ?? []} />
                  <div className="text-right text-xs">
                    {row.ok ? (
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {[
                          row.icmpRttMs != null
                            ? t("networkProbe.sites.icmpMs", { ms: row.icmpRttMs.toFixed(1) })
                            : null,
                          row.httpTtfbMs != null
                            ? t("networkProbe.sites.httpMs", {
                                status: row.httpStatus ?? "—",
                                ms: row.httpTtfbMs.toFixed(0),
                              })
                            : null,
                          row.downloadMbps != null
                            ? t("networkProbe.sites.mbps", { mbps: row.downloadMbps.toFixed(1) })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : (
                      <span className="text-destructive">
                        {t("networkProbe.sites.fail", { error: row.error ?? "—" })}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {result?.commandHint ? (
            <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
          ) : null}
        </div>
      ) : result?.cancelled ? (
        <p role="status" className="text-muted-foreground text-sm">
          {t("networkProbe.sites.cancelled")}
        </p>
      ) : null}
    </ProbePanelShell>
  )
}
