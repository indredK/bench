/**
 * Release scripts tests / release 聚合脚本测试 (A3-5):
 *   generate-updater-json: 三平台齐全 / 缺平台 / 重复平台 / 重复文件引用 /
 *   notes 与 pub_date 注入; write-updater-manifest: manifest 生成。
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { beforeEach, afterEach, describe, expect, it } from "vitest"
import { generateUpdaterJson } from "../generate-updater-json.mjs"
import { writeUpdaterManifest } from "../write-updater-manifest.mjs"

let tempDir

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-release-test-"))
})

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

function createTargetAssets(dir, { platform, file, signature, target }) {
  fs.writeFileSync(path.join(dir, file), `binary:${platform}`)
  fs.writeFileSync(path.join(dir, signature), `signature:${platform}`)
  fs.writeFileSync(
    path.join(dir, `updater-manifest-${target}.json`),
    JSON.stringify({ platform, file, signature }),
  )
}

function createAllTargets(dir) {
  createTargetAssets(dir, {
    platform: "darwin-aarch64",
    file: "darwin-aarch64-Bench.app.tar.gz",
    signature: "darwin-aarch64-Bench.app.tar.gz.sig",
    target: "aarch64-apple-darwin",
  })
  createTargetAssets(dir, {
    platform: "darwin-x86_64",
    file: "darwin-x86_64-Bench.app.tar.gz",
    signature: "darwin-x86_64-Bench.app.tar.gz.sig",
    target: "x86_64-apple-darwin",
  })
  createTargetAssets(dir, {
    platform: "windows-x86_64",
    file: "windows-x86_64-Bench_1.0.0_x64-setup.exe",
    signature: "windows-x86_64-Bench_1.0.0_x64-setup.exe.sig",
    target: "x86_64-pc-windows-msvc",
  })
}

describe("generateUpdaterJson (A3-5)", () => {
  it("aggregates three platforms, injects notes and pub_date from release metadata", () => {
    createAllTargets(tempDir)

    const latest = generateUpdaterJson({
      assetsDir: tempDir,
      tag: "v2.0.0-rc.1",
      repo: "indredK/bench",
      releaseMetadata: { body: "## Notes", publishedAt: "2026-09-03T00:00:00Z" },
    })

    expect(latest.version).toBe("2.0.0-rc.1")
    expect(latest.notes).toBe("## Notes")
    expect(latest.pub_date).toBe("2026-09-03T00:00:00Z")
    expect(Object.keys(latest.platforms).sort()).toEqual([
      "darwin-aarch64",
      "darwin-x86_64",
      "windows-x86_64",
    ])
    expect(latest.platforms["windows-x86_64"].signature).toBe("signature:windows-x86_64")
    // URL 编码使用 encodeURIComponent 形态。
    expect(latest.platforms["windows-x86_64"].url).toBe(
      "https://github.com/indredK/bench/releases/download/v2.0.0-rc.1/windows-x86_64-Bench_1.0.0_x64-setup.exe",
    )
    expect(fs.existsSync(path.join(tempDir, "latest.json"))).toBe(true)
  })

  it("falls back to empty notes and current pub_date when metadata is thin", () => {
    createAllTargets(tempDir)

    const latest = generateUpdaterJson({
      assetsDir: tempDir,
      tag: "v1.2.3",
      repo: "indredK/bench",
      releaseMetadata: { body: "", publishedAt: "" },
    })

    expect(latest.notes).toBe("")
    expect(latest.pub_date).toBeTruthy()
    expect(latest.version).toBe("1.2.3")
  })

  it("throws when a required platform is missing", () => {
    createTargetAssets(tempDir, {
      platform: "darwin-aarch64",
      file: "a.tar.gz",
      signature: "a.tar.gz.sig",
      target: "aarch64-apple-darwin",
    })

    expect(() =>
      generateUpdaterJson({
        assetsDir: tempDir,
        tag: "v1.0.0",
        repo: "indredK/bench",
        releaseMetadata: { body: "", publishedAt: "" },
      }),
    ).toThrow(/missing required updater platforms/)
  })

  it("throws on duplicate platforms", () => {
    createTargetAssets(tempDir, {
      platform: "darwin-aarch64",
      file: "a.tar.gz",
      signature: "a.tar.gz.sig",
      target: "aarch64-apple-darwin",
    })
    createTargetAssets(tempDir, {
      platform: "darwin-aarch64",
      file: "a2.tar.gz",
      signature: "a2.tar.gz.sig",
      target: "aarch64-apple-darwin-alt",
    })
    createTargetAssets(tempDir, {
      platform: "darwin-x86_64",
      file: "b.tar.gz",
      signature: "b.tar.gz.sig",
      target: "x86_64-apple-darwin",
    })
    createTargetAssets(tempDir, {
      platform: "windows-x86_64",
      file: "c.exe",
      signature: "c.exe.sig",
      target: "x86_64-pc-windows-msvc",
    })

    expect(() =>
      generateUpdaterJson({
        assetsDir: tempDir,
        tag: "v1.0.0",
        repo: "indredK/bench",
        releaseMetadata: { body: "", publishedAt: "" },
      }),
    ).toThrow(/Duplicate updater platform/)
  })

  it("throws when two platforms reference the same updater file", () => {
    createTargetAssets(tempDir, {
      platform: "darwin-aarch64",
      file: "same.tar.gz",
      signature: "same.tar.gz.sig",
      target: "aarch64-apple-darwin",
    })
    createTargetAssets(tempDir, {
      platform: "darwin-x86_64",
      file: "same.tar.gz",
      signature: "same-x64.tar.gz.sig",
      target: "x86_64-apple-darwin",
    })
    createTargetAssets(tempDir, {
      platform: "windows-x86_64",
      file: "c.exe",
      signature: "c.exe.sig",
      target: "x86_64-pc-windows-msvc",
    })

    expect(() =>
      generateUpdaterJson({
        assetsDir: tempDir,
        tag: "v1.0.0",
        repo: "indredK/bench",
        releaseMetadata: { body: "", publishedAt: "" },
      }),
    ).toThrow(/referenced by both/)
  })

  it("throws when a referenced asset or signature file is missing", () => {
    // 仅写 manifest, 不写其引用的 asset/signature → 引用缺失必须抛错。
    fs.writeFileSync(
      path.join(tempDir, "updater-manifest-aarch64-apple-darwin.json"),
      JSON.stringify({
        platform: "darwin-aarch64",
        file: "missing-asset.tar.gz",
        signature: "missing-asset.tar.gz.sig",
      }),
    )

    expect(() =>
      generateUpdaterJson({
        assetsDir: tempDir,
        tag: "v1.0.0",
        repo: "indredK/bench",
        releaseMetadata: { body: "", publishedAt: "" },
      }),
    ).toThrow(/Updater asset not found/)
  })
})

describe("writeUpdaterManifest (A3-5)", () => {
  it("writes a manifest keyed by target with basename references", () => {
    const manifest = writeUpdaterManifest({
      outputDir: tempDir,
      platform: "darwin-aarch64",
      file: `${tempDir}/nested/Bench.app.tar.gz`,
      signature: `${tempDir}/nested/Bench.app.tar.gz.sig`,
      target: "aarch64-apple-darwin",
    })

    expect(manifest).toEqual({
      platform: "darwin-aarch64",
      file: "Bench.app.tar.gz",
      signature: "Bench.app.tar.gz.sig",
    })
    const written = JSON.parse(
      fs.readFileSync(path.join(tempDir, "updater-manifest-aarch64-apple-darwin.json"), "utf8"),
    )
    expect(written).toEqual(manifest)
  })

  it("defaults the manifest target key to the platform", () => {
    writeUpdaterManifest({
      outputDir: tempDir,
      platform: "windows-x86_64",
      file: "Bench.exe",
      signature: "Bench.exe.sig",
    })
    expect(fs.existsSync(path.join(tempDir, "updater-manifest-windows-x86_64.json"))).toBe(true)
  })

  it("throws when required arguments are missing", () => {
    expect(() => writeUpdaterManifest({ outputDir: tempDir })).toThrow(/Usage/)
  })
})
