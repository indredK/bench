// Contract of the host-side plugin verification runner (T20).
//
// The previous runner reported success whenever the discovery set was empty —
// and since the plugin sources moved to the marketplace repository, that set
// was *always* empty here, so `pnpm run test:extensions` could not fail. These
// cases pin the replacement contract: explicit inputs, real counts, and a
// non-zero exit for every path that verifies nothing.
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

function makeMarket(plugins) {
  const dir = tempDir("bench-market-")
  for (const [id, hasConfig] of Object.entries(plugins)) {
    mkdirSync(join(dir, id), { recursive: true })
    if (hasConfig)
      writeFileSync(join(dir, id, "vitest.config.ts"), "export default { test: { include: [] } }\n")
  }
  return dir
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, BENCH_MARKET_DIR: "", ...(options.env ?? {}) },
  })
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true })
})

describe("plugin verification runner", () => {
  it("refuses to guess a market path", () => {
    const result = run([])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("EXTENSION_MARKET_REQUIRED")
    expect(result.stderr).toContain("--market")
  })

  it("honours BENCH_MARKET_DIR as the explicit alternative to --market", () => {
    const market = makeMarket({})
    const result = run([], { env: { BENCH_MARKET_DIR: market } })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("EXTENSION_ZERO_DISCOVERY")
  })

  it("fails when the market path does not exist", () => {
    const result = run(["--market", join(tmpdir(), "bench-market-does-not-exist")])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("EXTENSION_MARKET_MISSING")
  })

  it("fails on zero discovery instead of reporting success", () => {
    const market = makeMarket({ "no-config-plugin": false })
    const result = run(["--market", market])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("EXTENSION_ZERO_DISCOVERY")
    expect(result.stderr).toMatch(/1 directories inspected/)
  })

  it("fails when --id matches nothing and lists what was discovered", () => {
    const market = makeMarket({ terminology: true })
    const result = run(["--market", market, "--id", "ghost"])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("EXTENSION_NOT_FOUND")
    expect(result.stderr).toContain("terminology")
  })

  it("counts plugins without a test config as skipped instead of ignoring them", () => {
    const market = makeMarket({ configured: true, "no-config": false })
    const result = run(["--market", market, "--json"])
    // The stub config has no tests, so the attempt fails — but the summary must
    // still account for both directories.
    const summary = JSON.parse(result.stdout)
    expect(summary).toMatchObject({ expected: 2, discovered: 1, skipped: 1, failed: 1 })
  })

  it("passes BENCH_MARKET_DIR and BENCH_HOST_DIR to the plugin config", () => {
    const market = makeMarket({ probe: true })
    const host = tempDir("bench-host-")
    const outFile = join(host, "env.json")
    writeFileSync(
      join(market, "probe/vitest.config.ts"),
      `import { writeFileSync } from "node:fs"\n` +
        `writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({ host: process.env.BENCH_HOST_DIR, market: process.env.BENCH_MARKET_DIR }))\n` +
        `export default { test: { include: [] } }\n`,
    )

    run(["--market", market, "--host", host, "--json"])
    expect(existsSync(outFile), "the plugin config must be loaded").toBe(true)
    expect(JSON.parse(readFileSync(outFile, "utf8"))).toEqual({ host, market })
  })
})
