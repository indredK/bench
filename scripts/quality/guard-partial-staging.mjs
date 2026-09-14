#!/usr/bin/env node
// Vendored by bench-quality-cli (feature: bench-guards).
//
// Refuses to run when a file is staged *and* has further unstaged edits:
// formatters/fixers below would otherwise re-stage changes the author never
// reviewed (and their unstaged work would be swallowed by the commit).
//
// Two ways it is used:
//   1. standalone pre-commit command (`partial-staging`), so the failure is
//      reported even when no fixer would have run;
//   2. chained in front of every command that modifies the worktree/staging
//      area (`node scripts/quality/guard-partial-staging.mjs && node ... --fix`),
//      which makes the ordering independent of lefthook's parallel scheduling.
//
// Exported for tests; also runnable as a script. Uses -z throughout so file
// names with spaces, newlines or CJK characters are handled correctly.
import { pathToFileURL } from "node:url"

import { findPartiallyStaged } from "./git-changes.mjs"

export function inspectPartialStaging({ cwd = process.cwd() } = {}) {
  const paths = findPartiallyStaged({ cwd })
  return { ok: paths.length === 0, paths }
}

export function assertNoPartialStaging({ cwd = process.cwd(), report = console.error } = {}) {
  const result = inspectPartialStaging({ cwd })
  if (result.ok) return result
  report("PARTIALLY_STAGED_FILE: a file is staged and has further unstaged changes.")
  for (const path of result.paths) report(`  ${path}`)
  report("")
  report("Stage the whole file (git add <file>) or stash the rest of the edit, then commit again.")
  report("Nothing was modified: automatic fixes are skipped while the staging area is ambiguous.")
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = assertNoPartialStaging()
  if (!result.ok) process.exit(1)
  console.log("Partial staging guard passed: staged files have no further unstaged changes.")
}
