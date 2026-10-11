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
import { MAX_PORT_RANGE_INPUT_BYTES, validatePortRange } from "@/features/network-probe/port-range"
import type { PortSampleEvent, PortScanResult } from "@/lib/tauri/types/network-probe"

interface PortScanPanelProps {
  loading: boolean
  canCancel: boolean
  result: PortScanResult | null
  streaming: PortSampleEvent[]
  toolEnabled: boolean
  toolStatus?: string
  onRun: (target: string, ports: string) => void
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
  const [portTouched, setPortTouched] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const samples = result?.samples?.length ? result.samples : streaming
  const open = result?.openPorts?.length
    ? result.openPorts
    : samples.filter((s) => s.state === "open").map((s) => s.port)

  const portValidation = useMemo(() => validatePortRange(ports), [ports])
  const portCount = portValidation.valid ? portValidation.count : 0
  const showPortError = portTouched && !portValidation.valid
  const needsConfirm = useMemo(() => {
    const host = target.trim()
    if (!host) return false
    return !isPrivateOrLocal(host) || portCount > 64
  }, [target, portCount])

  const start = () => {
    if (!portValidation.valid) {
      setPortTouched(true)
      return
    }
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
                onChange={(e) => {
                  setPortTouched(true)
                  setPorts(e.target.value)
                }}
                aria-invalid={showPortError}
                aria-describedby={showPortError ? "np-ports-range-error" : undefined}
                maxLength={MAX_PORT_RANGE_INPUT_BYTES}
                autoComplete="off"
                disabled={loading}
              />
              {showPortError ? (
                <p id="np-ports-range-error" role="alert" className="text-destructive text-xs">
                  {t(`networkProbe.ports.validation.${portValidation.error}`)}
                </p>
              ) : null}
            </div>
            <CommandHint
              hint={t("networkProbe.cmd.scanPorts", {
                target: target.trim() || "…",
                ports: ports.trim() || "…",
              })}
            >
              <Button
                type="button"
                disabled={loading || !toolEnabled || !target.trim() || !portValidation.valid}
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
        </>
      }
    >
      {open.length > 0 ? (
        <p className="text-sm font-medium">
          {t("networkProbe.ports.openList", { ports: open.join(", ") })}
        </p>
      ) : null}
      {result?.message ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{result.message}</p>
      ) : null}
      {samples.length > 0 ? (
        <ul className="text-muted-foreground space-y-0.5 font-mono text-xs">
          {samples.map((s) => (
            <li key={`${s.port}-${s.state}`}>
              {s.port}: {s.state}
              {s.serviceHint ? ` (${s.serviceHint})` : ""}
              {s.rttMs != null ? ` · ${s.rttMs.toFixed(0)} ms` : ""}
            </li>
          ))}
        </ul>
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
    </ProbePanelShell>
  )
}
