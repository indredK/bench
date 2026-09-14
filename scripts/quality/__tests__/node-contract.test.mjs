// The host runtime contract must stay aligned across three places that CI and
// contributors read independently: package.json engines, .node-version and the
// constants the bootstrap scripts use. A drift here is invisible until someone
// on the minimum runtime hits a confusing failure, so it is asserted instead.
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import {
  MIN_NODE,
  MIN_NODE_SPEC,
  NODE_UNSUPPORTED,
  TARGET_NODE,
  assertSupportedNode,
  compareNodeVersion,
  isSupportedNode,
  parseNodeVersion,
} from "../../lib/node-contract.mjs"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

describe("host node contract", () => {
  it("parses and orders versions", () => {
    expect(parseNodeVersion("v26.8.2")).toEqual({ major: 26, minor: 8, patch: 2 })
    expect(parseNodeVersion("nonsense")).toBeNull()
    expect(compareNodeVersion(parseNodeVersion("24.15.0"), MIN_NODE)).toBe(0)
    expect(compareNodeVersion(parseNodeVersion("24.14.9"), MIN_NODE)).toBeLessThan(0)
  })

  it("draws the boundary at the declared minimum", () => {
    expect(isSupportedNode("24.15.0")).toBe(true)
    expect(isSupportedNode("24.14.99")).toBe(false)
    expect(isSupportedNode("22.23.1")).toBe(false)
    expect(isSupportedNode("26.8.2")).toBe(true)
  })

  it("emits a stable diagnostic for an unsupported runtime", () => {
    expect(() => assertSupportedNode("v20.11.1")).toThrowError(
      `${NODE_UNSUPPORTED}: require ${MIN_NODE_SPEC}; got v20.11.1`,
    )
    try {
      assertSupportedNode("v20.11.1")
    } catch (error) {
      expect(error.code).toBe(NODE_UNSUPPORTED)
      expect(error.hint).toMatch(/\.node-version/)
    }
  })

  it("agrees with package.json and .node-version", () => {
    const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"))
    expect(pkg.engines.node).toBe(MIN_NODE_SPEC)
    expect(readFileSync(path.join(rootDir, ".node-version"), "utf8").trim()).toBe(TARGET_NODE)
  })

  it("keeps @types/node on the minimum supported major", () => {
    const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"))
    // Types must describe the *oldest* supported runtime, not the developer's
    // machine: a Node 26-only API would otherwise typecheck and fail in CI.
    expect(pkg.devDependencies["@types/node"]).toMatch(/^\^24\./)
  })

  it("checks the runtime before importing dependencies in the entry scripts", () => {
    for (const entry of ["scripts/bootstrap/setup.mjs", "scripts/bootstrap/menu.mjs"]) {
      const source = readFileSync(path.join(rootDir, entry), "utf8")
      const check = source.indexOf("assertSupportedNode()")
      expect(check, `${entry} must call assertSupportedNode()`).toBeGreaterThan(-1)
      const clack = source.indexOf('"@clack/prompts"')
      if (clack > -1) expect(check, `${entry} must check the runtime first`).toBeLessThan(clack)
    }
  })
})
