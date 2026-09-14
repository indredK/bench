#!/usr/bin/env node
// Vendored by bench-quality-cli (feature: markdown).
//
// Cross-platform markdown runner. lefthook passes the staged markdown files as
// arguments (`{staged_files}`); this script
//   - ignores paths that no longer exist (deletions reach us from the
//     changed-path dispatcher, never from lefthook's file list),
//   - falls back to git change discovery when called without arguments,
//   - supports `--all` for a full sweep (used after a doc is deleted/renamed),
//   - resolves the markdown-link-check CLI through node's resolver, so it works
//     on Windows as well (`node <pkg>/markdown-link-check` instead of a shell
//     shim), and
//   - never inspects a stale list: candidates come from git, NUL separated.
import { createRequire } from "node:module"
import { existsSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { gitOutput, stagedChanges } from "./git-changes.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const require = createRequire(import.meta.url)

function resolveLinkChecker() {
  let packageJsonPath
  try {
    packageJsonPath = require.resolve("markdown-link-check/package.json")
  } catch {
    throw new Error(
      "MARKDOWN_LINK_CHECK_MISSING: install markdown-link-check (a devDependency of this feature) and re-run.",
    )
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  const bin =
    typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.["markdown-link-check"]
  if (!bin)
    throw new Error("MARKDOWN_LINK_CHECK_MISSING: package markdown-link-check exposes no CLI entry")
  return path.join(path.dirname(packageJsonPath), bin)
}

function allTrackedMarkdown(cwd) {
  return gitOutput(["ls-files", "-z", "*.md"], { cwd }).split("\0").filter(Boolean)
}

export function collectCandidates({ cwd = repoRoot, args = [] } = {}) {
  const all = args.includes("--all")
  const explicit = args.filter((argument) => !argument.startsWith("--"))
  if (all) return allTrackedMarkdown(cwd)
  if (explicit.length > 0) return explicit
  return stagedChanges({ cwd, filter: "ACMR" })
    .filter((change) => change.path.endsWith(".md"))
    .map((change) => change.path)
}

export function checkMarkdownLinks({ cwd = repoRoot, args = [], quiet = false } = {}) {
  const configPath = path.join(cwd, ".markdown-link-check.json")
  const candidates = [...new Set(collectCandidates({ cwd, args }))].sort()
  const existing = candidates.filter((candidate) => existsSync(path.join(cwd, candidate)))
  const skipped = candidates.filter((candidate) => !existing.includes(candidate))
  if (existing.length === 0) {
    if (!quiet) console.log("Markdown link check: no markdown files to inspect.")
    return { ok: true, checked: 0, skipped, failures: [] }
  }

  const checker = resolveLinkChecker()
  const failures = []
  for (const file of existing) {
    const result = spawnSync(
      process.execPath,
      [checker, ...(existsSync(configPath) ? ["--config", configPath] : []), "--quiet", file],
      { cwd, encoding: "utf8" },
    )
    const status = result.status ?? 1
    if (status !== 0)
      failures.push({ file, status, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() })
    else if (!quiet) console.log(`  ✔ ${file}`)
  }
  return { ok: failures.length === 0, checked: existing.length, skipped, failures }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkMarkdownLinks({ args: process.argv.slice(2) })
  for (const failure of result.failures) {
    console.error(`\n${failure.file} (exit ${failure.status}):`)
    console.error(failure.output)
  }
  if (!result.ok) {
    console.error(
      `\nMarkdown link check failed: ${result.failures.length}/${result.checked} file(s) contain dead links.`,
    )
    process.exit(1)
  }
  console.log(
    `Markdown link check passed: ${result.checked} file(s) inspected${result.skipped.length ? `, ${result.skipped.length} missing path(s) ignored` : ""}.`,
  )
}
