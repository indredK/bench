export function getPingSampleErrorKey(error: string | undefined): string {
  switch (error) {
    case "timeout":
      return "networkProbe.ping.sampleError.timeout"
    case "permission_denied":
      return "networkProbe.ping.sampleError.permissionDenied"
    case "network_error":
      return "networkProbe.ping.sampleError.networkError"
    default:
      return "networkProbe.ping.sampleError.unknown"
  }
}

export function isKnownPingSampleError(error: string | undefined): boolean {
  return error === "timeout" || error === "permission_denied" || error === "network_error"
}
