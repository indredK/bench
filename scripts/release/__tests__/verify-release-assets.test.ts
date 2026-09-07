import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { verifyReleaseAssets, windowsRequirementsEnabled } from "../verify-release-assets.mjs"

const ASSET_NAMES = [
  "darwin-aarch64-Bench.dmg",
  "darwin-x86_64-Bench.dmg",
  "windows-x86_64-Bench.msi",
  "windows-x86_64-Bench.exe",
  "darwin-aarch64-Bench.app.tar.gz",
  "darwin-x86_64-Bench.app.tar.gz",
  "windows-x86_64-Bench.exe.sig",
  "darwin-aarch64-Bench.app.tar.gz.sig",
  "darwin-x86_64-Bench.app.tar.gz.sig",
  "OS-SIGNING-NOTICE.txt",
] as const

const tempDirs: string[] = []

function createFixture(names: readonly string[] = ASSET_NAMES) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-release-assets-"))
  tempDirs.push(dir)
  for (const name of names) fs.writeFileSync(path.join(dir, name), "fixture")
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("verifyReleaseAssets", () => {
  it("accepts exactly one required installer and updater per target", () => {
    expect(verifyReleaseAssets(createFixture())).toBe(ASSET_NAMES.length)
  })

  it("fails closed when a target installer is missing", () => {
    const names = ASSET_NAMES.filter((name) => name !== "windows-x86_64-Bench.msi")
    expect(() => verifyReleaseAssets(createFixture(names))).toThrow(/Windows MSI/)
  })

  it("allows macOS-only assets when Windows release builds are disabled (D-021)", () => {
    const names = ASSET_NAMES.filter((name) => !name.startsWith("windows-"))
    expect(verifyReleaseAssets(createFixture(names), { requireWindows: false })).toBe(names.length)
  })

  it("still requires macOS assets when only Windows requirements are skipped", () => {
    const names = ASSET_NAMES.filter((name) => name !== "darwin-x86_64-Bench.dmg")
    expect(() => verifyReleaseAssets(createFixture(names), { requireWindows: false })).toThrow(
      /macOS x64 DMG/,
    )
  })

  it("treats BENCH_RELEASE_WINDOWS_DISABLED as fail-closed by default (D-021)", () => {
    expect(windowsRequirementsEnabled({})).toBe(true)
    expect(windowsRequirementsEnabled({ BENCH_RELEASE_WINDOWS_DISABLED: "false" })).toBe(true)
    expect(windowsRequirementsEnabled({ BENCH_RELEASE_WINDOWS_DISABLED: "true" })).toBe(false)
    expect(windowsRequirementsEnabled({ BENCH_RELEASE_WINDOWS_DISABLED: "1" })).toBe(false)
  })

  it("fails closed when the OS signing notice is missing (A3-6)", () => {
    const names = ASSET_NAMES.filter((name) => name !== "OS-SIGNING-NOTICE.txt")
    expect(() => verifyReleaseAssets(createFixture(names))).toThrow(/OS signing notice/)
  })

  it("rejects empty artifacts", () => {
    const dir = createFixture()
    fs.writeFileSync(path.join(dir, "darwin-aarch64-Bench.dmg"), "")
    expect(() => verifyReleaseAssets(dir)).toThrow(/empty/)
  })
})
