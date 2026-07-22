/**
 * Feature UI / 功能界面: LibreSpeed bandwidth panel for test L1.
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  SpeedSampleEvent,
  SpeedSource,
  SpeedTestResult,
} from "@/lib/tauri/types/network-probe"

interface SpeedPanelProps {
  loading: boolean
  canCancel: boolean
  sources: SpeedSource[]
  result: SpeedTestResult | null
  sample: SpeedSampleEvent | null
  cooldownUntil: number | null
  toolEnabled: boolean
  toolStatus?: string
  onLoadSources: () => void
  onRun: (sourceId: string) => void
  onCancel: () => void
}

export function SpeedPanel({
  loading,
  canCancel,
  sources,
  result,
  sample,
  cooldownUntil,
  toolEnabled,
  toolStatus,
  onLoadSources,
  onRun,
  onCancel,
}: SpeedPanelProps) {
  const { t } = useTranslation()
  const [sourceId, setSourceId] = useState("")
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    onLoadSources()
  }, [onLoadSources])

  useEffect(() => {
    if (!sourceId && sources.length > 0) {
      setSourceId(sources[0].id)
    }
  }, [sources, sourceId])

  useEffect(() => {
    if (cooldownUntil == null || cooldownUntil <= Date.now()) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [cooldownUntil])

  const cooldownSec =
    cooldownUntil != null && cooldownUntil > now ? Math.ceil((cooldownUntil - now) / 1000) : 0
  const coolingDown = cooldownSec > 0

  const phaseLabel =
    sample?.phase != null
      ? t(`networkProbe.speed.phase.${sample.phase}`, {
          defaultValue: sample.phase,
        })
      : null

  const unavailable =
    result != null && !result.ok && !result.cancelled && result.downloadMbps == null

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("networkProbe.speed.hint")}</p>
      {!toolEnabled ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("networkProbe.caps.toolDisabled", {
            tool: "speedTest",
            status: toolStatus ?? "unsupported",
          })}
        </p>
      ) : null}
      {sources.length === 0 && !loading ? (
        <p className="text-muted-foreground text-sm">{t("networkProbe.speed.emptySources")}</p>
      ) : null}
      {coolingDown ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("networkProbe.speed.cooldown", { seconds: cooldownSec })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1 space-y-1">
          <label className="text-xs font-medium" htmlFor="np-speed-source">
            {t("networkProbe.speed.source")}
          </label>
          <Select
            value={sourceId || undefined}
            onValueChange={setSourceId}
            disabled={loading || coolingDown}
          >
            <SelectTrigger id="np-speed-source">
              <SelectValue placeholder={t("networkProbe.speed.sourcePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CommandHint hint={t("networkProbe.cmd.speedTest", { sourceId: sourceId || "…" })}>
          <Button
            type="button"
            disabled={loading || coolingDown || !toolEnabled || !sourceId}
            onClick={() => onRun(sourceId)}
          >
            {loading ? t("networkProbe.speed.running") : t("networkProbe.speed.run")}
          </Button>
        </CommandHint>
        {canCancel ? (
          <CommandHint hint={t("networkProbe.cmd.cancelScan")}>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("networkProbe.speed.cancel")}
            </Button>
          </CommandHint>
        ) : null}
      </div>
      {loading && sample ? (
        <p className="text-muted-foreground font-mono text-xs">
          {phaseLabel}
          {sample.detail === "sample" || sample.detail === "done"
            ? ` · ${sample.value.toFixed(1)}`
            : sample.detail
              ? ` · ${sample.detail}`
              : null}
        </p>
      ) : null}
      {result ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2 text-sm">
          <div className="font-medium">
            {result.sourceName}
            {result.cancelled ? (
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                ({t("networkProbe.speed.cancelled")})
              </span>
            ) : null}
          </div>
          {unavailable ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.speed.sourceUnavailable")}
            </p>
          ) : null}
          {result.message ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{result.message}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric
              label={t("networkProbe.speed.ping")}
              value={result.pingMs != null ? `${result.pingMs.toFixed(1)} ms` : "—"}
            />
            <Metric
              label={t("networkProbe.speed.jitter")}
              value={result.jitterMs != null ? `${result.jitterMs.toFixed(1)} ms` : "—"}
            />
            <Metric
              label={t("networkProbe.speed.download")}
              value={result.downloadMbps != null ? `${result.downloadMbps.toFixed(1)} Mbps` : "—"}
            />
            <Metric
              label={t("networkProbe.speed.upload")}
              value={result.uploadMbps != null ? `${result.uploadMbps.toFixed(1)} Mbps` : "—"}
            />
          </div>
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-mono font-medium">{value}</div>
    </div>
  )
}
