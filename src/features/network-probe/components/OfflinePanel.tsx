/**
 * Feature UI / 功能界面: offline / can't-connect diagnostics hub.
 */
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { PublicIpResult } from "@/features/network-probe/components/PublicIpResult"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { TechnicalDetails } from "@/features/network-probe/components/TechnicalDetails"
import type { NetworkProbeOfflineSub } from "@/features/network-probe/store"
import type {
  CaptivePortalResult,
  Ipv6StackResult,
  PathMtuResult,
  PublicIpInfo,
  ProxyVpnStatus,
} from "@/lib/tauri/types/network-probe"
import { useTranslation } from "react-i18next"

interface OfflinePanelProps {
  loading: boolean
  blocked?: boolean
  focus: NetworkProbeOfflineSub
  captive: CaptivePortalResult | null
  publicIp: PublicIpInfo | null
  proxyVpn: ProxyVpnStatus | null
  ipv6: Ipv6StackResult | null
  mtu: PathMtuResult | null
  onRunAll: () => void
  onOpenMtu: () => void
}

export function OfflinePanel({
  loading,
  blocked = false,
  focus,
  captive,
  publicIp,
  proxyVpn,
  ipv6,
  mtu,
  onRunAll,
  onOpenMtu,
}: OfflinePanelProps) {
  const { t } = useTranslation()
  const show = (id: NetworkProbeOfflineSub) => focus === "all" || focus === id

  return (
    <ProbePanelShell
      embedded
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.offline.hint")}</p>
          <CommandHint hint={t("networkProbe.cmd.offlineBundle")}>
            <Button type="button" disabled={loading || blocked} onClick={onRunAll}>
              {loading
                ? t("networkProbe.offline.running")
                : blocked
                  ? t("networkProbe.offline.waiting")
                  : t("networkProbe.offline.run")}
            </Button>
          </CommandHint>
        </>
      }
    >
      {show("captive") ? (
        <section className="space-y-1 rounded-lg border px-3 py-2 text-sm">
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            {t("networkProbe.offline.captiveTitle")}
          </h3>
          {captive ? (
            <>
              <div>
                {t("networkProbe.offline.status")}:{" "}
                <span className="font-medium">
                  {t(`networkProbe.offline.captiveStatus.${captive.status}`, {
                    defaultValue: t("networkProbe.offline.captiveStatus.unknown"),
                  })}
                </span>
              </div>
              <TechnicalDetails
                title={t("networkProbe.offline.technicalDetails")}
                items={[
                  { label: t("networkProbe.offline.diagnostic"), value: captive.detail },
                  { label: t("networkProbe.offline.command"), value: captive.commandHint },
                ]}
              />
            </>
          ) : (
            <p className="text-muted-foreground text-xs">{t("networkProbe.offline.pending")}</p>
          )}
        </section>
      ) : null}

      {show("egress") ? (
        <section className="space-y-1 rounded-lg border px-3 py-2 text-sm">
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            {t("networkProbe.offline.egressTitle")}
          </h3>
          {publicIp ? (
            <PublicIpResult result={publicIp} embedded />
          ) : (
            <p className="text-muted-foreground text-xs">{t("networkProbe.offline.pending")}</p>
          )}
        </section>
      ) : null}

      {show("proxy") ? (
        <section className="space-y-1 rounded-lg border px-3 py-2 text-sm">
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            {t("networkProbe.offline.proxyTitle")}
          </h3>
          {proxyVpn ? (
            <>
              <div>
                {t("networkProbe.offline.proxy")}:{" "}
                {proxyVpn.proxyEnabled
                  ? t("networkProbe.offline.proxyOn")
                  : t("networkProbe.offline.proxyOff")}
              </div>
              <div>
                {t("networkProbe.offline.vpn")}:{" "}
                {proxyVpn.vpnIfaces.length > 0
                  ? proxyVpn.vpnIfaces.join(", ")
                  : t("networkProbe.offline.vpnNone")}
              </div>
              {proxyVpn.defaultViaTunnel ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("networkProbe.offline.viaTunnel")}
                </p>
              ) : null}
              <TechnicalDetails
                title={t("networkProbe.offline.technicalDetails")}
                items={[
                  { label: t("networkProbe.offline.proxyDiagnostic"), value: proxyVpn.proxyDetail },
                  { label: t("networkProbe.offline.command"), value: proxyVpn.commandHint },
                ]}
              />
            </>
          ) : (
            <p className="text-muted-foreground text-xs">{t("networkProbe.offline.pending")}</p>
          )}
        </section>
      ) : null}

      {show("ipv6") ? (
        <section className="space-y-1 rounded-lg border px-3 py-2 text-sm">
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            {t("networkProbe.offline.ipv6Title")}
          </h3>
          {ipv6 ? (
            <>
              <div>
                {t("networkProbe.ipv6.status")}:{" "}
                <span className="font-medium">
                  {t(`networkProbe.ipv6.statusValue.${ipv6.status}`, {
                    defaultValue: t("networkProbe.ipv6.statusValue.unknown"),
                  })}
                </span>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-xs">{t("networkProbe.offline.pending")}</p>
          )}
        </section>
      ) : null}

      {show("mtu") ? (
        <section className="space-y-1 rounded-lg border px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-wide uppercase">
              {t("networkProbe.offline.mtuTitle")}
            </h3>
            <Button type="button" variant="outline" size="sm" onClick={onOpenMtu}>
              {t("networkProbe.offline.openMtu")}
            </Button>
          </div>
          {mtu ? (
            <>
              <div>
                {t("networkProbe.mtu.status")}:{" "}
                <span className="font-medium">
                  {t(`networkProbe.mtu.statusValue.${mtu.status}`, {
                    defaultValue: t("networkProbe.mtu.statusValue.unknown"),
                  })}
                </span>
                {mtu.pathMtu != null ? <span className="font-mono"> · {mtu.pathMtu}</span> : null}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-xs">{t("networkProbe.offline.pending")}</p>
          )}
        </section>
      ) : null}

      {focus === "diff" ? (
        <p className="text-muted-foreground text-sm">{t("networkProbe.offline.diffHint")}</p>
      ) : null}
    </ProbePanelShell>
  )
}
