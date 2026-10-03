/**
 * Feature UI / 功能界面: TCP connect port scan (degraded).
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { VirtualizedResultList } from "@/features/network-probe/components/VirtualizedResultList"
import type { PortSampleEvent, PortScanResult } from "@/lib/tauri/types/network-probe"

interface PortScanPanelProps {
  loading: boolean
  canCancel: boolean
  result: PortScanResult | null
  streaming: PortSampleEvent[]
  toolEnabled: boolean
  toolStatus?: string
  onRun: (target: string, ports: string, fingerprint: boolean) => void
  onCancel: () => void
}

function isPrivateOrLocal(host: string): boolean {
  const h = host.trim().toLowerCase()
  if (h === "localhost" || h === "::1") return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return false
  const [a, b, c, d] = m.slice(1).map(Number)
  if ([a, b, c, d].some((octet) => octet > 255)) return false
  if (a === 10 || a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  return false
}

const MAX_PORTS = 256
const MAX_PORT_SPEC_LENGTH = 4096

function parsePortSpec(spec: string): { count: number; valid: boolean } {
  if (spec.length > MAX_PORT_SPEC_LENGTH) return { count: 0, valid: false }

  const uniquePorts = new Set<number>()
  for (const part of spec.split(/[ ,]+/)) {
    const p = part.trim()
    if (!p) continue

    const range = /^(\d+)-(\d+)$/.exec(p)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end > 65535 ||
        end < start
      ) {
        return { count: uniquePorts.size, valid: false }
      }
      for (let port = start; port <= end; port += 1) {
        uniquePorts.add(port)
        if (uniquePorts.size > MAX_PORTS) return { count: uniquePorts.size, valid: false }
      }
    } else if (/^\d+$/.test(p)) {
      const port = Number(p)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { count: uniquePorts.size, valid: false }
      }
      uniquePorts.add(port)
      if (uniquePorts.size > MAX_PORTS) return { count: uniquePorts.size, valid: false }
    } else {
      return { count: uniquePorts.size, valid: false }
    }
  }

  return { count: uniquePorts.size, valid: uniquePorts.size > 0 }
}

export function PortScanPanel({
  loading,
  canCancel,
  result,
  streaming,
  toolEnabled,
  toolStatus,
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

  const { count: portCount, valid: portSpecValid } = useMemo(() => parsePortSpec(ports), [ports])
  const needsConfirm = useMemo(() => {
    const host = target.trim()
    if (!host) return false
    return fingerprint || !isPrivateOrLocal(host) || portCount > 64
  }, [target, portCount, fingerprint])

  const start = () => {
    if (needsConfirm) {
      setConfirmOpen(true)
      return
    }
    onRun(target.trim(), ports.trim(), fingerprint)
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
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.ports.capabilityHint")}
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
                aria-invalid={!portSpecValid}
                aria-describedby={!portSpecValid ? "np-ports-range-error" : undefined}
              />
              {!portSpecValid ? (
                <p id="np-ports-range-error" className="text-destructive text-xs" role="alert">
                  {t("networkProbe.ports.invalidPortSpec")}
                </p>
              ) : null}
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fingerprint}
                onChange={(event) => setFingerprint(event.target.checked)}
                disabled={loading}
                aria-describedby={fingerprint ? "np-ports-fingerprint-hint" : undefined}
              />
              {t("networkProbe.ports.fingerprintOption")}
            </label>
            <CommandHint
              hint={t(
                fingerprint
                  ? "networkProbe.cmd.scanPortsFingerprint"
                  : "networkProbe.cmd.scanPorts",
                {
                  target: target.trim() || "…",
                  ports: ports.trim() || "…",
                },
              )}
            >
              <Button
                type="button"
                disabled={loading || !toolEnabled || !target.trim() || !portSpecValid}
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
          {fingerprint ? (
            <p id="np-ports-fingerprint-hint" className="text-muted-foreground text-xs">
              {t("networkProbe.ports.fingerprintHint")}
            </p>
          ) : null}
        </>
      }
    >
      {open.length > 0 ? (
        <p className="text-sm font-medium">
          {t("networkProbe.ports.openList", { ports: open.join(", ") })}
        </p>
      ) : null}
      {result?.cancelled ? (
        <p className="text-muted-foreground text-xs">{t("networkProbe.ports.cancelled")}</p>
      ) : result?.mode === "tcp-connect" && result.fingerprintStatus === "not-requested" ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("networkProbe.ports.tcpConnectFallback")}
        </p>
      ) : result?.message ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{result.message}</p>
      ) : null}
      {result && !result.cancelled && result.fingerprintStatus !== "not-requested" ? (
        <section aria-live="polite" className="space-y-1 text-sm">
          <p>{t(`networkProbe.ports.scanModes.${result.mode}`)}</p>
          <p>{t(`networkProbe.ports.fingerprintStatus.${result.fingerprintStatus}`)}</p>
          {result.osFingerprint ? (
            <p>
              {t("networkProbe.ports.osGuess", {
                name: result.osFingerprint.name,
                accuracy: result.osFingerprint.accuracy,
              })}
            </p>
          ) : null}
        </section>
      ) : null}
      {result && !result.cancelled && result.fingerprintStatus === "not-requested" ? (
        <p className="text-muted-foreground text-xs">
          {t(`networkProbe.ports.scanModes.${result.mode}`)}
        </p>
      ) : null}
      {samples.length > 0 ? (
        <VirtualizedResultList
          items={samples}
          getKey={(sample) => `${sample.port}-${sample.state}`}
          ariaLabel={t("networkProbe.ports.listLabel")}
          className="text-muted-foreground space-y-0.5 font-mono text-xs"
          itemClassName="border-b border-border/50 py-1"
          estimatedItemHeight={36}
          renderItem={(s) => (
            <>
              {s.port}: {s.state}
              {s.serviceHint ? (
                <span className="ml-1 font-sans">
                  {s.serviceHint}
                  {s.serviceMethod
                    ? ` · ${t(`networkProbe.ports.serviceMethods.${s.serviceMethod}`)}`
                    : ""}
                  {s.serviceProduct || s.serviceVersion
                    ? ` · ${[s.serviceProduct, s.serviceVersion].filter(Boolean).join(" ")}`
                    : ""}
                </span>
              ) : null}
              {s.riskTags?.length ? (
                <span className="ml-2 inline-flex flex-wrap gap-1 font-sans">
                  {s.riskTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                    >
                      {t(`networkProbe.ports.risks.${tag}`)}
                    </span>
                  ))}
                </span>
              ) : null}
              {s.rttMs != null ? ` · ${s.rttMs.toFixed(0)} ms` : ""}
            </>
          )}
        />
      ) : null}
      {samples.some((sample) => sample.riskTags?.length) ? (
        <p className="text-muted-foreground text-xs">{t("networkProbe.ports.riskNote")}</p>
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
          count: portCount,
          fingerprint: t(
            fingerprint ? "networkProbe.ports.fingerprintOn" : "networkProbe.ports.fingerprintOff",
          ),
        })}
        consequence={t(
          fingerprint
            ? "networkProbe.ports.confirmConsequenceFingerprint"
            : "networkProbe.ports.confirmConsequenceBasic",
        )}
        confirmLabel={t("networkProbe.ports.confirmRun")}
        cancelLabel={t("networkProbe.ports.cancel")}
        loading={loading}
        onConfirm={() => {
          setConfirmOpen(false)
          onRun(target.trim(), ports.trim(), fingerprint)
        }}
      />
    </ProbePanelShell>
  )
}
