/**
 * Probe nodes come from Rust with locale-independent display metadata. Keep
 * custom agent labels intact, but render the built-in local node through i18n.
 */
export function getProbeNodeDisplayLabel(
  kind: string | undefined,
  backendLabel: string,
  localLabel: string,
): string {
  return kind === "local" ? localLabel : backendLabel
}
