export function capabilityPlatformLabelKey(platform: string): string {
  switch (platform) {
    case "macos":
      return "networkProbe.caps.platform.macos"
    case "windows":
      return "networkProbe.caps.platform.windows"
    case "linux":
      return "networkProbe.caps.platform.linux"
    default:
      return "networkProbe.caps.platform.unknown"
  }
}

export function capabilityPrivilegeLabelKey(privilege: string): string {
  switch (privilege) {
    case "none":
      return "networkProbe.caps.privilege.none"
    case "user":
      return "networkProbe.caps.privilege.user"
    case "admin":
    case "root":
    case "elevated":
      return "networkProbe.caps.privilege.elevated"
    default:
      return "networkProbe.caps.privilege.unknown"
  }
}
