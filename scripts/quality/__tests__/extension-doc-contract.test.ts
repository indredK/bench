import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// DOC06 守卫：extension-workflow.md 不得再出现互相矛盾的真相源与退役表述。
//
// 审计原文：文档同时写着「插件源码位于宿主 src/extensions/<id>」和「唯一真相源在
// plugin-market」；仍要求已退役的 sync:ext-repos；重复一段 i18n 验收；称 plugin-market
// 只有 4 个插件；称宿主 checkout main（实际固定 SHA）、command-market 自动写回（已删除）、
// 手工打 tag/手工更新 registry（现为 Release Please + release workflow + bot PR）。
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const DOC = join(ROOT, "docs", "explanation", "extension-workflow.md")
const read = () => readFile(DOC, "utf8")

describe("DOC06 插件工作流文档守卫", () => {
  it("不再把宿主 src/extensions/<id> 当作插件源码位置", async () => {
    const raw = await read()
    expect(raw).not.toMatch(/插件源码位于宿主 `src\/extensions\/<id>\/?`/)
    expect(raw).toMatch(/唯一真相源 = `plugin-market` 仓库/)
  })

  it("不再出现已退役的 sync:ext-repos 命令式表述", async () => {
    const raw = await read()
    for (const line of raw.split("\n")) {
      if (line.includes("sync:ext-repos")) {
        expect(line).toMatch(/已退役|不再/)
      }
    }
  })

  it("不再要求发布流程手工打 tag / 手工更新 registry", async () => {
    const raw = await read()
    expect(raw).not.toMatch(/git tag photo-triage-v/)
    expect(raw).not.toMatch(/pnpm run update:ext-registry/)
    expect(raw).toMatch(/Release Please/)
    expect(raw).toMatch(/bot PR/)
  })

  it("不再声称 command-market 自动写回 registry", async () => {
    const raw = await read()
    expect(raw).not.toMatch(/重算 registry\.json（漂移自动 commit 回 main）/)
    expect(raw).toMatch(/无自动写回/)
  })

  it("插件数量描述与 extensions/ 实际目录一致", async () => {
    const { readdir } = await import("node:fs/promises")
    const market = join(ROOT, "..", "kindred-plugin-market", "plugin-market", "extensions")
    let count: number | null = null
    try {
      count = (await readdir(market, { withFileTypes: true })).filter((e) => e.isDirectory()).length
    } catch {
      return // 本地无 plugin-market checkout 时跳过数量比对（CI 无此目录）
    }
    if (count === 7) expect(await read()).toMatch(/7 个插件/)
  })

  it("i18n 自包含验收段不重复", async () => {
    const raw = await read()
    const hits = raw.match(/文案自包含验收/g) ?? []
    expect(hits.length).toBe(1)
  })
})
