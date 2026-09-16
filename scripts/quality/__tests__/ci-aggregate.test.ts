import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * T31 静态断言：required aggregate 必须 fail-closed。
 * - pull_request 触发器不得带 paths-ignore（否则 docs-only PR 不产生 required context）
 * - ci-ok 的两个 step 都必须逐一检查四条 needs 的 result == 'success'
 */
const workflowPath = path.resolve(
  __dirname,
  "../../../.github/workflows/ci-build.yml",
)
const content = readFileSync(workflowPath, "utf8")

function stepBody(stepName: string): string {
  const anchor = `- name: ${stepName}`
  const start = content.indexOf(anchor)
  if (start === -1) throw new Error(`step not found: ${stepName}`)
  const next = content.indexOf("\n      - name:", start + anchor.length)
  return content.slice(start, next === -1 ? content.length : next)
}

describe("ci-ok aggregate fail-closed contract (T31)", () => {
  it("pull_request trigger has no paths-ignore (every PR reports the required context)", () => {
    const prBlock = content.split("  pull_request:")[1].split("\n  ")[0]
    expect(prBlock).not.toMatch(/paths-ignore/)
  })

  it("fail step requires every required pipeline to be success", () => {
    const body = stepBody("Fail unless every required pipeline succeeded")
    for (const job of ["guards", "node-compat", "frontend", "rust"]) {
      expect(body).toContain(`needs.${job}.result != 'success'`)
    }
    expect(body).not.toContain("contains(needs.*.result, 'failure')")
  })

  it("pass step also requires every required pipeline to be success", () => {
    const body = stepBody("All gate pipelines passed")
    for (const job of ["guards", "node-compat", "frontend", "rust"]) {
      expect(body).toContain(`needs.${job}.result == 'success'`)
    }
  })

  it("aggregate job needs exactly the four required pipelines", () => {
    expect(content).toMatch(
      /ci-ok:\s*\n\s*name: CI OK \(aggregate\)\s*\n\s*needs: \[guards, node-compat, frontend, rust\]/,
    )
  })
})
