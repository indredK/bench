import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// 直接导入被测模块。commandExists 的用例跑真实进程（行为在 Windows/POSIX
// 上断言一致），纯函数用例（needsCmdShell / toSpawnArgs / resolveBinPath /
// resolvePackageManager）不依赖 child_process。
import {
  commandExists,
  IS_WINDOWS,
  needsCmdShell,
  resolveBinPath,
  resolvePackageManager,
  toSpawnArgs,
} from "../../lib/platform.mjs"

describe("needsCmdShell", () => {
  it("targets .cmd/.bat only on Windows (capability detection)", () => {
    if (!IS_WINDOWS) {
      expect(needsCmdShell("pnpm.cmd")).toBe(false)
      return
    }
    expect(needsCmdShell("pnpm.cmd")).toBe(true)
    expect(needsCmdShell("tool.BAT")).toBe(true)
    expect(needsCmdShell("git")).toBe(false)
    expect(needsCmdShell("node.exe")).toBe(false)
  })
})

describe("toSpawnArgs", () => {
  it("wraps .cmd targets with cmd.exe /d /s /c on Windows", () => {
    const { file, args } = toSpawnArgs("pnpm.cmd", ["install", "--frozen-lockfile"])
    if (IS_WINDOWS) {
      expect(file).toBe("cmd.exe")
      expect(args).toEqual(["/d", "/s", "/c", "pnpm.cmd install --frozen-lockfile"])
    } else {
      expect(file).toBe("pnpm.cmd")
      expect(args).toEqual(["install", "--frozen-lockfile"])
    }
  })

  it("quotes args containing spaces on Windows (regression: DEP0190)", () => {
    const { file, args } = toSpawnArgs("vite.cmd", [
      "build",
      "--config",
      "my plugin/vite.config.ts",
    ])
    if (IS_WINDOWS) {
      expect(file).toBe("cmd.exe")
      expect(args).toEqual(["/d", "/s", "/c", 'vite.cmd build --config "my plugin/vite.config.ts"'])
    } else {
      expect(file).toBe("vite.cmd")
      expect(args).toEqual(["build", "--config", "my plugin/vite.config.ts"])
    }
  })

  it("leaves real executables untouched", () => {
    const { file, args } = toSpawnArgs("git", ["status", "--porcelain"])
    expect(file).toBe("git")
    expect(args).toEqual(["status", "--porcelain"])
  })
})

describe("resolveBinPath", () => {
  it("resolves the platform-appropriate .bin entry", () => {
    const base = mkdtempSync(path.join(tmpdir(), "platform-lib-"))
    try {
      const expected = IS_WINDOWS ? path.join(base, "vite.cmd") : path.join(base, "vite")
      expect(resolveBinPath(base, "vite")).toBe(expected)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})

describe("resolvePackageManager", () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "platform-lib-pm-"))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("parses the packageManager field and appends .cmd on Windows", () => {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ packageManager: "pnpm@11.8.0" }))
    expect(resolvePackageManager(dir, { bare: true })).toBe("pnpm")
    expect(resolvePackageManager(dir)).toBe(IS_WINDOWS ? "pnpm.cmd" : "pnpm")
  })

  it("falls back to npm when the field is missing or invalid", () => {
    writeFileSync(path.join(dir, "package.json"), "{}")
    expect(resolvePackageManager(dir, { bare: true })).toBe("npm")
    writeFileSync(path.join(dir, "package.json"), "not json")
    expect(resolvePackageManager(dir, { bare: true })).toBe("npm")
  })
})

describe("commandExists (real probes)", () => {
  it("returns true for a command that is guaranteed present", () => {
    expect(commandExists("node")).toBe(true)
  })

  it("returns false for a missing command without a shell-script extension", () => {
    expect(commandExists("definitely-missing-cmd-xyz-123")).toBe(false)
  })

  it("returns false for a missing .cmd target on both platforms (regression)", () => {
    // Windows: cmd.exe 包装下 error 恒为 null，只能靠退出码判定（旧实现
    // 在此路径恒返回 true）。POSIX: 直接 spawn 无此文件 → ENOENT。
    expect(commandExists("definitely-missing-cmd-xyz-123.cmd")).toBe(false)
  })
})
