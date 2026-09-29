/**
 * Feature UI / 功能界面: TCP connect port scan (degraded).
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VirtualList } from "@/components/content/VirtualList"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type {
  NetworkFingerprintResult,
  PortSampleEvent,
  PortScanResult,
  ServiceFingerprint,
} from "@/lib/tauri/types/network-probe"

interface PortScanPanelProps {
  loading: boolean
  canCancel: boolean
  result: PortScanResult | null
  streaming: PortSampleEvent[]
  fingerprintResult: NetworkFingerprintResult | null
  fingerprintAvailable: boolean
  nmapStatus?: string
  toolEnabled: boolean
  toolStatus?: string
  onRun: (target: string, ports: string) => void
  onFingerprint: (target: string, ports: string, includeOs: boolean) => void
  onCancel: () => void
}

function isPrivateOrLocal(host: string): boolean {
  const h = host.trim().toLowerCase()
  if (h === "localhost" || h === "::1") return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 10 || a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  return false
}

function estimatePortCount(spec: string): number {
  let n = 0
  for (const part of spec.split(/[,\s]+/)) {
    const p = part.trim()
    if (!p) continue
    if (p.includes("-")) {
      const [a, b] = p.split("-")
      const start = Number(a)
      const end = Number(b)
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        n += end - start + 1
      }
    } else if (Number.isFinite(Number(p))) {
      n += 1
    }
  }
  return n
}

function formatPortSample(sample: PortSampleEvent): string {
  return `${sample.port}: ${sample.state}${sample.serviceHint ? ` (${sample.serviceHint})` : ""}${sample.rttMs != null ? ` · ${sample.rttMs.toFixed(0)} ms` : ""}`
}

function formatFingerprintService(service: ServiceFingerprint): string {
  return [
    `${service.port}/${service.protocol}`,
    service.name,
    service.product,
    service.version,
    service.extraInfo,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function PortScanPanel({
  loading,
  canCancel,
  result,
  streaming,
  fingerprintResult,
  fingerprintAvailable,
  nmapStatus,
  toolEnabled,
  toolStatus,
  onRun,
  onFingerprint,
  onCancel,
}: PortScanPanelProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState("127.0.0.1")
  const [ports, setPorts] = useState("22,80,443,8080")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [fingerprintConfirmOpen, setFingerprintConfirmOpen] = useState(false)
  const [includeOs, setIncludeOs] = useState(false)

  const samples = result?.samples?.length ? result.samples : streaming
  const open = result?.openPorts?.length
    ? result.openPorts
    : samples.filter((s) => s.state === "open").map((s) => s.port)
  const statusMessageKey = result?.cancelled
    ? "networkProbe.ports.cancelledResult"
    : result?.mode === "nmap-syn-or-connect"
      ? "networkProbe.ports.nmapModeHint"
      : result?.mode === "tcp-connect"
        ? "networkProbe.ports.degradedHint"
        : null

  const portCount = useMemo(() => estimatePortCount(ports), [ports])
  const needsConfirm = useMemo(() => {
    const host = target.trim()
    if (!host) return false
    return !isPrivateOrLocal(host) || portCount > 64
  }, [target, portCount])

  const start = () => {
    if (needsConfirm) {
      setConfirmOpen(true)
      return
    }
    onRun(target.trim(), ports.trim())
  }

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.ports.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "portScan",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : !result && toolStatus === "degraded" ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.ports.degradedHint")}
            </p>
          ) : statusMessageKey ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{t(statusMessageKey)}</p>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-ports-target">
                {t("networkProbe.ports.target")}
              </label>
              <Input
                id="np-ports-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                autoComplete="off"
                disabled={loading}
              />
            </div>
            <div className="min-w-[12rem] flex-1 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-ports-range">
                {t("networkProbe.ports.range")}
              </label>
              <Input
                id="np-ports-range"
                value={ports}
                onChange={(e) => setPorts(e.target.value)}
                autoComplete="off"
                disabled={loading}
              />
            </div>
            <CommandHint
              hint={t("networkProbe.cmd.scanPorts", {
                target: target.trim() || "…",
                ports: ports.trim() || "…",
              })}
            >
              <Button
                type="button"
                disabled={loading || !toolEnabled || !target.trim() || !ports.trim()}
                onClick={start}
              >
                {loading ? t("networkProbe.ports.running") : t("networkProbe.ports.run")}
              </Button>
            </CommandHint>
            {canCancel ? (
              <CommandHint hint={t("networkProbe.cmd.cancelScan")}>
                <Button type="button" variant="outline" onClick={onCancel}>
                  {t("networkProbe.ports.cancel")}
                </Button>
              </CommandHint>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label className="flex min-h-8 items-center gap-2 text-xs">
              <input
                type="checkbox"
                aria-label={t("networkProbe.ports.includeOs")}
                checked={includeOs}
                onChange={(event) => setIncludeOs(event.target.checked)}
                disabled={loading || !fingerprintAvailable}
              />
              <span>{t("networkProbe.ports.includeOs")}</span>
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={
                loading ||
                !fingerprintAvailable ||
                !target.trim() ||
                !ports.trim() ||
                portCount < 1 ||
                portCount > 64
              }
              onClick={() => setFingerprintConfirmOpen(true)}
            >
              {loading
                ? t("networkProbe.ports.fingerprintRunning")
                : t("networkProbe.ports.fingerprintRun")}
            </Button>
            {!fingerprintAvailable ? (
              <p className="text-muted-foreground text-xs">
                {nmapStatus === "not_found"
                  ? t("networkProbe.ports.nmapRequired")
                  : t("networkProbe.ports.fingerprintUnsupported")}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {t("networkProbe.ports.fingerprintHint")}
              </p>
            )}
          </div>
        </>
      }
    >
      {open.length > 0 ? (
        <p className="text-sm font-medium">
          {t("networkProbe.ports.openList", { ports: open.join(", ") })}
        </p>
      ) : null}
      {samples.length > 0 ? (
        <VirtualList
          items={samples}
          getItemKey={(sample) => `${sample.port}-${sample.state}`}
          getItemLabel={formatPortSample}
          renderItem={formatPortSample}
          className="text-muted-foreground font-mono text-xs"
        />
      ) : null}
      {fingerprintResult ? (
        <section className="space-y-2 border-t pt-3" aria-live="polite">
          <h3 className="text-sm font-semibold">
            {t("networkProbe.ports.fingerprintResults", { target: fingerprintResult.target })}
          </h3>
          {fingerprintResult.cancelled ? (
            <p className="text-muted-foreground text-sm">
              {t("networkProbe.ports.fingerprintCancelled")}
            </p>
          ) : null}
          {fingerprintResult.services.length > 0 ? (
            <ul className="space-y-2">
              {fingerprintResult.services.map((service) => (
                <li
                  className="min-w-0 space-y-1 rounded-md border p-2 text-sm"
                  key={`${service.protocol}-${service.port}`}
                >
                  <p className="font-mono text-xs break-words">
                    {formatFingerprintService(service)}
                    {service.confidence != null ? ` · ${service.confidence}%` : ""}
                  </p>
                  {service.riskTags.length > 0 ? (
                    <ul className="flex flex-wrap gap-1">
                      {service.riskTags.map((tag) => (
                        <li
                          className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                          key={tag}
                        >
                          {t(
                            tag === "cleartext-protocol"
                              ? "networkProbe.ports.risks.cleartext"
                              : tag === "remote-admin-service"
                                ? "networkProbe.ports.risks.remoteAdmin"
                                : "networkProbe.ports.risks.database",
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : !fingerprintResult.cancelled ? (
            <p className="text-muted-foreground text-sm">
              {t("networkProbe.ports.fingerprintNoServices")}
            </p>
          ) : null}
          {fingerprintResult.osStatus !== "not-requested" ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t(
                  {
                    detected: "networkProbe.ports.osStatus.detected",
                    "not-detected": "networkProbe.ports.osStatus.not-detected",
                    "permission-required": "networkProbe.ports.osStatus.permission-required",
                    unavailable: "networkProbe.ports.osStatus.unavailable",
                    cancelled: "networkProbe.ports.osStatus.cancelled",
                    "not-requested": "networkProbe.ports.osStatus.not-requested",
                  }[fingerprintResult.osStatus],
                )}
              </p>
              {fingerprintResult.osMatches.map((match, index) => (
                <div
                  className="text-muted-foreground text-xs break-words"
                  key={`${match.name}-${index}`}
                >
                  <p>
                    {t("networkProbe.ports.osMatch", {
                      name: match.name,
                      accuracy: match.accuracy,
                    })}
                  </p>
                  {match.classes.length > 0 ? <p>{match.classes.join(" · ")}</p> : null}
                </div>
              ))}
              <p className="text-muted-foreground text-xs">
                {t("networkProbe.ports.osGuessDisclaimer")}
              </p>
            </div>
          ) : null}
          <p className="text-muted-foreground font-mono text-xs break-words whitespace-pre-wrap">
            {fingerprintResult.commandHint}
          </p>
        </section>
      ) : null}
      {result?.commandHint ? (
        <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
      ) : null}

      <DestructiveConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("networkProbe.ports.confirmTitle")}
        description={t("networkProbe.ports.confirmDesc", {
          target: target.trim(),
          count: portCount,
        })}
        consequence={t("networkProbe.ports.confirmConsequence")}
        confirmLabel={t("networkProbe.ports.confirmRun")}
        cancelLabel={t("networkProbe.ports.cancel")}
        loading={loading}
        onConfirm={() => {
          setConfirmOpen(false)
          onRun(target.trim(), ports.trim())
        }}
      />
      <DestructiveConfirmDialog
        open={fingerprintConfirmOpen}
        onOpenChange={setFingerprintConfirmOpen}
        title={t("networkProbe.ports.fingerprintConfirmTitle")}
        description={t("networkProbe.ports.fingerprintConfirmDesc", {
          target: target.trim(),
          ports: ports.trim(),
          includeOs: includeOs
            ? t("networkProbe.ports.fingerprintOsIncluded")
            : t("networkProbe.ports.fingerprintOsSkipped"),
        })}
        consequence={t("networkProbe.ports.fingerprintConfirmConsequence")}
        confirmLabel={t("networkProbe.ports.fingerprintConfirmRun")}
        cancelLabel={t("networkProbe.ports.cancel")}
        loading={loading}
        onConfirm={() => {
          setFingerprintConfirmOpen(false)
          onFingerprint(target.trim(), ports.trim(), includeOs)
        }}
      />
    </ProbePanelShell>
  )
}
