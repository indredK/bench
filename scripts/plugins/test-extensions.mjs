#!/usr/bin/env node
/**
 * Bench-side entry point for the plugin-market verification runner.
 *
 * Plugin source and tests live in kindred-plugin-market. The market runner
 * copies host/plugin sources into a one-shot sandbox under the host's
 * node_modules and uses the pinned host Vitest installation. Loading a plugin
 * vitest.config.ts directly from the external checkout breaks module
 * resolution and bypasses that isolation boundary.
 *
 * Usage:
 *   pnpm run test:extensions -- --market ../kindred-plugin-market/plugin-market/extensions
 *   pnpm run test:extensions -- --market ../kindred-plugin-market/plugin-market/extensions --id quick-launch
 */

import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"

const HOST_DIR = resolve(process.cwd())

function valueOf(argv, flag) {
  const index = argv.indexOf(flag)
  return index === -1 ? null : argv[index + 1]
}

function fail(code, message, hint) {
  console.error(`${code}: ${message}`)
  if (hint) console.error(`hint: ${hint}`)
  process.exit(1)
}

function main() {
  const argv = process.argv.slice(2)
  const marketInput = valueOf(argv, "--market") ?? process.env.BENCH_MARKET_DIR
  const host = resolve(valueOf(argv, "--host") ?? HOST_DIR)
  const id = valueOf(argv, "--id")
  const json = argv.includes("--json")

  if (!marketInput) {
    fail(
      "EXTENSION_MARKET_REQUIRED",
      "no plugin source directory was given",
      "Pass --market <plugin-market/extensions> (or set BENCH_MARKET_DIR).",
    )
  }

  const extensionsDir = resolve(marketInput)
  if (!existsSync(extensionsDir)) {
    fail(
      "EXTENSION_MARKET_MISSING",
      `${extensionsDir} does not exist`,
      "Check the market checkout path.",
    )
  }

  const marketRoot = dirname(extensionsDir)
  const runner = resolve(marketRoot, "scripts/test-extensions.mjs")
  if (!existsSync(runner)) {
    fail(
      "EXTENSION_TEST_RUNNER_MISSING",
      `${runner} was not found`,
      "Pass the extensions/ directory from a plugin-market checkout.",
    )
  }
  if (!existsSync(resolve(marketRoot, "extensions"))) {
    fail(
      "EXTENSION_MARKET_LAYOUT_INVALID",
      `${marketRoot} has no extensions/ directory`,
      "Pass the extensions/ directory from a plugin-market checkout.",
    )
  }

  const args = ["--host", host]
  if (id) args.push("--id", id)
  if (json) args.push("--json")

  const result = spawnSync(process.execPath, [runner, ...args], {
    cwd: marketRoot,
    env: {
      ...process.env,
      BENCH_HOST_DIR: host,
      BENCH_MARKET_DIR: marketRoot,
    },
    stdio: "inherit",
  })

  if (result.error) {
    fail("EXTENSION_TEST_RUNNER_FAILED", result.error.message)
  }
  process.exit(result.status ?? 1)
}

main()
