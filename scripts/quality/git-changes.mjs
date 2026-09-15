// Shared, NUL-safe git change discovery for the vendored guards.
//
// Why this exists: lefthook filters deleted paths out of the file list it hands
// to a command (a command whose filtered list is empty is skipped entirely).
// Change detection that must also see deletions/renames therefore cannot rely
// on {staged_files}: it has to ask git itself, with -z so that spaces, newlines
// and non-ASCII names survive.
import { execFileSync } from "node:child_process";

/** Run git and return stdout; throws with stderr attached when it fails. */
export function gitOutput(args, { cwd = process.cwd() } = {}) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (error) {
    const detail = (error.stderr || error.message || "").toString().trim();
    throw new Error(`GIT_FAILED: git ${args.join(" ")} — ${detail}`);
  }
}

/** Parse `git diff --name-status -z` output (handles R/C two-path records). */
export function parseNameStatusZ(raw) {
  const tokens = raw.split("\0").filter((token) => token !== "");
  const changes = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const status = tokens[index];
    const kind = status[0];
    if (kind === "R" || kind === "C") {
      const from = tokens[++index];
      const to = tokens[++index];
      changes.push({ kind, status, path: to, from });
    } else {
      changes.push({ kind, status, path: tokens[++index], from: null });
    }
  }
  return changes;
}

/** Staged changes with status, including deletions, renames and copies. */
export function stagedChanges({ cwd = process.cwd(), filter = "ACMRDT" } = {}) {
  return parseNameStatusZ(gitOutput(["diff", "--cached", "--name-status", "-z", `--diff-filter=${filter}`], { cwd }));
}

/** Plain staged path list (NUL separated), optionally filtered by status. */
export function stagedPaths({ cwd = process.cwd(), filter = "ACMR" } = {}) {
  return gitOutput(["diff", "--cached", "--name-only", "-z", `--diff-filter=${filter}`], { cwd })
    .split("\0")
    .filter(Boolean);
}

/** Tracked files with unstaged modifications. */
export function unstagedPaths({ cwd = process.cwd() } = {}) {
  return gitOutput(["diff", "--name-only", "-z"], { cwd }).split("\0").filter(Boolean);
}

/**
 * Files that are staged AND have further unstaged changes. Committing those
 * would silently drop work, so hooks refuse before anything rewrites them.
 */
export function findPartiallyStaged({ cwd = process.cwd() } = {}) {
  const staged = new Set(stagedPaths({ cwd }));
  return unstagedPaths({ cwd }).filter((path) => staged.has(path));
}

/** Scope table shared by the change dispatcher: path pattern -> gates. */
export const SCOPE_GATES = [
  { id: "i18n", pattern: /^(?:src|extensions)\//, gates: ["check-i18n-guards.mjs"] },
  {
    id: "docs",
    pattern: /^(?:docs\/|src\/features\/|extensions\/|README\.md$|AGENTS\.md$)/,
    gates: ["check-docs-consistency.mjs"],
  },
  { id: "workflows", pattern: /^\.github\/workflows\//, gates: ["check-ci-platforms.mjs", "check-workflow-hygiene.mjs"] },
  { id: "rust", pattern: /^src-tauri\//, gates: ["check-rust-cfg-hygiene.mjs", "check-rust-crates.mjs"] },
  // Array-of-array: a gate is [script, ...args]; a full sweep is required here
  // because the deleted document can be linked from files that did not change.
  { id: "markdown", pattern: /\.md$/, gates: [["check-markdown-links.mjs", "--all"]] },
];
