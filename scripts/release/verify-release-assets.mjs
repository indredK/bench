import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const requirements = [
  { label: "macOS arm64 DMG", pattern: /^darwin-aarch64-.*\.dmg$/ },
  { label: "macOS x64 DMG", pattern: /^darwin-x86_64-.*\.dmg$/ },
  { label: "Windows MSI", pattern: /^windows-x86_64-.*\.msi$/, windows: true },
  { label: "Windows NSIS", pattern: /^windows-x86_64-.*\.exe$/, windows: true },
  { label: "macOS arm64 updater", pattern: /^darwin-aarch64-.*\.app\.tar\.gz$/ },
  { label: "macOS x64 updater", pattern: /^darwin-x86_64-.*\.app\.tar\.gz$/ },
  { label: "Windows updater signature", pattern: /^windows-x86_64-.*\.exe\.sig$/, windows: true },
  { label: "macOS arm64 updater signature", pattern: /^darwin-aarch64-.*\.app\.tar\.gz\.sig$/ },
  { label: "macOS x64 updater signature", pattern: /^darwin-x86_64-.*\.app\.tar\.gz\.sig$/ },
  // A3-6: 签名声明文件在 verify 之前写入, 必须纳入必需清单 fail-closed 校验。
  { label: "OS signing notice", pattern: /^OS-SIGNING-NOTICE\.txt$/ },
]

// D-021: Windows release builds are temporarily disabled in CI; when
// `BENCH_RELEASE_WINDOWS_DISABLED` is set, windows-x86_64 assets are not
// produced and their requirements are skipped. Default (unset) still
// requires them so re-enabling Windows CI restores fail-closed strictness.
/**
 * @param {Record<string, string | undefined>} [env=process.env]
 * @returns {boolean}
 */
export function windowsRequirementsEnabled(env = process.env) {
  const flag = env.BENCH_RELEASE_WINDOWS_DISABLED
  return flag !== "true" && flag !== "1"
}

/**
 * @param {string} assetsDir
 * @param {object} [options]
 * @param {boolean} [options.requireWindows=true] D-021: Windows CI 暂停时传 false。
 * @returns {number} 校验通过的 release asset 文件总数
 */
export function verifyReleaseAssets(assetsDir, { requireWindows = true } = {}) {
  const files = fs.readdirSync(assetsDir).filter((name) => {
    const stat = fs.statSync(path.join(assetsDir, name))
    return stat.isFile()
  })

  const activeRequirements = requireWindows
    ? requirements
    : requirements.filter((requirement) => !requirement.windows)

  for (const requirement of activeRequirements) {
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
  const fileCount = verifyReleaseAssets(assetsDir, {
    requireWindows: windowsRequirementsEnabled(),
  })
  console.log(`verified ${fileCount} release asset files in ${assetsDir}`)
}
