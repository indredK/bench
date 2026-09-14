#!/usr/bin/env node
/**
 * 插件测试 runner（P4.5；T20 契约化）。
 *
 * 宿主 vitest 显式 exclude `extensions/**`，插件测试由此脚本单独跑：每个插件的
 * `vitest.config.ts` 自带 jsdom 环境 + 与构建一致的 alias（含 "@/i18n/config"）。
 *
 * T20 契约（旧的“缺目录/零发现 = 静默成功”已废除）：
 *   - 输入必须显式：`--market <插件源码根>` 或环境变量 BENCH_MARKET_DIR；宿主根默认
 *     当前仓库，也可用 `--host <dir>` 覆盖。两者都会以 BENCH_MARKET_DIR /
 *     BENCH_HOST_DIR 传给子进程，插件配置据此解析宿主 src（固定 host 接口）。
 *   - 缺输入、目录不存在、零发现、`--id` 命中为空、全部跳过（零实测）一律非零退出。
 *   - 报告 expected/discovered/tested/skipped/failed 真实数量；`--json` 输出机器可读摘要。
 *
 * 用法：
 *   node scripts/plugins/test-extensions.mjs --market ../plugin-market/extensions
 *   pnpm run test:extensions -- --market ../plugin-market/extensions --id terminology
 */

import { existsSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { resolveBinPath, runCommand } from "../lib/platform.mjs"

const HOST_DIR = resolve(process.cwd())
const VITEST_BIN = resolveBinPath(join(HOST_DIR, "node_modules", ".bin"), "vitest")

function parseArgs(argv) {
  const value = (flag) => {
    const index = argv.indexOf(flag)
    return index === -1 ? null : argv[index + 1]
  }
  return {
    market: value("--market") ?? process.env.BENCH_MARKET_DIR ?? null,
    host: value("--host") ?? HOST_DIR,
    id: value("--id"),
    json: argv.includes("--json"),
  }
}

function fail(code, message, hint) {
  console.error(`${code}: ${message}`)
  if (hint) console.error(`hint: ${hint}`)
  process.exit(1)
}

function main() {
  const { market, host, id, json } = parseArgs(process.argv.slice(2))

  if (!existsSync(VITEST_BIN)) {
    fail(
      "VITEST_NOT_INSTALLED",
      "vitest was not found in node_modules/.bin",
      "Run `pnpm install` first.",
    )
  }
  if (!market) {
    fail(
      "EXTENSION_MARKET_REQUIRED",
      "no plugin source root was given",
      "Pass --market <dir> (or set BENCH_MARKET_DIR). Plugin sources live in the plugin-market repository; this runner no longer guesses.",
    )
  }
  const marketDir = resolve(market)
  if (!existsSync(marketDir)) {
    fail(
      "EXTENSION_MARKET_MISSING",
      `${marketDir} does not exist`,
      "Check the path or the market checkout.",
    )
  }
  if (!existsSync(host)) {
    fail(
      "BENCH_HOST_MISSING",
      `${host} does not exist`,
      "Pass --host <dir> pointing at a Bench host checkout.",
    )
  }

  const expected = readdirSync(marketDir, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  ).length
  const configured = readdirSync(marketDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(marketDir, entry.name, "vitest.config.ts")),
    )
    .map((entry) => entry.name)
    .sort()
  const skippedNoConfig = expected - configured.length

  if (id && !configured.includes(id)) {
    fail(
      "EXTENSION_NOT_FOUND",
      `plugin "${id}" has no vitest.config.ts under ${marketDir}`,
      `Discovered: ${configured.join(", ") || "(none)"}`,
    )
  }
  const targets = id ? [id] : configured
  if (targets.length === 0) {
    fail(
      "EXTENSION_ZERO_DISCOVERY",
      `no plugin with a vitest.config.ts was found under ${marketDir} (${expected} directories inspected)`,
      "A verification run that tests nothing must not look like a pass; check the market path.",
    )
  }

  const env = { ...process.env, BENCH_MARKET_DIR: marketDir, BENCH_HOST_DIR: resolve(host) }
  // With --json the human progress goes to stderr so stdout stays parseable.
  const progress = json ? console.error : console.log
  const failed = []
  const tested = []

  for (const pluginId of targets) {
    const pluginDir = join(marketDir, pluginId)
    progress(`[test:extensions] ${pluginId} …`)
    const result = runCommand(
      VITEST_BIN,
      ["run", "--config", join(pluginDir, "vitest.config.ts")],
      {
        cwd: pluginDir,
        env,
        // With --json the plugin output is buffered and only replayed on failure,
        // so stdout stays a single parseable JSON document.
        stdio: json ? "pipe" : "inherit",
      },
    )
    if (json && result.status !== 0) {
      console.error(String(result.stdout ?? ""))
      console.error(String(result.stderr ?? ""))
    }
    if (result.status !== 0) {
      failed.push(pluginId)
      break // fail-fast: 与旧行为一致，避免后续插件掩盖首个失败
    }
    tested.push(pluginId)
  }

  const report = {
    host: resolve(host),
    market: marketDir,
    expected,
    discovered: configured.length,
    tested: tested.length,
    skipped: skippedNoConfig,
    failed: failed.length,
    testedIds: tested,
    failedIds: failed,
  }

  if (json) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(
      `[test:extensions] expected=${report.expected} discovered=${report.discovered} tested=${report.tested} ` +
        `skipped=${report.skipped} failed=${report.failed}`,
    )
  }

  if (failed.length > 0) {
    console.error(`[test:extensions] FAILED: ${failed.join(", ")}`)
    process.exit(1)
  }
  if (tested.length === 0) {
    fail(
      "EXTENSION_ZERO_TESTED",
      "no plugin was actually tested",
      "This is treated as a failure, not a pass.",
    )
  }
}

main()
