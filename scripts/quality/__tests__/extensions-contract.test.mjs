// Contract for the Bench entry point that delegates plugin tests to the
// plugin-market runner while keeping Vitest and the one-shot sandbox on host.
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const RUNNER = join(rootDir, "scripts/plugins/test-extensions.mjs")
const tempDirs = []

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function makeMarket({ runner = true } = {}) {
  const root = tempDir("bench-market-")
  mkdirSync(join(root, "extensions"), { recursive: true })
  if (runner) {
    mkdirSync(join(root, "scripts"), { recursive: true })
    writeFileSync(
      join(root, "scripts/test-extensions.mjs"),
      `import { writeFileSync } from "node:fs"\n` +
        `if (process.env.RESULT_FILE) writeFileSync(process.env.RESULT_FILE, JSON.stringify({ args: process.argv.slice(2), host: process.env.BENCH_HOST_DIR, market: process.env.BENCH_MARKET_DIR }))\n` +
        `process.exit(Number(process.env.RUNNER_STATUS ?? 0))\n`,
    )
  }
  return root
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      BENCH_MARKET_DIR: "",
      RESULT_FILE: "",
      RUNNER_STATUS: "0",
      ...(options.env ?? {}),
    },
  })
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true })
})

describe("Bench plugin verification entry point", () => {
  it("requires an explicit plugin source directory", () => {
    const result = run([])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("EXTENSION_MARKET_REQUIRED")
  })

  it("fails when the plugin source directory does not exist", () => {
    const result = run(["--market", join(tmpdir(), "bench-market-does-not-exist", "extensions")])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("EXTENSION_MARKET_MISSING")
  })

  it("fails closed when the plugin-owned runner is missing", () => {
    const market = makeMarket({ runner: false })
    const result = run(["--market", join(market, "extensions")])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("EXTENSION_TEST_RUNNER_MISSING")
  })

  it("passes host, market, plugin id, and JSON mode to the market runner", () => {
    const market = makeMarket()
    const host = tempDir("bench-host-")
    const output = join(host, "delegation.json")
    const result = run(
      ["--market", join(market, "extensions"), "--host", host, "--id", "quick-launch", "--json"],
      { env: { RESULT_FILE: output } },
    )

    expect(result.status).toBe(0)
    expect(existsSync(output)).toBe(true)
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
      args: ["--host", host, "--id", "quick-launch", "--json"],
      host,
      market,
    })
  })

  it("preserves the delegated runner's failing exit status", () => {
    const market = makeMarket()
    const result = run(["--market", join(market, "extensions")], {
      env: { RUNNER_STATUS: "7" },
    })
    expect(result.status).toBe(7)
  })
})
