/**
 * Map virtual overscroll distance to edge-glow opacity (soft curve, no content displacement).
 */
export function edgeGlowOpacity(signedOverscroll: number, viewportSize: number): number {
  const x = Math.abs(signedOverscroll)
  if (x <= 0) return 0
  const d = Math.max(viewportSize, 1)
  const normalized = x / (d * 0.22)
  return Math.min(0.72, Math.pow(normalized, 0.6))
}
