export function appBundleDisplayName(installPath: string): string {
  const base = installPath.split("/").filter(Boolean).pop() ?? installPath
  return base.endsWith(".app") ? base.slice(0, -4) : base
}

export function formatMacAppAuthorizeCommand(installPath: string): string {
  return `xattr -cr ${JSON.stringify(installPath)}`
}

export function isMacAppBundlePath(path: string): boolean {
  return path.endsWith(".app")
}
