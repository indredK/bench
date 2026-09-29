import type { GlobalpingMeasurementType } from "@/lib/tauri/types/network-probe"

function parseHttpTarget(rawTarget: string): URL | null {
  try {
    const url = new URL(rawTarget.trim())
    if (
      !(url.protocol === "http:" || url.protocol === "https:") ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return null
    }
    return url
  } catch {
    return null
  }
}

function getHttpTargetPath(url: URL): string {
  return url.pathname === "/" ? "" : url.pathname
}

/** Normalize targets used for equality; HTTP query strings remain significant. */
export function getProbeMeasurementTargetKey(
  measurementType: GlobalpingMeasurementType,
  rawTarget: string,
): string | null {
  const target = rawTarget.trim()
  if (!target) return null

  if (measurementType === "http") {
    const url = parseHttpTarget(target)
    if (!url) return null
    return `${url.protocol}//${url.host.toLowerCase()}${getHttpTargetPath(url)}${url.search}`
  }

  try {
    const authority = target.includes(":") && !target.startsWith("[") ? `[${target}]` : target
    const url = new URL(`http://${authority}/`)
    if (
      !url.hostname ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.port
    ) {
      return null
    }
    return url.hostname.toLowerCase().replace(/\.$/u, "")
  } catch {
    return null
  }
}

/** Return a safe label; HTTP queries are sent to providers but never displayed. */
export function getProbeMeasurementTargetDisplay(
  measurementType: GlobalpingMeasurementType,
  rawTarget: string,
): string | null {
  if (measurementType === "http") {
    const url = parseHttpTarget(rawTarget)
    return url ? `${url.protocol}//${url.host.toLowerCase()}${getHttpTargetPath(url)}` : null
  }
  return getProbeMeasurementTargetKey(measurementType, rawTarget)
}

export function isMatchingProbeMeasurement(
  measurement: { measurementType: GlobalpingMeasurementType; target: string },
  measurementType: GlobalpingMeasurementType,
  target: string,
) {
  const targetKey = getProbeMeasurementTargetKey(measurementType, target)
  return (
    targetKey !== null &&
    measurement.measurementType === measurementType &&
    getProbeMeasurementTargetKey(measurement.measurementType, measurement.target) === targetKey
  )
}
