/**
 * Feature UI / 功能界面: Test L1 · official website reachability cards.
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type {
  SitePreset,
  SiteSampleResult,
  SitesProbeResult,
} from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

const OFFICIAL_PACK_ID = "official"

interface OfficialSitesPanelProps {
  loading: boolean
  canCancel: boolean
  presets: SitePreset[]
  result: SitesProbeResult | null
  streaming: SiteSampleResult[]
  toolEnabled: boolean
  toolStatus?: string
  onTestAll: () => void
  onTestOne: (target: string) => void
  onCancel: () => void
}

type CardSample = SiteSampleResult & {
  testedAt: number
  fingerprint: string
}

function hostOf(target: string): string {
  try {
    if (target.startsWith("http://") || target.startsWith("https://")) {
      return new URL(target).host
    }
  } catch {
    // fall through
  }
  return target
}

function targetKey(target: string): string {
  return target.trim()
}

function fingerprintOf(row: SiteSampleResult): string {
  return [
    row.id,
    row.ok ? "1" : "0",
    row.httpStatus ?? "",
    row.httpTtfbMs ?? "",
    row.icmpRttMs ?? "",
    row.error ?? "",
    row.degraded ? "1" : "0",
  ].join("|")
}

export function OfficialSitesPanel({
  loading,
  canCancel,
  presets,
  result,
  streaming,
  toolEnabled,
  toolStatus,
  onTestAll,
  onTestOne,
  onCancel,
}: OfficialSitesPanelProps) {
  const { t, i18n } = useTranslation()
  const [samplesByTarget, setSamplesByTarget] = useState<Record<string, CardSample>>({})
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)

  // Merge streaming / final results by target so single-card runs keep prior results.
  useEffect(() => {
    const incoming = [...streaming, ...(result?.results ?? [])]
    if (incoming.length === 0) return

    setSamplesByTarget((prev) => {
      let changed = false
      const next = { ...prev }
      const now = Date.now()
      for (const row of incoming) {
        const key = targetKey(row.target)
        if (!key) continue
        const fingerprint = fingerprintOf(row)
        if (next[key]?.fingerprint === fingerprint) continue
        next[key] = { ...row, testedAt: now, fingerprint }
        changed = true
      }
      return changed ? next : prev
    })
  }, [streaming, result])

  useEffect(() => {
    if (!loading) setPendingTarget(null)
  }, [loading])

  const okCount = presets.filter((p) => samplesByTarget[targetKey(p.target)]?.ok).length
  const failCount = presets.filter((p) => {
    const sample = samplesByTarget[targetKey(p.target)]
    return sample && !sample.ok
  }).length

  const formatTestedAt = (ms: number) =>
    new Date(ms).toLocaleTimeString(i18n.language, {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })

  const handleTestAll = () => {
    setPendingTarget(null)
    onTestAll()
  }

  const handleTestOne = (target: string) => {
    setPendingTarget(targetKey(target))
    onTestOne(target)
  }

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.official.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "sitesProbe",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <CommandHint hint={t("networkProbe.cmd.sitesProbe", { packId: OFFICIAL_PACK_ID })}>
              <Button type="button" disabled={loading || !toolEnabled} onClick={handleTestAll}>
                {loading && !pendingTarget
                  ? t("networkProbe.official.running")
                  : t("networkProbe.official.testAll")}
              </Button>
            </CommandHint>
            {canCancel ? (
              <CommandHint hint={t("networkProbe.cmd.cancelScan")}>
                <Button type="button" variant="outline" onClick={onCancel}>
                  {t("common.cancel")}
                </Button>
              </CommandHint>
            ) : null}
            {presets.length > 0 ? (
              <span className="text-muted-foreground text-xs">
                {t("networkProbe.official.summary", {
                  total: presets.length,
                  ok: okCount,
                  fail: failCount,
                })}
              </span>
            ) : null}
          </div>
        </>
      }
    >
      {presets.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("networkProbe.official.empty")}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {presets.map((site) => {
            const key = targetKey(site.target)
            const sample = samplesByTarget[key]
            const label = t(`networkProbe.official.sites.${site.id}`, {
              defaultValue: site.id,
            })
            const host = hostOf(site.target)
            const isPending = loading && pendingTarget === key
            const latency =
              sample?.httpTtfbMs != null
                ? t("networkProbe.official.httpMs", { ms: sample.httpTtfbMs.toFixed(0) })
                : sample?.icmpRttMs != null
                  ? t("networkProbe.official.icmpMs", { ms: sample.icmpRttMs.toFixed(0) })
                  : null
            const status = isPending ? "running" : !sample ? "idle" : sample.ok ? "ok" : "fail"

            return (
              <button
                key={site.id}
                type="button"
                disabled={loading || !toolEnabled}
                title={t("networkProbe.official.cardHint", { host })}
                onClick={() => handleTestOne(site.target)}
                className={cn(
                  "relative flex min-h-[4.75rem] flex-col rounded-md border px-3 pt-2.5 pb-7 text-left transition-colors",
                  "hover:bg-muted/60 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  (loading || !toolEnabled) && "cursor-not-allowed",
                  !toolEnabled && "opacity-60",
                  status === "ok" && "border-emerald-500/40 bg-emerald-500/5",
                  status === "fail" && "border-destructive/40 bg-destructive/5",
                  status === "running" && "border-primary/40 bg-primary/5",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{label}</div>
                    <div className="text-muted-foreground truncate font-mono text-[11px]">
                      {host}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                      status === "ok" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                      status === "fail" && "bg-destructive/15 text-destructive",
                      status === "idle" && "bg-muted text-muted-foreground",
                      status === "running" && "bg-primary/15 text-primary",
                    )}
                  >
                    {status === "ok"
                      ? t("networkProbe.official.statusOk")
                      : status === "fail"
                        ? t("networkProbe.official.statusFail")
                        : status === "running"
                          ? t("networkProbe.official.statusRunning")
                          : t("networkProbe.official.statusIdle")}
                  </span>
                </div>
                <div className="text-muted-foreground absolute inset-x-3 bottom-2 flex items-end justify-between gap-2 font-mono text-[11px]">
                  <span className="min-w-0 truncate">
                    {isPending
                      ? t("networkProbe.official.running")
                      : sample?.error && !latency
                        ? t("networkProbe.official.fail", { error: sample.error })
                        : sample
                          ? t("networkProbe.official.testedAt", {
                              time: formatTestedAt(sample.testedAt),
                            })
                          : t("networkProbe.official.clickToTest")}
                  </span>
                  <span className="shrink-0 tabular-nums">{isPending ? "" : (latency ?? "")}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {result?.cancelled ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("networkProbe.official.cancelled")}
        </p>
      ) : null}
    </ProbePanelShell>
  )
}

export { OFFICIAL_PACK_ID }
