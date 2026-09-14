#!/usr/bin/env node
// Vendored by bench-quality-cli (feature: bench-guards).
//
// The deletion/rename channel.
//
// lefthook's file list drops paths that no longer exist, and a command whose
// filtered list is empty is skipped — so a commit that only *removes* or
// *renames* files would silently bypass every file-scoped gate (verified
// against lefthook 2.1.14: even a custom `files:` command cannot see them).
//
// This entry therefore takes no file placeholder at all: it always runs, asks
// git itself (NUL separated, so odd names survive) what the staged change set
// contains, and re-runs exactly the gates whose scope lost or renamed a path.
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { SCOPE_GATES, stagedChanges } from "./git-changes.mjs"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

/** Deleted/renamed paths grouped by the scope whose gate must re-run. */
export function removalScopes(changes) {
  const hits = new Map()
  for (const change of changes) {
    if (change.kind !== "D" && change.kind !== "R") continue
    const affected = [change.from, change.path].filter(Boolean)
    for (const scope of SCOPE_GATES) {
      const paths = affected.filter((candidate) => scope.pattern.test(candidate))
      if (paths.length === 0) continue
      const entry = hits.get(scope.id) ?? { scope, paths: new Set() }
      for (const candidate of paths) entry.paths.add(candidate)
      hits.set(scope.id, entry)
    }
  }
  return [...hits.values()]
}

/** Run a sibling gate script and capture its output. */
export function runGate(script, args = [], { cwd = process.cwd() } = {}) {
  const scriptPath = path.join(scriptDir, script)
  if (!existsSync(scriptPath)) {
    return { script, status: 1, stdout: "", stderr: `GATE_MISSING: ${scriptPath} is not installed` }
  }
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd, encoding: "utf8" })
  return {
    script,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

export function checkChangedPaths({ cwd = process.cwd(), quiet = false } = {}) {
  const changes = stagedChanges({ cwd })
  const removals = removalScopes(changes)
  if (removals.length === 0) {
    if (!quiet) {
      console.log(
        `Changed-path guard passed: ${changes.length} staged change(s), no deletions or renames in guarded scopes.`,
      )
    }
    return { ok: true, changes: changes.length, triggered: [], results: [] }
  }

  const results = []
  for (const { scope, paths } of removals) {
    if (!quiet)
      console.log(`Deletion/rename in scope "${scope.id}": ${[...paths].sort().join(", ")}`)
    for (const gate of scope.gates) {
      const [script, ...args] = Array.isArray(gate) ? gate : [gate]
      const result = runGate(script, args, { cwd })
      results.push({ scope: scope.id, ...result })
      if (!quiet && result.status === 0) console.log(`  ✔ ${scope.id} → ${script} passed`)
    }
  }

  const failed = results.filter((result) => result.status !== 0)
  return {
    ok: failed.length === 0,
    changes: changes.length,
    triggered: removals.map((r) => r.scope.id),
    results,
    failed,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkChangedPaths()
  for (const failure of result.failed ?? []) {
    console.error(`\n${failure.scope} → ${failure.script} failed (exit ${failure.status}):`)
    if (failure.stdout) console.error(failure.stdout.trimEnd())
    if (failure.stderr) console.error(failure.stderr.trimEnd())
  }
  if (!result.ok) {
    console.error(
      "\nChanged-path guard failed: a deleted/renamed path must not leave its scope unverified.",
    )
    process.exit(1)
  }
}
