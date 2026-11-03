/**
 * Coming Soon Panel / 规划中占位: 未实现或缺能力包的 L2 的说明与能力包入口.
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { L2_PACK_HINT, POST_L2 } from "@/features/network-probe/probe-catalog"

export function ComingSoonPanel({
  l1,
  l2,
  toolStatus,
  externalTools,
  onManagePacks,
}: {
  l1: string
  l2: string
  toolStatus?: Record<string, string>
  externalTools?: Record<string, string>
  onManagePacks: (packId?: string) => void
}) {
  const { t } = useTranslation()
  const post = POST_L2.has(l2)
  const toolKey =
    l2 === "ports"
      ? "portScan"
      : l2 === "pcap"
        ? "pcap"
        : l2 === "arp"
          ? "arp"
          : l2 === "speed"
            ? "speedTest"
            : null
  const status = toolKey ? toolStatus?.[toolKey] : undefined
  const packId = L2_PACK_HINT[l2]
  const missing = status === "missing_pack"

  return (
    <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-start justify-center gap-2 overflow-auto py-6">
      <p className="text-foreground text-sm font-medium">
        {t(`networkProbe.l1.${l1}`)} / {t(`networkProbe.l2.${l2}`)}
        <span className="text-muted-foreground ml-2 text-[10px] font-bold tracking-wider uppercase">
          {t("networkProbe.badge.planning")}
        </span>
      </p>
      <p className="max-w-md text-sm">
        {post ? t("networkProbe.coming.post") : t("networkProbe.coming.mvp")}
      </p>
      {missing && packId ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("networkProbe.packs.missingHint", { packId })}
        </p>
      ) : null}
      {toolStatus && toolKey ? (
        <p className="font-mono text-xs">
          {toolKey}={status ?? "—"}
          {externalTools?.nmap ? ` · nmap=${externalTools.nmap}` : ""}
        </p>
      ) : toolStatus ? (
        <p className="font-mono text-xs">
          {t("networkProbe.capabilitiesLine", {
            value: Object.entries(toolStatus)
              .map(([k, v]) => `${k}=${v}`)
              .join(", "),
          })}
        </p>
      ) : null}
      <Button type="button" size="sm" variant="outline" onClick={() => onManagePacks(packId)}>
        {t("networkProbe.packs.manage")}
      </Button>
    </div>
  )
}
