/**
 * Feature UI / 功能界面: privilege-free fix hub (flush / switch DNS / renew DHCP / reset).
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { TripleDestructiveConfirm } from "@/components/common/TripleDestructiveConfirm"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { NetworkServicesLoadStatus } from "@/features/network-probe/store"
import type { DnsPreset, FixResult } from "@/lib/tauri/types/network-probe"

interface FixPanelProps {
  loading: boolean
  services: string[]
  servicesStatus: NetworkServicesLoadStatus
  dnsPresets: DnsPreset[]
  lastResult: FixResult | null
  onLoadServices: () => void
  onFlushDns: () => Promise<void>
  onSwitchDns: (service: string, servers: string[]) => Promise<void>
  onRenewDhcp: (service: string) => Promise<void>
  onResetNetworkStack: (service: string) => Promise<void>
  onOpenSettings: () => void
  openingSettings: boolean
}

type PendingAction =
  | { kind: "flush" }
  | { kind: "switch-step1" }
  | { kind: "switch-step2" }
  | { kind: "renew-step1" }
  | { kind: "renew-step2" }
  | { kind: "reset" }
  | null

const RESET_PHRASE = "RESET"

export function FixPanel({
  loading,
  services,
  servicesStatus,
  dnsPresets,
  lastResult,
  onLoadServices,
  onFlushDns,
  onSwitchDns,
  onRenewDhcp,
  onResetNetworkStack,
  onOpenSettings,
  openingSettings,
}: FixPanelProps) {
  const { t } = useTranslation()
  const [service, setService] = useState("")
  const [presetId, setPresetId] = useState(dnsPresets[0]?.id ?? "")
  const [pending, setPending] = useState<PendingAction>(null)

  useEffect(() => {
    onLoadServices()
  }, [onLoadServices])

  useEffect(() => {
    if (!service && services.length > 0) {
      const preferred =
        services.find((s) => /wi-?fi|wlan/i.test(s)) ??
        services.find((s) => /ethernet|usb/i.test(s)) ??
        services[0]
      setService(preferred)
    }
  }, [services, service])

  useEffect(() => {
    if (!presetId && dnsPresets[0]) setPresetId(dnsPresets[0].id)
  }, [dnsPresets, presetId])

  const selectedPreset = dnsPresets.find((p) => p.id === presetId)
  const servers = selectedPreset ? [selectedPreset.address] : []

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.fix.hint")}</p>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-fix-service">
                {t("networkProbe.fix.service")}
              </label>
              <select
                id="np-fix-service"
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={service}
                disabled={servicesStatus !== "loaded" || loading}
                onChange={(e) => setService(e.target.value)}
              >
                {services.length === 0 ? (
                  <option value="" disabled>
                    {t(
                      servicesStatus === "loading"
                        ? "networkProbe.fix.servicesLoading"
                        : servicesStatus === "failed"
                          ? "networkProbe.fix.servicesFailed"
                          : servicesStatus === "loaded"
                            ? "networkProbe.fix.servicesEmpty"
                            : "networkProbe.fix.servicesLoading",
                    )}
                  </option>
                ) : null}
                {services.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {servicesStatus !== "idle" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={servicesStatus === "loading"}
                  onClick={onLoadServices}
                >
                  {servicesStatus === "loading"
                    ? t("networkProbe.fix.servicesLoading")
                    : t("networkProbe.fix.refreshServices")}
                </Button>
              ) : null}
              {servicesStatus === "failed" ? (
                <p role="alert" className="text-destructive text-xs">
                  {t("networkProbe.fix.servicesFailed")}
                </p>
              ) : null}
            </div>
            <div className="min-w-[10rem] flex-1 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-fix-dns">
                {t("networkProbe.fix.dnsPreset")}
              </label>
              <select
                id="np-fix-dns"
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
              >
                {dnsPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.address}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={loading} onClick={() => setPending({ kind: "flush" })}>
              {t("networkProbe.fix.flush")}
            </Button>
            <Button
              type="button"
              disabled={loading || servicesStatus !== "loaded" || !service || servers.length === 0}
              onClick={() => setPending({ kind: "switch-step1" })}
            >
              {t("networkProbe.fix.switchDns")}
            </Button>
            <Button
              type="button"
              disabled={loading || servicesStatus !== "loaded" || !service}
              onClick={() => setPending({ kind: "renew-step1" })}
            >
              {t("networkProbe.fix.renewDhcp")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={loading || servicesStatus !== "loaded" || !service}
              onClick={() => setPending({ kind: "reset" })}
            >
              {t("networkProbe.fix.resetStack")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={openingSettings}
              onClick={onOpenSettings}
            >
              {openingSettings
                ? t("networkProbe.openingSettings")
                : t("networkProbe.fix.openSettings")}
            </Button>
          </div>

          <div className="text-muted-foreground space-y-0.5 font-mono text-xs">
            <div>{t("networkProbe.cmd.flushDns")}</div>
            <div>
              {t("networkProbe.cmd.switchDns", {
                service: service || "…",
                servers: servers.join(",") || "…",
              })}
            </div>
            <div>{t("networkProbe.cmd.renewDhcp", { service: service || "…" })}</div>
            <div>{t("networkProbe.cmd.resetNetworkStack", { service: service || "…" })}</div>
          </div>
        </>
      }
    >
      {lastResult ? (
        <div className="bg-muted/40 space-y-1 rounded-lg border px-3 py-2 text-sm">
          <div>
            {lastResult.action}:{" "}
            <span className="font-medium">
              {lastResult.ok ? t("networkProbe.fix.ok") : t("networkProbe.fix.failed")}
            </span>
          </div>
          <div className="text-muted-foreground text-xs">{lastResult.message}</div>
          <div className="text-muted-foreground font-mono text-xs">{lastResult.commandHint}</div>
        </div>
      ) : null}

      <DestructiveConfirmDialog
        open={pending?.kind === "flush"}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("networkProbe.fix.confirm.flushTitle")}
        description={t("networkProbe.fix.confirm.flushDesc")}
        consequence={t("networkProbe.fix.confirm.flushConsequence")}
        confirmLabel={t("networkProbe.fix.confirm.confirm")}
        cancelLabel={t("networkProbe.fix.confirm.cancel")}
        loading={loading}
        onConfirm={onFlushDns}
      />

      <DestructiveConfirmDialog
        open={pending?.kind === "switch-step1"}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("networkProbe.fix.confirm.switchStep1Title")}
        description={t("networkProbe.fix.confirm.switchStep1Desc")}
        consequence={t("networkProbe.fix.confirm.switchStep1Consequence")}
        confirmLabel={t("networkProbe.fix.confirm.next")}
        cancelLabel={t("networkProbe.fix.confirm.cancel")}
        onConfirm={async () => {
          window.setTimeout(() => setPending({ kind: "switch-step2" }), 320)
        }}
      />

      <DestructiveConfirmDialog
        open={pending?.kind === "switch-step2"}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("networkProbe.fix.confirm.switchStep2Title")}
        description={t("networkProbe.fix.confirm.switchStep2Desc", {
          service,
          servers: servers.join(", "),
        })}
        consequence={t("networkProbe.fix.confirm.switchStep2Consequence")}
        confirmLabel={t("networkProbe.fix.confirm.confirm")}
        cancelLabel={t("networkProbe.fix.confirm.cancel")}
        loading={loading}
        onConfirm={async () => {
          await onSwitchDns(service, servers)
        }}
      />

      <DestructiveConfirmDialog
        open={pending?.kind === "renew-step1"}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("networkProbe.fix.confirm.renewStep1Title")}
        description={t("networkProbe.fix.confirm.renewStep1Desc")}
        consequence={t("networkProbe.fix.confirm.renewStep1Consequence")}
        confirmLabel={t("networkProbe.fix.confirm.next")}
        cancelLabel={t("networkProbe.fix.confirm.cancel")}
        onConfirm={async () => {
          window.setTimeout(() => setPending({ kind: "renew-step2" }), 320)
        }}
      />

      <DestructiveConfirmDialog
        open={pending?.kind === "renew-step2"}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("networkProbe.fix.confirm.renewStep2Title")}
        description={t("networkProbe.fix.confirm.renewStep2Desc", { service })}
        consequence={t("networkProbe.fix.confirm.renewStep2Consequence")}
        confirmLabel={t("networkProbe.fix.confirm.confirm")}
        cancelLabel={t("networkProbe.fix.confirm.cancel")}
        loading={loading}
        onConfirm={async () => {
          await onRenewDhcp(service)
        }}
      />

      <TripleDestructiveConfirm
        open={pending?.kind === "reset"}
        onOpenChange={(open) => !open && setPending(null)}
        step1={{
          title: t("networkProbe.fix.confirm.resetStep1Title"),
          description: t("networkProbe.fix.confirm.resetStep1Desc"),
          consequence: t("networkProbe.fix.confirm.resetStep1Consequence"),
        }}
        step2={{
          title: t("networkProbe.fix.confirm.resetStep2Title"),
          description: t("networkProbe.fix.confirm.resetStep2Desc", { service }),
          consequence: t("networkProbe.fix.confirm.resetStep2Consequence"),
        }}
        step3={{
          title: t("networkProbe.fix.confirm.resetStep3Title"),
          description: t("networkProbe.fix.confirm.resetStep3Desc"),
          consequence: t("networkProbe.fix.confirm.resetStep3Consequence"),
        }}
        confirmPhrase={RESET_PHRASE}
        phraseLabel={t("networkProbe.fix.confirm.resetPhraseLabel", { phrase: RESET_PHRASE })}
        acknowledgeLabel={t("networkProbe.fix.confirm.resetAck")}
        nextLabel={t("networkProbe.fix.confirm.next")}
        backLabel={t("networkProbe.fix.confirm.back")}
        confirmLabel={t("networkProbe.fix.confirm.resetConfirm")}
        cancelLabel={t("networkProbe.fix.confirm.cancel")}
        loading={loading}
        onConfirm={async () => {
          await onResetNetworkStack(service)
        }}
      />
    </ProbePanelShell>
  )
}
