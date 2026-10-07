import { useTranslation } from "react-i18next"
import type { ProbeNode } from "@/lib/tauri/types/network-probe"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getProbeNodeDisplayLabel } from "@/features/network-probe/utils/probe-node-label"

interface ProbeOriginSelectorProps {
  nodes: ProbeNode[]
  activeNode: ProbeNode | undefined
}

export function ProbeOriginSelector({ nodes, activeNode }: ProbeOriginSelectorProps) {
  const { t } = useTranslation()

  return (
    <Select value={activeNode?.id ?? "local"}>
      <TooltipProvider delay={280}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SelectTrigger
              size="sm"
              className="h-8 w-[9.5rem] shrink-0"
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
        {nodes.map((node) => {
          const pending = node.kind !== "local"
          return (
            <SelectItem key={node.id} value={node.id} disabled={pending}>
              {getProbeNodeDisplayLabel(node.kind, node.label, t("networkProbe.nodeSelect.local"))}
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
  )
}
