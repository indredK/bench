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
import { hasOwnTranslationKey } from "@/features/network-probe/utils/translation-key"

interface ProbeOriginSelectorProps {
  nodes: ProbeNode[]
  activeNode: ProbeNode | undefined
  remoteEnabled?: boolean
  disabled?: boolean
  onChange?: (nodeId: string) => void
}

export function ProbeOriginSelector({
  nodes,
  activeNode,
  remoteEnabled = false,
  disabled = false,
  onChange,
}: ProbeOriginSelectorProps) {
  const { t } = useTranslation()

  return (
    <Select value={activeNode?.id ?? "local"} onValueChange={onChange} disabled={disabled}>
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
            {t(
              !remoteEnabled
                ? "networkProbe.nodeSelect.localOnlyHint"
                : activeNode?.kind === "remote-proxy"
                  ? "networkProbe.nodeSelect.remoteHint"
                  : "networkProbe.nodeSelect.localSelectedHint",
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <SelectContent>
        {nodes.map((node) => {
          const isGlobalping = node.kind === "remote-proxy"
          const isAgent = node.kind === "remote-agent"
          const disabled = node.kind !== "local" && (!isGlobalping || !remoteEnabled)
          return (
            <SelectItem key={node.id} value={node.id} disabled={disabled}>
              {getProbeNodeDisplayLabel(
                node.kind,
                node.label,
                t("networkProbe.nodeSelect.local"),
                isGlobalping
                  ? hasOwnTranslationKey(
                      `networkProbe.globalping.locations.${node.region ?? "world"}`,
                    )
                    ? t(`networkProbe.globalping.locations.${node.region ?? "world"}`, {
                        defaultValue: node.label,
                      })
                    : node.label
                  : undefined,
              )}
              {isAgent ? (
                <span className="text-muted-foreground ml-1 text-[10px] font-bold tracking-wider uppercase">
                  {t("networkProbe.badge.planning")}
                </span>
              ) : isGlobalping && !remoteEnabled ? (
                <span className="text-muted-foreground ml-1 text-[10px] font-medium">
                  {t("networkProbe.nodeSelect.remoteScope")}
                </span>
              ) : null}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
