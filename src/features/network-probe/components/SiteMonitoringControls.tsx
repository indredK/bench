import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SITE_MONITOR_INTERVALS_SECONDS,
  SITE_MONITOR_MAX_THRESHOLD_MS,
  SITE_MONITOR_MIN_THRESHOLD_MS,
} from "@/features/network-probe/hooks/useSitesMonitoring"

interface SiteMonitoringControlsProps {
  scopeText: string
  disabled: boolean
  monitoring: boolean
  intervalSeconds: number
  onIntervalChange: (seconds: number) => void
  thresholdInput: string
  onThresholdChange: (value: string) => void
  thresholdValid: boolean
  alertTargets: string[]
  lastProbeFailed: boolean
  onStart: () => void
  onStop: () => void
}

export function SiteMonitoringControls({
  scopeText,
  disabled,
  monitoring,
  intervalSeconds,
  onIntervalChange,
  thresholdInput,
  onThresholdChange,
  thresholdValid,
  alertTargets,
  lastProbeFailed,
  onStart,
  onStop,
}: SiteMonitoringControlsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2 rounded-lg border px-3 py-2">
      <p className="text-xs font-medium">{scopeText}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-36 space-y-1">
          <label className="text-xs font-medium" htmlFor="np-monitor-interval">
            {t("networkProbe.sites.monitor.interval")}
          </label>
          <select
            id="np-monitor-interval"
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            value={intervalSeconds}
            onChange={(event) => onIntervalChange(Number(event.target.value))}
            disabled={disabled || monitoring}
          >
            {SITE_MONITOR_INTERVALS_SECONDS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {t("networkProbe.sites.monitor.seconds", { count: seconds })}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32 space-y-1">
          <label className="text-xs font-medium" htmlFor="np-monitor-threshold">
            {t("networkProbe.sites.monitor.threshold")}
          </label>
          <Input
            id="np-monitor-threshold"
            type="number"
            min={SITE_MONITOR_MIN_THRESHOLD_MS}
            max={SITE_MONITOR_MAX_THRESHOLD_MS}
            step={10}
            value={thresholdInput}
            onChange={(event) => onThresholdChange(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled || monitoring}
            aria-invalid={!thresholdValid}
          />
        </div>
        <Button
          type="button"
          variant={monitoring ? "outline" : "secondary"}
          disabled={!monitoring && (disabled || !thresholdValid)}
          onClick={() => (monitoring ? onStop() : onStart())}
        >
          {monitoring
            ? t("networkProbe.sites.monitor.stop")
            : t("networkProbe.sites.monitor.start")}
        </Button>
        {!monitoring && !thresholdValid ? (
          <span className="text-destructive text-xs" role="status">
            {t("networkProbe.sites.monitor.thresholdRange", {
              min: SITE_MONITOR_MIN_THRESHOLD_MS,
              max: SITE_MONITOR_MAX_THRESHOLD_MS,
            })}
          </span>
        ) : null}
      </div>
      {monitoring ? (
        <div className="text-muted-foreground space-y-1 text-xs" role="status" aria-live="polite">
          <p>
            {t("networkProbe.sites.monitor.running", {
              seconds: intervalSeconds,
              threshold: thresholdInput,
            })}
          </p>
          <p>{t("networkProbe.sites.monitor.foregroundOnly")}</p>
        </div>
      ) : null}
      {monitoring && lastProbeFailed ? (
        <p className="text-xs text-amber-700 dark:text-amber-400" role="alert">
          {t("networkProbe.sites.monitor.probeFailed")}
        </p>
      ) : null}
      {monitoring && alertTargets.length > 0 ? (
        <div
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-2.5 py-2 text-xs"
          role="alert"
        >
          <p className="font-medium">
            {t("networkProbe.sites.monitor.alert", {
              count: alertTargets.length,
              threshold: thresholdInput,
            })}
          </p>
          <ul className="mt-1 max-h-20 space-y-0.5 overflow-auto font-mono">
            {alertTargets.map((target) => (
              <li key={target} className="truncate">
                {target}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
