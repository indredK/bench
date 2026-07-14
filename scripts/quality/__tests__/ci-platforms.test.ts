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
})
