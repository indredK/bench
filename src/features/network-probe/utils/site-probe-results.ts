import type { SiteSampleResult, SitesProbeResult } from "@/lib/tauri/types/network-probe"
import type { SiteProbeResultOwner } from "@/features/network-probe/store"

export function selectSiteProbePanelResults(
  resultOwner: SiteProbeResultOwner,
  panel: SiteProbeResultOwner,
  result: SitesProbeResult | null,
  streaming: SiteSampleResult[],
) {
  return resultOwner === panel ? { result, streaming } : { result: null, streaming: [] }
}
