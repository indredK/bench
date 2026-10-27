/**
 * Feature UI / 功能界面: privilege-free fix hub (flush / switch DNS / renew DHCP / reset).
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { TripleDestructiveConfirm } from "@/components/common/TripleDestructiveConfirm"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { ProbeSystemDetails } from "@/features/network-probe/components/ProbeSystemDetails"
import type { DnsPreset, FixResult } from "@/lib/tauri/types/network-probe"

type FixToolId = "flushDns" | "switchDns" | "renewDhcp" | "resetNetworkStack"

interface FixPanelProps {
  loading: boolean
  loadingServices: boolean
  openingSettings: boolean
  toolEnabled: Record<FixToolId, boolean>
  toolStatus: Partial<Record<FixToolId, string>>
  services: string[]
  dnsPresets: DnsPreset[]
  lastResult: FixResult | null
  onLoadServices: () => void
  onFlushDns: () => Promise<void>
  onSwitchDns: (service: string, servers: string[]) => Promise<void>
  onRenewDhcp: (service: string) => Promise<void>
  onResetNetworkStack: (service: string) => Promise<void>
  onOpenSettings: () => void
  embedded?: boolean
  active?: boolean
}

type PendingAction =
  | { kind: "flush" }
  | { kind: "switch-step1"; service: string; servers: string[] }
  | { kind: "switch-step2"; service: string; servers: string[] }
  | { kind: "renew-step1"; service: string }
  | { kind: "renew-step2"; service: string }
  | { kind: "reset"; service: string }
  | null

const RESET_PHRASE = "RESET"

export function FixPanel({
  loading,
  loadingServices,
  openingSettings,
  toolEnabled,
  toolStatus,
  services,
  dnsPresets,
  lastResult,
  onLoadServices,
  onFlushDns,
  onSwitchDns,
  onRenewDhcp,
  onResetNetworkStack,
  onOpenSettings,
  embedded = false,
  active = true,
}: FixPanelProps) {
  const { t } = useTranslation()
  const getActionLabel = (action: string) => {
    switch (action) {
      case "flushDns":
        return t("networkProbe.fix.flush")
      case "switchDns":
        return t("networkProbe.fix.switchDns")
      case "renewDhcp":
        return t("networkProbe.fix.renewDhcp")
      case "resetNetworkStack":
        return t("networkProbe.fix.resetStack")
      default:
        return t("networkProbe.fix.unknownAction")
    }
  }
  const [service, setService] = useState("")
  const [serviceSelectionRequired, setServiceSelectionRequired] = useState(false)
  const [presetId, setPresetId] = useState(dnsPresets[0]?.id ?? "")
  const [pending, setPending] = useState<PendingAction>(null)
  const serviceActionsAvailable =
    toolEnabled.switchDns || toolEnabled.renewDhcp || toolEnabled.resetNetworkStack

  useEffect(() => {
    if (active && serviceActionsAvailable) onLoadServices()
  }, [active, onLoadServices, serviceActionsAvailable])

  useEffect(() => {
    if (services.length === 0) {
      if (service) {
        setService("")
        setServiceSelectionRequired(true)
        setPending((current) => (current?.kind === "flush" ? current : null))
      }
      return
    }
    if (service && services.includes(service)) return
    if (service) {
      setService("")
      setServiceSelectionRequired(true)
      setPending((current) => (current?.kind === "flush" ? current : null))
      return
    }
    if (serviceSelectionRequired) return

    const preferred =
      services.find((s) => /wi-?fi|wlan/i.test(s)) ??
      services.find((s) => /ethernet|usb/i.test(s)) ??
      services[0]
    setService(preferred)
  }, [services, service, serviceSelectionRequired])

  useEffect(() => {
    if (dnsPresets.some((preset) => preset.id === presetId)) return
    setPresetId(dnsPresets[0]?.id ?? "")
  }, [dnsPresets, presetId])

  const selectedPreset = dnsPresets.find((p) => p.id === presetId)
  const servers = selectedPreset ? [selectedPreset.address] : []
  const serviceAvailable = service !== "" && services.includes(service)
  const switchStep1 = pending?.kind === "switch-step1" ? pending : null
  const switchStep2 = pending?.kind === "switch-step2" ? pending : null
  const renewStep1 = pending?.kind === "renew-step1" ? pending : null
  const renewStep2 = pending?.kind === "renew-step2" ? pending : null
  const resetPending = pending?.kind === "reset" ? pending : null

  return (
    <ProbePanelShell
      embedded={embedded}
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.fix.hint")}</p>
          {(
            [
              ["flushDns", "networkProbe.fix.flush"],
              ["switchDns", "networkProbe.fix.switchDns"],
              ["renewDhcp", "networkProbe.fix.renewDhcp"],
              ["resetNetworkStack", "networkProbe.fix.resetStack"],
            ] as const
          ).map(([tool, labelKey]) =>
            toolEnabled[tool] ? null : (
              <p key={tool} className="text-xs text-amber-700 dark:text-amber-400">
                {t("networkProbe.caps.toolDisabled", {
                  tool: t(labelKey),
                  status: toolStatus[tool] ?? "unsupported",
                })}
              </p>
            ),
          )}

          {serviceActionsAvailable ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1 space-y-1">
                <label className="text-xs font-medium" htmlFor="np-fix-service">
                  {t("networkProbe.fix.service")}
                </label>
                <select
                  id="np-fix-service"
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={service}
                  onChange={(e) => {
                    setServiceSelectionRequired(false)
                    setPending(null)
                    setService(e.target.value)
                  }}
                  disabled={
                    loading ||
                    loadingServices ||
                    services.length === 0 ||
                    !serviceActionsAvailable ||
                    pending !== null
                  }
                >
                  {!service ? (
                    <option value="" disabled>
                      {loadingServices
                        ? t("networkProbe.fix.loadingServices")
                        : services.length === 0
                          ? t("networkProbe.fix.servicesEmpty")
                          : t("networkProbe.fix.selectService")}
                    </option>
                  ) : null}
                  {services.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  loading || loadingServices || !serviceActionsAvailable || pending !== null
                }
                onClick={onLoadServices}
              >
                {loadingServices
                  ? t("networkProbe.fix.loadingServices")
                  : services.length === 0
                    ? t("networkProbe.fix.loadServices")
                    : t("networkProbe.fix.refreshServices")}
              </Button>
              <div className="min-w-[10rem] flex-1 space-y-1">
                <label className="text-xs font-medium" htmlFor="np-fix-dns">
                  {t("networkProbe.fix.dnsPreset")}
                </label>
                <select
                  id="np-fix-dns"
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={presetId}
                  onChange={(e) => {
                    setPending(null)
                    setPresetId(e.target.value)
                  }}
                  disabled={pending !== null}
                >
                  {dnsPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.address}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <CommandHint hint={t("networkProbe.cmd.flushDns")}>
              <Button
                type="button"
                disabled={loading || !toolEnabled.flushDns || pending !== null}
                onClick={() => setPending({ kind: "flush" })}
              >
                {t("networkProbe.fix.flush")}
              </Button>
            </CommandHint>
            <CommandHint
              hint={t("networkProbe.cmd.switchDns", {
                service: service || "…",
                servers: servers.join(",") || "…",
              })}
            >
              <Button
                type="button"
                disabled={
                  loading ||
                  !toolEnabled.switchDns ||
                  !serviceAvailable ||
                  servers.length === 0 ||
                  pending !== null
                }
                onClick={() => setPending({ kind: "switch-step1", service, servers: [...servers] })}
              >
                {t("networkProbe.fix.switchDns")}
              </Button>
            </CommandHint>
            <CommandHint hint={t("networkProbe.cmd.renewDhcp", { service: service || "…" })}>
              <Button
                type="button"
                disabled={
                  loading || !toolEnabled.renewDhcp || !serviceAvailable || pending !== null
                }
                onClick={() => setPending({ kind: "renew-step1", service })}
              >
                {t("networkProbe.fix.renewDhcp")}
              </Button>
            </CommandHint>
            <CommandHint
              hint={t("networkProbe.cmd.resetNetworkStack", { service: service || "…" })}
            >
              <Button
                type="button"
                variant="destructive"
                disabled={
                  loading || !toolEnabled.resetNetworkStack || !serviceAvailable || pending !== null
                }
                onClick={() => setPending({ kind: "reset", service })}
              >
                {t("networkProbe.fix.resetStack")}
              </Button>
            </CommandHint>
            <Button
              type="button"
              variant="outline"
              disabled={openingSettings || pending !== null}
              onClick={onOpenSettings}
            >
              {openingSettings
                ? t("networkProbe.fix.openingSettings")
                : t("networkProbe.fix.openSettings")}
            </Button>
          </div>
        </>
      }
    >
      {lastResult ? (
        <div className="bg-muted/40 space-y-1 rounded-lg border px-3 py-2 text-sm">
          <div>
            {getActionLabel(lastResult.action)}:{" "}
            <span className="font-medium">
              {lastResult.ok ? t("networkProbe.fix.ok") : t("networkProbe.fix.failed")}
            </span>
          </div>
          {lastResult.message ? (
            <ProbeSystemDetails>
              <p className="font-mono break-all">{lastResult.message}</p>
            </ProbeSystemDetails>
          ) : null}
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
          if (!switchStep1) return
          const { service, servers } = switchStep1
          window.setTimeout(() => setPending({ kind: "switch-step2", service, servers }), 320)
        }}
      />

      <DestructiveConfirmDialog
        open={switchStep2 !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("networkProbe.fix.confirm.switchStep2Title")}
        description={t("networkProbe.fix.confirm.switchStep2Desc", {
          service: switchStep2?.service ?? "",
          servers: switchStep2?.servers.join(", ") ?? "",
        })}
        consequence={t("networkProbe.fix.confirm.switchStep2Consequence")}
        confirmLabel={t("networkProbe.fix.confirm.confirm")}
        cancelLabel={t("networkProbe.fix.confirm.cancel")}
        loading={loading}
        onConfirm={async () => {
          if (switchStep2) await onSwitchDns(switchStep2.service, switchStep2.servers)
        }}
      />

      <DestructiveConfirmDialog
        open={renewStep1 !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("networkProbe.fix.confirm.renewStep1Title")}
        description={t("networkProbe.fix.confirm.renewStep1Desc")}
        consequence={t("networkProbe.fix.confirm.renewStep1Consequence")}
        confirmLabel={t("networkProbe.fix.confirm.next")}
        cancelLabel={t("networkProbe.fix.confirm.cancel")}
        onConfirm={async () => {
          if (!renewStep1) return
          const { service } = renewStep1
          window.setTimeout(() => setPending({ kind: "renew-step2", service }), 320)
        }}
      />

      <DestructiveConfirmDialog
        open={renewStep2 !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("networkProbe.fix.confirm.renewStep2Title")}
        description={t("networkProbe.fix.confirm.renewStep2Desc", {
          service: renewStep2?.service ?? "",
        })}
        consequence={t("networkProbe.fix.confirm.renewStep2Consequence")}
        confirmLabel={t("networkProbe.fix.confirm.confirm")}
        cancelLabel={t("networkProbe.fix.confirm.cancel")}
        loading={loading}
        onConfirm={async () => {
          if (renewStep2) await onRenewDhcp(renewStep2.service)
        }}
      />

      <TripleDestructiveConfirm
        open={resetPending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        step1={{
          title: t("networkProbe.fix.confirm.resetStep1Title"),
          description: t("networkProbe.fix.confirm.resetStep1Desc"),
          consequence: t("networkProbe.fix.confirm.resetStep1Consequence"),
        }}
        step2={{
          title: t("networkProbe.fix.confirm.resetStep2Title"),
          description: t("networkProbe.fix.confirm.resetStep2Desc", {
            service: resetPending?.service ?? "",
          }),
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
          if (resetPending) await onResetNetworkStack(resetPending.service)
        }}
      />
    </ProbePanelShell>
  )
}
