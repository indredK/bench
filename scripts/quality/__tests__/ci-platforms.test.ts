import { describe, expect, it } from "vitest"

import { findForbiddenCiPlatforms } from "../check-ci-platforms.mjs"

describe("CI platform guard", () => {
  it("accepts macOS and Windows runners", () => {
    const workflow = `
jobs:
  verify:
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: \${{ matrix.os }}
`

    expect(findForbiddenCiPlatforms("ci.yml", workflow)).toEqual([])
  })

  it.each(["ubuntu-latest", "runner.os == 'Linux'", "bundle.AppImage", "package.deb"])(
    "rejects unsupported CI marker %s",
    (marker) => {
      const violations = findForbiddenCiPlatforms("ci.yml", `runs-on: ${marker}`)
      expect(violations.length).toBeGreaterThan(0)
    },
  )

  it("T27.1: allows ubuntu only inside the e2e-critical job", () => {
    const workflow = `jobs:
  rust:
    runs-on: macos-latest
  e2e-critical:
    # 只跑 viewport-1280 关键流（Ubuntu + Chromium，成本可控）。
    name: E2E (critical, ubuntu chromium)
    runs-on: ubuntu-latest
    steps:
      - run: pnpm exec playwright install --with-deps chromium
  release-build:
    runs-on: macos-latest
`
    expect(findForbiddenCiPlatforms("ci-build.yml", workflow)).toEqual([])
  })

  it("T27.1: ubuntu outside e2e-critical stays rejected", () => {
    const workflow = `jobs:
  e2e-critical:
    runs-on: ubuntu-latest
  release-build:
    runs-on: ubuntu-latest
`
    const violations = findForbiddenCiPlatforms("ci-build.yml", workflow)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0].line).toBeGreaterThan(0)
  })
})
