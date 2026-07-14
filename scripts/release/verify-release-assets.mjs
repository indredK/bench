import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const requirements = [
  { label: "macOS arm64 DMG", pattern: /^darwin-aarch64-.*\.dmg$/ },
  { label: "macOS x64 DMG", pattern: /^darwin-x86_64-.*\.dmg$/ },
  { label: "Windows MSI", pattern: /^windows-x86_64-.*\.msi$/ },
  { label: "Windows NSIS", pattern: /^windows-x86_64-.*\.exe$/ },
  { label: "macOS arm64 updater", pattern: /^darwin-aarch64-.*\.app\.tar\.gz$/ },
  { label: "macOS x64 updater", pattern: /^darwin-x86_64-.*\.app\.tar\.gz$/ },
  { label: "Windows updater signature", pattern: /^windows-x86_64-.*\.exe\.sig$/ },
  { label: "macOS arm64 updater signature", pattern: /^darwin-aarch64-.*\.app\.tar\.gz\.sig$/ },
  { label: "macOS x64 updater signature", pattern: /^darwin-x86_64-.*\.app\.tar\.gz\.sig$/ },
]

export function verifyReleaseAssets(assetsDir) {
  const files = fs.readdirSync(assetsDir).filter((name) => {
    const stat = fs.statSync(path.join(assetsDir, name))
    return stat.isFile()
  })

  for (const requirement of requirements) {
    const matches = files.filter((name) => requirement.pattern.test(name))
    if (matches.length !== 1) {
      throw new Error(
        `${requirement.label} must have exactly one release asset; found ${matches.length}: ${matches.join(", ") || "none"}`,
      )
    }
  }

  for (const name of files) {
    const size = fs.statSync(path.join(assetsDir, name)).size
    if (size === 0) throw new Error(`Release asset is empty: ${name}`)
  }

  return files.length
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const assetsDir = process.argv[2]
  if (!assetsDir) {
    throw new Error("Usage: node scripts/release/verify-release-assets.mjs <assets-dir>")
  }
  const fileCount = verifyReleaseAssets(assetsDir)
  console.log(`verified ${fileCount} release asset files in ${assetsDir}`)
}
