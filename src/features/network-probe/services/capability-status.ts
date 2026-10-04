const ENABLED_TOOL_STATUSES = new Set(["supported", "partial", "degraded"])

/** A degraded implementation remains runnable; only unsupported or missing tools are blocked. */
export function isNetworkProbeToolEnabled(status: string | undefined): boolean {
  return status !== undefined && ENABLED_TOOL_STATUSES.has(status)
}
