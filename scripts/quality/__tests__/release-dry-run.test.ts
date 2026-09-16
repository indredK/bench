import { describe, expect, it } from "vitest"

import { findDryRunViolations } from "../check-release-dry-run.mjs"

function publishJob(steps: string) {
  return `
on:
  push:
    tags:
      - "v[0-9]+.[0-9]+.[0-9]+*"
permissions:
  contents: read
concurrency:
  group: test
  cancel-in-progress: true
jobs:
  publish:
    runs-on: macos-latest
    timeout-minutes: 40
    steps:
${steps}
`
}

const GUARDED = `      - name: Publish guard
        if: env.DRY_RUN == 'false'
        run: |
          if [[ "$FINAL_TAG" != "true" ]]; then
            echo "::error::Refusing to publish: tag '$TAG_NAME' is not a final vX.Y.Z tag."
            exit 1
          fi
`

const UNGUARDED = `      - name: Publish guard
        run: |
          if [[ "$DRY_RUN" != "false" ]]; then
            echo "::error::Refusing to mutate GitHub Releases in dry-run mode."
            exit 1
          fi
`

const RELEASE_WRITE = `      - name: Create or update GitHub Release
        if: env.DRY_RUN == 'false'
        env:
          GH_TOKEN: \${{ secrets.RELEASE_PLEASE_TOKEN || github.token }}
        run: |
          gh release create "$TAG_NAME" release-assets/*
`

describe("release dry-run semantics guard", () => {
  it("accepts a guarded Publish guard and gated release write", () => {
    const workflow = publishJob(`${GUARDED}\n${RELEASE_WRITE}`)
    expect(findDryRunViolations("ci-build.yml", workflow)).toEqual([])
  })

  it("R1 flags an unconditional Publish guard (v1.35.1 defect, run #589)", () => {
    const workflow = publishJob(UNGUARDED)
    const violations = findDryRunViolations("ci-build.yml", workflow)
    expect(violations.map((v) => v.rule)).toEqual(["R1"])
  })

  it("R2 flags an ungated release write step", () => {
    const workflow = publishJob(`      - name: Create or update GitHub Release
        run: |
          gh release create "$TAG_NAME" release-assets/*
`)
    const violations = findDryRunViolations("ci-build.yml", workflow)
    expect(violations.some((v) => v.rule === "R2")).toBe(true)
  })

  it("R2 flags an ungated release upload step", () => {
    const workflow = publishJob(`      - name: Upload assets
        run: gh release upload "$TAG_NAME" release-assets/* --clobber
`)
    const violations = findDryRunViolations("ci-build.yml", workflow)
    expect(violations.some((v) => v.rule === "R2")).toBe(true)
  })

  it("ignores read-only gh release view steps", () => {
    const workflow = publishJob(`      - name: Read release metadata
        run: |
          gh release view "$TAG_NAME" --json body,publishedAt > release-metadata.json
`)
    expect(findDryRunViolations("ci-build.yml", workflow)).toEqual([])
  })
})
