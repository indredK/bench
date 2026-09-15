import { describe, expect, it } from "vitest"

import {
  checkReleaseToolchain,
  findReleaseToolchainViolations,
  readPinnedRustChannel,
} from "../check-release-toolchain.mjs"

const PINNED_CHANNEL = "1.98.1"
const RUST_TOOLCHAIN_ACTION = "dtolnay/rust-toolchain@6bed0761d98439e5a578e2877258200ad565ba87"

function workflow(jobBody: string) {
  return `
on:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: test
  cancel-in-progress: true
jobs:
  release-build:
    runs-on: macos-latest
    timeout-minutes: 90
    strategy:
      matrix:
        include:
          - target: x86_64-apple-darwin
    steps:
${jobBody}
`
}

const VERIFICATION_STEP = `      - name: Verify release target is installed
        shell: bash
        run: |
          rustc --version
          rustup target list --installed
          rustup target list --installed | grep -Fx "$RELEASE_TARGET"
`

function violationsOf(jobBody: string) {
  return findReleaseToolchainViolations("ci-build.yml", workflow(jobBody), {
    pinnedChannel: PINNED_CHANNEL,
  })
}

describe("release rust toolchain guard", () => {
  it("accepts an exact toolchain with target and installed-target assertion", () => {
    const violations = violationsOf(
      `      - name: Setup Rust
        uses: ${RUST_TOOLCHAIN_ACTION} # stable
        with:
          toolchain: ${PINNED_CHANNEL}
          targets: \${{ matrix.target }}
${VERIFICATION_STEP}`,
    )
    expect(violations).toEqual([])
  })

  it("R1 flags a target installed without an explicit toolchain (v1.35.0 defect)", () => {
    const violations = violationsOf(
      `      - name: Setup Rust
        uses: ${RUST_TOOLCHAIN_ACTION} # stable
        with:
          targets: \${{ matrix.target }}
${VERIFICATION_STEP}`,
    )
    expect(violations.map((v) => v.rule)).toEqual(["R1"])
  })

  it("R1 flags a step that omits the toolchain even without targets", () => {
    const violations = violationsOf(
      `      - name: Setup Rust
        uses: ${RUST_TOOLCHAIN_ACTION} # stable
`,
    )
    expect(violations.some((v) => v.rule === "R1")).toBe(true)
  })

  it("R2 flags a toolchain that drifts from rust-toolchain.toml", () => {
    const violations = violationsOf(
      `      - name: Setup Rust
        uses: ${RUST_TOOLCHAIN_ACTION} # stable
        with:
          toolchain: 1.97.0
          targets: \${{ matrix.target }}
${VERIFICATION_STEP}`,
    )
    expect(violations.map((v) => v.rule)).toEqual(["R2"])
  })

  it("R3 flags targets without an installed-target assertion in the same job", () => {
    const violations = violationsOf(
      `      - name: Setup Rust
        uses: ${RUST_TOOLCHAIN_ACTION} # stable
        with:
          toolchain: ${PINNED_CHANNEL}
          targets: \${{ matrix.target }}
      - name: Build
        run: pnpm tauri build
`,
    )
    expect(violations.map((v) => v.rule)).toEqual(["R3"])
  })

  it("ignores rustup assertions that live in another job", () => {
    const content = `${workflow(
      `      - name: Setup Rust
        uses: ${RUST_TOOLCHAIN_ACTION} # stable
        with:
          toolchain: ${PINNED_CHANNEL}
          targets: \${{ matrix.target }}
`,
    )}  verify:
    runs-on: macos-latest
    timeout-minutes: 30
    steps:
${VERIFICATION_STEP}`
    const violations = findReleaseToolchainViolations("ci-build.yml", content, {
      pinnedChannel: PINNED_CHANNEL,
    })
    expect(violations.map((v) => v.rule)).toEqual(["R3"])
  })

  it("the repository workflows pass and the pinned channel is a concrete version", () => {
    expect(checkReleaseToolchain()).toEqual([])
    expect(readPinnedRustChannel()).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
