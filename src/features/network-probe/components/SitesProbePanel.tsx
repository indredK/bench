/**
 * Feature UI / 功能界面: site latency board for basic L1.
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SiteSampleResult, SitesProbeResult } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

const PACK_LABEL_KEYS: Record<string, string> = {
  global: "networkProbe.sites.packs.global",
  "cn-friendly": "networkProbe.sites.packs.cn-friendly",
  dev: "networkProbe.sites.packs.dev",
}

const CUSTOM_SITES_KEY = "network-probe:custom-sites"

interface SitesProbePanelProps {
  loading: boolean
  canCancel: boolean
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
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : []
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
  const { t } = useTranslation()
  const defaultPack = packIds.includes("cn-friendly") ? "cn-friendly" : (packIds[0] ?? "global")
  const [packId, setPackId] = useState(defaultPack)
  const [customSites, setCustomSites] = useState<string[]>(loadCustomSites)
  const [draft, setDraft] = useState("")

  useEffect(() => {
    persistCustomSites(customSites)
  }, [customSites])

  const packs = useMemo(() => (packIds.length > 0 ? packIds : ["global"]), [packIds])
  const rows = result?.results?.length ? result.results : streaming

  const addCustom = () => {
    const value = draft.trim()
    if (!value) return
    if (customSites.includes(value)) {
      setDraft("")
      return
    }
    setCustomSites((prev) => [...prev, value].slice(0, 24))
    setDraft("")
  }

  return (
    <div className="space-y-4">
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
            disabled={loading}
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
            disabled={loading || !packId || !toolEnabled}
            onClick={() => onRunPack(packId)}
          >
            {loading ? t("networkProbe.sites.running") : t("networkProbe.sites.run")}
          </Button>
        </CommandHint>
        {canCancel ? (
          <CommandHint hint={t("networkProbe.cmd.cancelScan")}>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("networkProbe.sites.cancel")}
            </Button>
          </CommandHint>
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
              disabled={loading}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={loading || !draft.trim()}
            onClick={addCustom}
          >
            {t("networkProbe.sites.customAdd")}
          </Button>
          <CommandHint hint={t("networkProbe.cmd.sitesProbeCustom", { n: customSites.length })}>
            <Button
              type="button"
              disabled={loading || customSites.length === 0 || !toolEnabled}
              onClick={() => onRunCustom(customSites)}
            >
              {t("networkProbe.sites.customRun")}
            </Button>
          </CommandHint>
        </div>
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
                  disabled={loading}
                  onClick={() => setCustomSites((prev) => prev.filter((s) => s !== site))}
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
      </div>

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
      ) : null}
    </div>
  )
}
