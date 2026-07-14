import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { verifyReleaseAssets } from "../verify-release-assets.mjs"

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

  it("rejects empty artifacts", () => {
    const dir = createFixture()
    fs.writeFileSync(path.join(dir, "darwin-aarch64-Bench.dmg"), "")
    expect(() => verifyReleaseAssets(dir)).toThrow(/empty/)
  })
})
