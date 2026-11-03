/**
 * Probe Header / 网络探测标题栏: 标题副标题 | 五个 L1 | 探测原点 + 能力包.
 */
import { useTranslation } from "react-i18next"
import { PageHeader, PageTabs } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { L1_IDS, type NetworkProbeL1Id } from "@/features/network-probe/probe-catalog"

export interface ProbeNodeOption {
  id: string
  label: string
  kind: string
}

export function ProbeHeader({
  l1,
  onSelectL1,
  nodes,
  activeNodeId,
  onManagePacks,
}: {
  l1: NetworkProbeL1Id
  onSelectL1: (id: NetworkProbeL1Id) => void
  nodes: ProbeNodeOption[]
  activeNodeId: string
  onManagePacks: () => void
}) {
  const { t } = useTranslation()
  return (
    <PageHeader
      title={t("networkProbe.title")}
      subtitle={t("networkProbe.headerSubtitle")}
      nav={
        <PageTabs
          ariaLabel={t("networkProbe.nav.l1")}
          value={l1}
          onChange={onSelectL1}
          items={L1_IDS.map((id) => ({ id, label: t(`networkProbe.l1.${id}`) }))}
        />
      }
      actions={
        <>
          {/* 探测原点当前只有本机可选: 非 local 项标 disabled 并提示尚未实现, 避免「选了却仍本机跑」的假连接。 */}
          <Select value={activeNodeId}>
            <TooltipProvider delay={280}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-[9rem] shrink-0"
                    aria-label={t("networkProbe.nodeSelect.label")}
                  >
                    <SelectValue placeholder={t("networkProbe.nodeSelect.label")} />
                  </SelectTrigger>
                </TooltipTrigger>
                <TooltipContent className="text-[11px]">
                  {t("networkProbe.nodeSelect.localOnlyHint")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <SelectContent>
              {nodes.map((n) => {
                const pending = n.kind !== "local"
                return (
                  <SelectItem key={n.id} value={n.id} disabled={pending}>
                    {n.label}
                    {pending ? (
                      <span className="text-muted-foreground ml-1 text-[10px] font-bold tracking-wider uppercase">
                        {t("networkProbe.badge.planning")}
                      </span>
                    ) : null}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={onManagePacks}>
            {t("networkProbe.packs.manage")}
          </Button>
        </>
      }
    />
  )
}
