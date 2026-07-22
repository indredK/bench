/**
 * Feature UI / 功能界面: IPv6 dual-stack diagnostics.
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { Ipv6StackResult } from "@/lib/tauri/types/network-probe"

interface Ipv6PanelProps {
  loading: boolean
  result: Ipv6StackResult | null
  onRun: () => void
  dualFrom?: "offline" | "test"
}

export function Ipv6Panel({ loading, result, onRun, dualFrom }: Ipv6PanelProps) {
  const { t } = useTranslation()

  return (
    <ProbePanelShell
      embedded={dualFrom === "offline"}
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.ipv6.hint")}</p>
          {dualFrom ? (
            <p className="text-muted-foreground text-xs">
              {t(`networkProbe.dualEntry.from.${dualFrom}`)}
            </p>
          ) : null}
          <Button type="button" disabled={loading} onClick={onRun}>
            {loading ? t("networkProbe.ipv6.running") : t("networkProbe.ipv6.run")}
          </Button>
          <p className="text-muted-foreground font-mono text-xs">{t("networkProbe.cmd.ipv6")}</p>
        </>
      }
    >
      {result ? (
        <div className="space-y-2 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.ipv6.status")}:{" "}
            <span className="font-medium">
              {t(`networkProbe.ipv6.statusValue.${result.status}`, {
                defaultValue: result.status,
              })}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {t("networkProbe.ipv6.elapsed", { ms: result.elapsedMs.toFixed(0) })}
            </span>
          </div>
          {result.message ? (
            <p className="text-muted-foreground text-xs">{result.message}</p>
          ) : null}
          <div className="text-muted-foreground text-xs">
            {t("networkProbe.ipv6.linkLocal")}:{" "}
            {result.linkLocal.length > 0 ? result.linkLocal.join(", ") : "—"}
          </div>
          <div className="text-muted-foreground text-xs">
            {t("networkProbe.ipv6.global")}:{" "}
            {result.global.length > 0 ? result.global.join(", ") : "—"}
          </div>
          <div className="text-muted-foreground text-xs">
            {t("networkProbe.ipv6.aaaa")}:{" "}
            {result.aaaaOk
              ? result.aaaaAddrs.join(", ") || t("networkProbe.ipv6.ok")
              : t("networkProbe.ipv6.fail")}
          </div>
          <div className="text-muted-foreground text-xs">
            {t("networkProbe.ipv6.icmpv6")}:{" "}
            {result.icmpv6Ok == null
              ? "—"
              : result.icmpv6Ok
                ? t("networkProbe.ipv6.rtt", { ms: result.icmpv6RttMs?.toFixed(1) ?? "?" })
                : t("networkProbe.ipv6.fail")}
          </div>
          <div className="text-muted-foreground text-xs">
            {t("networkProbe.ipv6.httpV6")}:{" "}
            {result.httpV6Ok == null
              ? "—"
              : result.httpV6Ok
                ? t("networkProbe.ipv6.ok")
                : t("networkProbe.ipv6.fail")}
          </div>
          <div className="text-muted-foreground text-xs">
            {t("networkProbe.ipv6.dual")}: {result.dualStack.detail}
          </div>
          <div className="text-muted-foreground text-xs">
            {t("networkProbe.ipv6.ndp")}: {result.ndpStatus}
            {result.ndpDetail ? ` — ${result.ndpDetail}` : ""}
          </div>
          {result.tracerouteNote ? (
            <p className="text-muted-foreground text-xs">{result.tracerouteNote}</p>
          ) : null}
          <p className="text-muted-foreground font-mono text-[10px]">{result.commandHint}</p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("networkProbe.ipv6.empty")}</p>
      )}
    </ProbePanelShell>
  )
}
