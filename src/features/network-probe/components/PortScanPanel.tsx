/**
 * Feature UI / 功能界面: single-host TCP port scanning.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import ipaddr from "ipaddr.js"
import { CommandHint } from "@/components/common/CommandHint"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { VirtualizedResultList } from "@/features/network-probe/components/VirtualizedResultList"
import type {
  PortRiskTag,
  PortSampleEvent,
  PortScanResult,
  PortServiceFingerprint,
} from "@/lib/tauri/types/network-probe"

const PORT_STATE_LABELS = {
  open: "networkProbe.ports.states.open",
  closed: "networkProbe.ports.states.closed",
  filtered: "networkProbe.ports.states.filtered",
  error: "networkProbe.ports.states.error",
} as const

const OPEN_PORT_SUMMARY_LIMIT = 16
const MAX_PORTS = 256
const PROBE_INTERVAL_MS = 50
const DEFAULT_TCP_TIMEOUT_MS = 800
const MAX_CONCURRENT_PROBES = 32
const NMAP_HOST_TIMEOUT_SECONDS = 30

const RISK_TAG_LABELS: Record<PortRiskTag, string> = {
  remote_admin: "networkProbe.ports.riskTags.remoteAdmin",
  file_sharing: "networkProbe.ports.riskTags.fileSharing",
  database: "networkProbe.ports.riskTags.database",
  plaintext_protocol: "networkProbe.ports.riskTags.plaintextProtocol",
}

interface PortScanPanelProps {
  loading: boolean
  canCancel: boolean
  result: PortScanResult | null
  streaming: PortSampleEvent[]
  toolEnabled: boolean
  toolStatus?: string
  fingerprintStatus?: string
  onRun: (target: string, ports: string, fingerprint: boolean, highRiskConfirmed: boolean) => void
  onCancel: () => void
}

function isPrivateOrLocal(host: string): boolean {
  const h = host.trim().toLowerCase()
  if (h === "localhost" || h === "::1") return true
  if (ipaddr.IPv4.isValid(h) && ipaddr.IPv4.isValidFourPartDecimal(h)) {
    return ["private", "loopback", "linkLocal"].includes(ipaddr.IPv4.parse(h).range())
  }
  if (ipaddr.IPv6.isValid(h)) {
    return ["loopback", "uniqueLocal", "linkLocal"].includes(ipaddr.IPv6.parse(h).range())
  }
  return false
}

function hasUnsupportedMultiHostSyntax(host: string): boolean {
  if (/[\/,*!?]/.test(host)) return true
  const octets = host.split(".")
  return (
    octets.length === 4 &&
    octets.some((octet) => octet.includes("-")) &&
    octets.every((octet) => /^\d+(?:-\d+)?$/.test(octet))
  )
}

function estimatePortCount(spec: string): number | null {
  const ports = new Set<number>()
  let expandedCount = 0
  const parts = spec.trim().split(/[ ,]+/)
  if (!spec.trim() || parts.some((part) => part.length === 0)) return null

  for (const part of parts) {
    const range = /^(\d+)-(\d+)$/.exec(part)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 1 ||
        end > 65535 ||
        start > end ||
        end - start + 1 > MAX_PORTS
      ) {
        return null
      }
      expandedCount += end - start + 1
      if (expandedCount > MAX_PORTS) return null
      for (let port = start; port <= end; port += 1) ports.add(port)
      continue
    }

    if (!/^\d+$/.test(part)) return null
    const port = Number(part)
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return null
    expandedCount += 1
    if (expandedCount > MAX_PORTS) return null
    ports.add(port)
  }

  return ports.size > 0 ? ports.size : null
}

export function PortScanPanel({
  loading,
  canCancel,
  result,
  streaming,
  toolEnabled,
  toolStatus,
  fingerprintStatus,
  onRun,
  onCancel,
}: PortScanPanelProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState("127.0.0.1")
  const [ports, setPorts] = useState("22,80,443,8080")
  const [fingerprint, setFingerprint] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const samples = result?.samples?.length ? result.samples : streaming
  const open = result?.openPorts?.length
    ? result.openPorts
    : samples.filter((s) => s.state === "open").map((s) => s.port)
  const visibleOpenPorts = open.slice(0, OPEN_PORT_SUMMARY_LIMIT)
  const hiddenOpenPortCount = open.length - visibleOpenPorts.length
  const fingerprintSupported = fingerprintStatus === "supported"
  const fingerprintEnabled = fingerprint && fingerprintSupported
  const commandHintKey = fingerprintEnabled
    ? "networkProbe.cmd.scanPortsFingerprint"
    : toolStatus === "supported"
      ? "networkProbe.cmd.scanPortsNmap"
      : "networkProbe.cmd.scanPortsTcp"
  const serviceByPort = useMemo(
    () =>
      new Map<number, PortServiceFingerprint>(
        result?.fingerprint?.services.map((service) => [service.port, service]) ?? [],
      ),
    [result?.fingerprint?.services],
  )

  const getPortStateLabel = (state: string) => {
    if (!Object.prototype.hasOwnProperty.call(PORT_STATE_LABELS, state)) {
      return t("networkProbe.ports.states.unknown")
    }
    return t(PORT_STATE_LABELS[state as keyof typeof PORT_STATE_LABELS])
  }

  const portCount = useMemo(() => estimatePortCount(ports), [ports])
  const confirmationPacing =
    toolStatus === "supported"
      ? [
          t("networkProbe.ports.confirmNmapPacing", {
            intervalMs: PROBE_INTERVAL_MS,
            maxRate: 1000 / PROBE_INTERVAL_MS,
          }),
          ...(portCount === null
            ? []
            : [
                t("networkProbe.ports.confirmNmapDuration", {
                  seconds: NMAP_HOST_TIMEOUT_SECONDS,
                }),
              ]),
        ]
      : [
          t("networkProbe.ports.confirmTcpPacing", {
            intervalMs: PROBE_INTERVAL_MS,
            maxRate: 1000 / PROBE_INTERVAL_MS,
            concurrency: MAX_CONCURRENT_PROBES,
            timeoutMs: DEFAULT_TCP_TIMEOUT_MS,
          }),
          ...(portCount === null
            ? []
            : [
                t("networkProbe.ports.confirmTcpDuration", {
                  seconds: Math.ceil(
                    (portCount * PROBE_INTERVAL_MS + DEFAULT_TCP_TIMEOUT_MS) / 1000,
                  ),
                }),
              ]),
        ]
  const needsConfirm = useMemo(() => {
    const host = target.trim()
    if (!host || hasUnsupportedMultiHostSyntax(host)) return false
    return !isPrivateOrLocal(host) || (portCount !== null && portCount > 64)
  }, [target, portCount])

  const start = () => {
    if (hasUnsupportedMultiHostSyntax(target.trim())) {
      onRun(target.trim(), ports.trim(), fingerprintEnabled, false)
      return
    }
    if (needsConfirm) {
      setConfirmOpen(true)
      return
    }
    onRun(target.trim(), ports.trim(), fingerprintEnabled, false)
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
          ) : toolStatus === "supported" ? (
            <p className="text-muted-foreground text-xs">{t("networkProbe.ports.nmapHint")}</p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.ports.degradedHint")}
            </p>
          )}
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
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fingerprintEnabled}
                onChange={(event) => setFingerprint(event.target.checked)}
                disabled={loading || !fingerprintSupported}
                aria-describedby="np-port-fingerprint-hint"
              />
              <span>{t("networkProbe.ports.fingerprint")}</span>
            </label>
            <CommandHint
              hint={t(commandHintKey, {
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
          <p id="np-port-fingerprint-hint" className="text-muted-foreground text-xs">
            {fingerprintSupported
              ? t("networkProbe.ports.fingerprintHint")
              : t("networkProbe.ports.fingerprintUnavailable")}
          </p>
        </>
      }
    >
      {open.length > 0 ? (
        <p className="text-sm font-medium">
          {t("networkProbe.ports.openList", { ports: visibleOpenPorts.join(", ") })}
          {hiddenOpenPortCount > 0 ? (
            <span className="text-muted-foreground ml-1 font-normal">
              {t("networkProbe.ports.openListMore", { count: hiddenOpenPortCount })}
            </span>
          ) : null}
        </p>
      ) : null}
      {result?.cancelled ? (
        <p className="text-muted-foreground text-xs">{t("networkProbe.ports.cancelled")}</p>
      ) : result?.mode === "nmap-fingerprint-syn-or-connect" ? (
        <p className="text-muted-foreground text-xs">{t("networkProbe.ports.fingerprintResult")}</p>
      ) : result?.mode === "nmap-syn-or-connect" ? (
        <p className="text-muted-foreground text-xs">{t("networkProbe.ports.nmapResult")}</p>
      ) : result?.mode === "tcp-connect" ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("networkProbe.ports.tcpFallbackResult")}
        </p>
      ) : result?.message ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{result.message}</p>
      ) : null}
      {result?.fingerprint ? (
        <section
          aria-label={t("networkProbe.ports.fingerprintResultsLabel")}
          className="space-y-1 rounded-md border p-2 text-xs"
        >
          <p className="font-medium">{t("networkProbe.ports.fingerprintSummary")}</p>
          <p className="text-muted-foreground">
            {result.fingerprint.osMatches.length > 0
              ? t("networkProbe.ports.osMatches", {
                  matches: result.fingerprint.osMatches
                    .slice(0, 3)
                    .map((match) => `${match.name} (${match.accuracy}%)`)
                    .join(", "),
                })
              : result.fingerprint.services.length > 0
                ? t("networkProbe.ports.osUnavailable")
                : t("networkProbe.ports.fingerprintNoMatches")}
          </p>
          <p className="text-muted-foreground">{t("networkProbe.ports.riskDisclaimer")}</p>
        </section>
      ) : null}
      {samples.length > 0 ? (
        <VirtualizedResultList
          items={samples}
          ariaLabel={t("networkProbe.ports.resultsLabel")}
          dataList="port-samples"
          getItemKey={(sample) => sample.port}
          className="text-muted-foreground space-y-0.5 font-mono text-xs"
          itemClassName="flex h-7 min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap"
          renderItem={(sample) => (
            <>
              <span className="w-12 shrink-0">{sample.port}:</span>
              <span className="shrink-0">{getPortStateLabel(sample.state)}</span>
              {sample.serviceHint ? (
                <span className="min-w-0 truncate">({sample.serviceHint})</span>
              ) : null}
              {sample.rttMs != null ? (
                <span className="shrink-0">
                  · {t("networkProbe.ports.rttValue", { ms: sample.rttMs.toFixed(0) })}
                </span>
              ) : null}
              {(() => {
                const service = serviceByPort.get(sample.port)
                if (!service) return null
                const details = [
                  service.serviceName,
                  service.product,
                  service.version,
                  service.extraInfo,
                ]
                  .filter(Boolean)
                  .join(" ")
                const tags = service.riskTags
                  .map((tag) => RISK_TAG_LABELS[tag])
                  .filter(Boolean)
                  .map((key) => t(key))
                  .join(" · ")
                return (
                  <span
                    className="min-w-0 truncate"
                    title={[details, tags].filter(Boolean).join(" · ")}
                  >
                    {details ? `· ${details}` : null}
                    {tags ? (
                      <span className="text-amber-700 dark:text-amber-400"> · {tags}</span>
                    ) : null}
                  </span>
                )
              })()}
            </>
          )}
        />
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
          ports: ports.trim(),
          count: portCount === null ? t("networkProbe.ports.confirmCountUnknown") : portCount,
        })}
        consequence={[
          ...confirmationPacing,
          fingerprintEnabled
            ? t("networkProbe.ports.confirmFingerprintConsequence", {
                intervalMs: PROBE_INTERVAL_MS,
              })
            : t("networkProbe.ports.confirmConsequence"),
        ].join(" ")}
        confirmLabel={t("networkProbe.ports.confirmRun")}
        cancelLabel={t("networkProbe.ports.cancel")}
        loading={loading}
        onConfirm={() => {
          setConfirmOpen(false)
          onRun(target.trim(), ports.trim(), fingerprintEnabled, true)
        }}
      />
    </ProbePanelShell>
  )
}
