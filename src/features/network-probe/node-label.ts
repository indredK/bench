import type { ProbeNode } from "@/lib/tauri/types/network-probe"

/** Keep backend node labels canonical while localizing the user-facing local node name. */
export function getProbeNodeDisplayLabel(
  node: Pick<ProbeNode, "kind" | "label">,
  localLabel: string,
): string {
  return node.kind === "local" ? localLabel : node.label
}
