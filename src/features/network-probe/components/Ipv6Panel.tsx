/**
 * Feature UI / 功能界面: IPv6 dual-stack diagnostics.
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { Ipv6StackResult } from "@/lib/tauri/types/network-probe"

const NDP_STATUS_LABEL_KEYS: Record<string, string> = {
  ok: "networkProbe.ipv6.ndpStatus.ok",
  partial: "networkProbe.ipv6.ndpStatus.partial",
  skip: "networkProbe.ipv6.ndpStatus.skip",
}

function dualStackValueKey(result: Ipv6StackResult) {
  if (result.dualStack.ipv4Ok && result.dualStack.ipv6Ok) {
    return "networkProbe.ipv6.dualValue.both"
  }
  if (result.dualStack.ipv4Ok) return "networkProbe.ipv6.dualValue.ipv4Only"
  if (result.dualStack.ipv6Ok) return "networkProbe.ipv6.dualValue.ipv6Only"
  return "networkProbe.ipv6.dualValue.neither"
}

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
          <CommandHint hint={t("networkProbe.cmd.ipv6")}>
            <Button type="button" disabled={loading} onClick={onRun}>
              {loading ? t("networkProbe.ipv6.running") : t("networkProbe.ipv6.run")}
            </Button>
          </CommandHint>
        </>
      }
    >
      {result ? (
        <div className="space-y-2 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.ipv6.status")}:{" "}
            <span className="font-medium">
              {t(`networkProbe.ipv6.statusValue.${result.status}`, {
                defaultValue: t("networkProbe.ipv6.statusValue.unknown"),
              })}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {t("networkProbe.ipv6.elapsed", { ms: result.elapsedMs.toFixed(0) })}
            </span>
          </div>
          <div className="text-muted-foreground text-xs">
            {t("networkProbe.ipv6.linkLocal")}:{" "}
            {result.linkLocal.length > 0 ? result.linkLocal.join(", ") : "—"}
          </div>
          <div className="text-muted-foreground text-xs">
            {t("networkProbe.ipv6.uniqueLocal")}:{" "}
            {result.uniqueLocal.length > 0 ? result.uniqueLocal.join(", ") : "—"}
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
            {t("networkProbe.ipv6.dual")}: {t(dualStackValueKey(result))}
          </div>
          <div className="text-muted-foreground text-xs">
            {t("networkProbe.ipv6.ndp")}:{" "}
            {t(NDP_STATUS_LABEL_KEYS[result.ndpStatus] ?? "networkProbe.ipv6.ndpStatus.unknown")}
          </div>
          {result.message ||
          result.dualStack.detail ||
          result.ndpDetail ||
          result.tracerouteNote ||
          result.commandHint ? (
            <details className="text-muted-foreground rounded-lg border px-3 py-2 text-xs">
              <summary className="w-fit cursor-pointer select-none">
                {t("networkProbe.ipv6.technicalDetails")}
              </summary>
              <div className="mt-2 space-y-2">
                {result.message ? (
                  <p className="break-words">
                    <span className="font-medium">{t("networkProbe.ipv6.reason")}:</span>{" "}
                    {result.message}
                  </p>
                ) : null}
                {result.dualStack.detail ? (
                  <p className="break-words">
                    <span className="font-medium">{t("networkProbe.ipv6.dualDetail")}:</span>{" "}
                    {result.dualStack.detail}
                  </p>
                ) : null}
                {result.ndpDetail ? (
                  <p className="break-words">
                    <span className="font-medium">{t("networkProbe.ipv6.ndpDetail")}:</span>{" "}
                    {result.ndpDetail}
                  </p>
                ) : null}
                {result.tracerouteNote ? (
                  <p className="break-words">
                    <span className="font-medium">{t("networkProbe.ipv6.tracerouteNote")}:</span>{" "}
                    {result.tracerouteNote}
                  </p>
                ) : null}
                {result.commandHint ? (
                  <pre className="font-mono break-all whitespace-pre-wrap">
                    {result.commandHint}
                  </pre>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("networkProbe.ipv6.empty")}</p>
      )}
    </ProbePanelShell>
  )
}
