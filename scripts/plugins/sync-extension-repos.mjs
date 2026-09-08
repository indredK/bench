#!/usr/bin/env node
/**
 * 插件仓库同步（P5）：把 Bench 的 `extensions/<id>/` 源码同步到
 * `kindred-plugin-market/<id>/` 发布仓库（单向：bench → 发布仓库）。
 *
 * **真相源约定**（过渡期）：Bench 的 extensions/ 为开发真相源；发布仓库
 * 消费同步产物并发 Release。P4.5 SDK 解耦后反转（发布仓库为真相源，
 * Bench 构建前拉取）。
 *
 * 同步集合：manifest.json / index.html / vite.config.ts / vitest.* /
 * src/ / locales/ / docs/。同步后自动 commit（不自动 push——push 用
 * push-all.sh 或手动）。
 *
 * 用法：node scripts/plugins/sync-extension-repos.mjs --market <org 目录> [--id <id>]
 */

import { cpSync, existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const MARKET_DEFAULT = join(process.cwd(), "..", "kindred-plugin-market", "plugin-market")
const idx = process.argv.indexOf("--market")
const marketDir = idx !== -1 ? process.argv[idx + 1] : MARKET_DEFAULT
const onlyIdx = process.argv.indexOf("--id")
const onlyId = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null

const SYNC_SET = [
  "manifest.json",
  "index.html",
  "vite.config.ts",
  "vitest.config.ts",
  "vitest.setup.ts",
  "src",
  "locales",
  "docs",
]

function copySync(from, to) {
  if (!existsSync(from)) return
  cpSync(from, to, { recursive: true, force: true })
}

function main() {
  const ids = readdirSync(join(process.cwd(), "extensions"), { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() && existsSync(join(process.cwd(), "extensions", d.name, "manifest.json")),
    )
    .map((d) => d.name)
  const targets = onlyId ? [onlyId] : ids

  let committed = 0
  for (const id of targets) {
    const repo = join(marketDir, id)
    if (!existsSync(join(repo, ".git"))) {
      console.warn(`[sync] skip ${id}: ${repo} is not a git repository`)
      continue
    }
    for (const entry of SYNC_SET) {
      copySync(join(process.cwd(), "extensions", id, entry), join(repo, entry))
    }
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" })
    if ((status.stdout ?? "").trim() === "") {
      console.log(`[sync] ${id}: up to date`)
      continue
    }
    spawnSync("git", ["add", "-A"], { cwd: repo, stdio: "inherit" })
    const commit = spawnSync(
      "git",
      [
        "-c",
        "user.name=bench",
        "-c",
        "user.email=bench@local",
        "commit",
        "-qm",
        `sync: update from bench extensions/${id}`,
      ],
      { cwd: repo },
    )
    if (commit.status !== 0) {
      console.error(`[sync] ${id}: commit failed`)
      process.exit(1)
    }
    committed += 1
    console.log(`[sync] ${id}: committed`)
  }
  console.log(`[sync] done (${committed} repo(s) updated; push with push-all.sh or manually)`)
}

main()
