/** Appearance preference stored locally; only bounded raster data URLs are accepted. */
export const BACKGROUND_STORAGE_KEY = "appearanceBackground"
export const BACKGROUND_EVENT = "appearance-background-change"
export const MAX_BACKGROUND_BYTES = 1024 * 1024

export type AppearanceBackground =
  { kind: "default" } | { kind: "color"; value: string } | { kind: "image"; value: string }

export const DEFAULT_BACKGROUND: AppearanceBackground = { kind: "default" }

export function parseBackground(raw: string | null): AppearanceBackground {
  if (!raw) return DEFAULT_BACKGROUND
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object") return DEFAULT_BACKGROUND
    const candidate = value as { kind?: unknown; value?: unknown }
    if (
      candidate.kind === "color" &&
      typeof candidate.value === "string" &&
      /^#[\da-f]{6}$/i.test(candidate.value)
    ) {
      return { kind: "color", value: candidate.value }
    }
    if (
      candidate.kind === "image" &&
      typeof candidate.value === "string" &&
      candidate.value.length <= 1_400_000 &&
      /^data:image\/(?:png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(candidate.value)
    ) {
      return { kind: "image", value: candidate.value }
    }
  } catch {
    // Invalid or legacy preferences fall back to the default.
  }
  return DEFAULT_BACKGROUND
}

export function readBackground(): AppearanceBackground {
  try {
    return parseBackground(window.localStorage.getItem(BACKGROUND_STORAGE_KEY))
  } catch {
    return DEFAULT_BACKGROUND
  }
}

/** Return false when the browser cannot persist the preference. */
export function saveBackground(value: AppearanceBackground): boolean {
  try {
    const serialized = JSON.stringify(value)
    window.localStorage.setItem(BACKGROUND_STORAGE_KEY, serialized)
    if (window.localStorage.getItem(BACKGROUND_STORAGE_KEY) !== serialized) return false
    window.dispatchEvent(new Event(BACKGROUND_EVENT))
    return true
  } catch {
    return false
  }
}
