#!/usr/bin/env node
/**
 * 插件测试 runner（P4.5）：逐个执行带 `vitest.config.ts` 的插件测试
 * （宿主 vitest 显式 exclude extensions/**，插件测试由此脚本单独跑）。
 *
 * 每个插件的 vitest.config.ts 自带 jsdom 环境 + 与构建一致的 alias
 * （含 "@/i18n/config" 重绑定）。任一插件失败即非零退出（fail-fast）。
 *
 * 用法：pnpm run test:extensions [--id <extension-id>]
 */

import { existsSync, readdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

const REPO_EXTENSIONS = join(process.cwd(), "extensions")
const VITEST_BIN = join(process.cwd(), "node_modules", ".bin", "vitest")

function main() {
  if (!existsSync(VITEST_BIN)) {
    console.error("[test:extensions] vitest not found — run `pnpm install` first")
    process.exit(1)
  }

  const onlyId = process.argv.includes("--id")
    ? process.argv[process.argv.indexOf("--id") + 1]
    : null

  const ids = readdirSync(REPO_EXTENSIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((id) => existsSync(join(REPO_EXTENSIONS, id, "vitest.config.ts")))
    .sort()

  const targets = onlyId ? ids.filter((id) => id === onlyId) : ids
  if (targets.length === 0) {
    console.error(
      `[test:extensions] no plugin with vitest.config.ts (found: ${ids.join(", ") || "none"})`,
    )
    process.exit(1)
  }

  let failed = 0
  for (const id of targets) {
    console.log(`[test:extensions] ${id} …`)
    const result = spawnSync(
      VITEST_BIN,
      ["run", "--config", join(REPO_EXTENSIONS, id, "vitest.config.ts")],
      { stdio: "inherit", shell: process.platform === "win32" },
    )
    if (result.status !== 0) {
      console.error(`[test:extensions] ${id} FAILED`)
      failed += 1
      break
    }
  }

  if (failed > 0) process.exit(1)
  console.log(`[test:extensions] done (${targets.length} plugin(s))`)
}

main()
