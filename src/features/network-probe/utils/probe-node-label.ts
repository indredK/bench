import type { TFunction } from "i18next"
import type { ProbeNode } from "@/lib/tauri/types/network-probe"

const GLOBALPING_REGION_LABEL_KEYS: Record<string, string> = {
  world: "networkProbe.nodes.locationWorld",
  US: "networkProbe.nodes.locationUs",
  Europe: "networkProbe.nodes.locationEurope",
  Asia: "networkProbe.nodes.locationAsia",
}

export function getProbeNodeDisplayLabel(node: ProbeNode, t: TFunction) {
  if (node.kind === "local") return t("networkProbe.nodes.localNode")

  if (node.kind === "remote-proxy" && node.region) {
    const regionLabelKey = GLOBALPING_REGION_LABEL_KEYS[node.region]
    if (regionLabelKey) {
      return t("networkProbe.nodes.globalpingNode", { location: t(regionLabelKey) })
    }
  }

  return node.label
}
