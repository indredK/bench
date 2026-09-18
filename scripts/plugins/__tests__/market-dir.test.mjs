/**
 * Test / 测试: market-dir 解析器（build/sync/stage 共用输入约定）。
 */
import { afterAll, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { resolveMarketDir } from "../lib/market-dir.mjs"

const SAVED_ENV = process.env.BENCH_MARKET_DIR

afterAll(() => {
  if (SAVED_ENV === undefined) delete process.env.BENCH_MARKET_DIR
  else process.env.BENCH_MARKET_DIR = SAVED_ENV
})

function makeDirWith(footer) {
  return mkdtempSync(join(tmpdir(), `market-dir-${footer}-`))
}

describe("resolveMarketDir", () => {
  it("prioritizes --market flag over env and legacy cwd/extensions", () => {
    const market = makeDirWith("flag")
    const legacy = makeDirWith("legacy")
    mkdirSync(join(legacy, "extensions"))
    process.env.BENCH_MARKET_DIR = "/nonexistent/env-path"

    const result = resolveMarketDir(["node", "script.mjs", "--market", market], legacy)
    expect(result.source).toBe("flag")
    expect(result.dir).toBe(market)
    expect(result.missing).toBe(false)
    delete process.env.BENCH_MARKET_DIR
  })

  it("falls back to BENCH_MARKET_DIR when no flag is given", () => {
    const market = makeDirWith("env")
    process.env.BENCH_MARKET_DIR = market
    const result = resolveMarketDir(["node", "script.mjs"], makeDirWith("cwd"))
    expect(result.source).toBe("env")
    expect(result.dir).toBe(market)
    delete process.env.BENCH_MARKET_DIR
  })

  it("fails closed when an explicit input points to a missing directory", () => {
    const result = resolveMarketDir(
      ["node", "script.mjs", "--market", "/nonexistent/market-path"],
      makeDirWith("missing"),
    )
    expect(result.source).toBe("flag")
    expect(result.dir).toBeNull()
    expect(result.missing).toBe(true)
  })

  it("treats a dangling --market value as missing input", () => {
    const result = resolveMarketDir(["node", "script.mjs", "--market"], makeDirWith("dangling"))
    expect(result.source).toBe("flag")
    expect(result.dir).toBeNull()
    expect(result.missing).toBe(true)
  })

  it("uses legacy cwd/extensions when nothing else is available", () => {
    delete process.env.BENCH_MARKET_DIR
    const cwd = makeDirWith("legacy")
    mkdirSync(join(cwd, "extensions"))
    const result = resolveMarketDir(["node", "script.mjs"], cwd)
    expect(result.source).toBe("legacy")
    expect(result.dir).toBe(join(cwd, "extensions"))
  })

  it("returns null source when nothing resolves", () => {
    delete process.env.BENCH_MARKET_DIR
    const cwd = makeDirWith("empty")
    const result = resolveMarketDir(["node", "script.mjs"], cwd)
    expect(result.source).toBeNull()
    expect(result.dir).toBeNull()
    expect(result.missing).toBe(false)
  })
})
