/**
 * Feature UI / 功能界面: offline / can't-connect diagnostics hub.
 */
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type {
  NetworkProbeOfflineErrors,
  NetworkProbeOfflineSub,
} from "@/features/network-probe/store"
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
  busy: boolean
  focus: NetworkProbeOfflineSub
  errors: NetworkProbeOfflineErrors
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
  busy,
  focus,
  errors,
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
            <Button type="button" disabled={busy} onClick={onRunAll}>
              {loading ? t("networkProbe.offline.running") : t("networkProbe.offline.run")}
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
                  {t(`networkProbe.offline.captiveStatus.${captive.status}`)}
                </span>
              </div>
              {captive.detail ? (
                <p className="text-muted-foreground text-xs">{captive.detail}</p>
              ) : null}
              <p className="text-muted-foreground font-mono text-[10px]">{captive.commandHint}</p>
            </>
          ) : (
            !errors.captive && (
              <p className="text-muted-foreground text-xs">{t("networkProbe.offline.pending")}</p>
            )
          )}
          <CheckFailure message={errors.captive} />
        </section>
      ) : null}

      {show("egress") ? (
        <section className="space-y-1 rounded-lg border px-3 py-2 text-sm">
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            {t("networkProbe.offline.egressTitle")}
          </h3>
          {publicIp ? (
            <>
              <div>
                {t("networkProbe.offline.ip")}:{" "}
                <span className="font-mono font-medium">{publicIp.ip ?? "—"}</span>
                {publicIp.source ? (
                  <span className="text-muted-foreground"> · {publicIp.source}</span>
                ) : null}
              </div>
              {publicIp.asn ? (
                <div className="text-muted-foreground text-xs">
                  {t("networkProbe.egress.asn", {
                    asn: publicIp.asn,
                    org: publicIp.org ? ` · ${publicIp.org}` : "",
                  })}
                </div>
              ) : null}
              {publicIp.detail ? (
                <p className="text-muted-foreground text-xs">{publicIp.detail}</p>
              ) : null}
              <p className="text-muted-foreground font-mono text-[10px]">{publicIp.commandHint}</p>
            </>
          ) : (
            !errors.egress && (
              <p className="text-muted-foreground text-xs">{t("networkProbe.offline.pending")}</p>
            )
          )}
          <CheckFailure message={errors.egress} />
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
              {proxyVpn.proxyDetail ? (
                <p className="text-muted-foreground text-xs">{proxyVpn.proxyDetail}</p>
              ) : null}
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
              <p className="text-muted-foreground font-mono text-[10px]">{proxyVpn.commandHint}</p>
            </>
          ) : (
            !errors.proxy && (
              <p className="text-muted-foreground text-xs">{t("networkProbe.offline.pending")}</p>
            )
          )}
          <CheckFailure message={errors.proxy} />
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
                    defaultValue: ipv6.status,
                  })}
                </span>
              </div>
              {ipv6.message ? (
                <p className="text-muted-foreground text-xs">{ipv6.message}</p>
              ) : null}
              <p className="text-muted-foreground text-xs">{ipv6.dualStack.detail}</p>
              <p className="text-muted-foreground font-mono text-[10px]">{ipv6.commandHint}</p>
            </>
          ) : (
            !errors.ipv6 && (
              <p className="text-muted-foreground text-xs">{t("networkProbe.offline.pending")}</p>
            )
          )}
          <CheckFailure message={errors.ipv6} />
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
                    defaultValue: mtu.status,
                  })}
                </span>
                {mtu.pathMtu != null ? <span className="font-mono"> · {mtu.pathMtu}</span> : null}
              </div>
              {mtu.message ? <p className="text-muted-foreground text-xs">{mtu.message}</p> : null}
              <p className="text-muted-foreground font-mono text-[10px]">{mtu.commandHint}</p>
            </>
          ) : (
            !errors.mtu && (
              <p className="text-muted-foreground text-xs">{t("networkProbe.offline.pending")}</p>
            )
          )}
          <CheckFailure message={errors.mtu} />
        </section>
      ) : null}

      {focus === "diff" ? (
        <p className="text-muted-foreground text-sm">{t("networkProbe.offline.diffHint")}</p>
      ) : null}
    </ProbePanelShell>
  )
}

function CheckFailure({ message }: { message?: string }) {
  const { t } = useTranslation()
  if (!message) return null
  return (
    <p role="alert" className="text-destructive text-xs">
      {t("networkProbe.offline.checkFailed", { message })}
    </p>
  )
}
