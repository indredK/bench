import { describe, expect, it } from "vitest"

import { findWorkflowHygieneViolations } from "../check-workflow-hygiene.mjs"

const PINNED_SHA = "fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09"

function baseWorkflow(body) {
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
${body}
`
}

function minimalJob(body) {
  return `  verify:
    runs-on: macos-latest
    timeout-minutes: 30
${body}
`
}

describe("workflow hygiene guard", () => {
  it("accepts a fully pinned, well-formed workflow", () => {
    const workflow = baseWorkflow(
      minimalJob(`    steps:
      - uses: actions/checkout@${PINNED_SHA} # v5
      - run: pnpm run format:check
`),
    )
    expect(findWorkflowHygieneViolations("ci.yml", workflow)).toEqual([])
  })

  it("R1 rejects tag-pinned third-party uses", () => {
    const workflow = baseWorkflow(
      minimalJob(`    steps:
      - uses: actions/checkout@v5 # mutable tag
`),
    )
    const violations = findWorkflowHygieneViolations("ci.yml", workflow)
    expect(violations.some((v) => v.rule === "R1")).toBe(true)
  })

  it("R1 rejects short SHA pins", () => {
    const workflow = baseWorkflow(
      minimalJob(`    steps:
      - uses: actions/checkout@${PINNED_SHA.slice(0, 12)} # v5
`),
    )
    expect(findWorkflowHygieneViolations("ci.yml", workflow).some((v) => v.rule === "R1")).toBe(
      true,
    )
  })

  it("R1 allows local action paths", () => {
    const workflow = baseWorkflow(
      minimalJob(`    steps:
      - uses: ./.github/actions/setup
`),
    )
    expect(findWorkflowHygieneViolations("ci.yml", workflow).some((v) => v.rule === "R1")).toBe(
      false,
    )
  })

  it.each([
    'run: echo "PR: ${{ github.event.pull_request.title }}"',
    'run: |\n          echo "input: ${{ inputs.tag_name }}"',
    "run: |\n          git checkout ${{ github.head_ref }}",
    "run: build ${{ github.ref_name }}",
  ])("R2 rejects unsafe context interpolation: %s", (runBlock) => {
    const workflow = baseWorkflow(
      minimalJob(`    steps:
      - name: step
        ${runBlock}
`),
    )
    expect(findWorkflowHygieneViolations("ci.yml", workflow).some((v) => v.rule === "R2")).toBe(
      true,
    )
  })

  it("R2 allows safe contexts inside run blocks", () => {
    const workflow = baseWorkflow(
      minimalJob(`    steps:
      - name: step
        env:
          TAG_NAME: \${{ env.PUBLISH_TAG }}
        run: |
          echo "tag=$TAG_NAME matrix=\${{ matrix.os }} repo=\${{ github.repository }}"
`),
    )
    expect(findWorkflowHygieneViolations("ci.yml", workflow).some((v) => v.rule === "R2")).toBe(
      false,
    )
  })

  it("R2 stops scanning at block end (dedent)", () => {
    const workflow = baseWorkflow(
      minimalJob(`    steps:
      - name: step
        run: |
          echo safe
      - name: next
        if: \${{ github.event_name == 'push' }}
        run: echo also safe
`),
    )
    expect(findWorkflowHygieneViolations("ci.yml", workflow).some((v) => v.rule === "R2")).toBe(
      false,
    )
  })

  it("R3 rejects jobs without timeout-minutes", () => {
    const workflow = baseWorkflow(`  verify:
    runs-on: macos-latest
    steps:
      - run: pnpm run test:fe
`)
    expect(findWorkflowHygieneViolations("ci.yml", workflow).some((v) => v.rule === "R3")).toBe(
      true,
    )
  })

  it("R4 rejects push-triggered workflow without concurrency", () => {
    const workflow = `
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
${minimalJob("    steps:\n      - run: echo ok\n")}
`
    expect(findWorkflowHygieneViolations("ci.yml", workflow).some((v) => v.rule === "R4")).toBe(
      true,
    )
  })

  it("R5 rejects workflow without permissions block", () => {
    const workflow = `
on:
  push:
    branches: [main]
concurrency:
  group: test
jobs:
${minimalJob("    steps:\n      - run: echo ok\n")}
`
    expect(findWorkflowHygieneViolations("ci.yml", workflow).some((v) => v.rule === "R5")).toBe(
      true,
    )
  })

  it("R4 is waived for schedule-only workflows", () => {
    const workflow = `
on:
  schedule:
    - cron: "0 2 * * 1"
permissions:
  actions: write
jobs:
${minimalJob("    steps:\n      - run: echo ok\n")}
`
    expect(findWorkflowHygieneViolations("ci.yml", workflow).some((v) => v.rule === "R4")).toBe(
      false,
    )
  })
})
