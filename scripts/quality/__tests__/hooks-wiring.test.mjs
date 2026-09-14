// Wiring invariants for lefthook.yml and the generated git hooks.
//
// These are the rules that silently disable a gate when they regress: a
// `scripts:`+`only:` entry that never fires for nested paths, a glob shape
// lefthook does not match, or a fixer that re-stages without the partial
// staging guard. They are asserted mechanically instead of left to review.
//
// Deliberately dependency-free (no YAML parser): the invariants are structural
// properties of the file, and adding a parser dependency to a guard test would
// make the guard itself a supply-chain surface.
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const raw = readFileSync(path.join(rootDir, "lefthook.yml"), "utf8")
const body = readFileSync(path.join(rootDir, ".husky/pre-commit"), "utf8")
const commitMsg = readFileSync(path.join(rootDir, ".husky/commit-msg"), "utf8")

/** Split the YAML into top-level command blocks (four-space indented keys). */
const blocks = raw
  .split(/\n(?= {4}[a-z0-9][a-z0-9-]*:\s*$)|\n(?= {4}[a-z0-9][a-z0-9-]*:\s+\S)/)
  .filter((block) => /^ {4}[a-z0-9][a-z0-9-]*:/.test(block))
  .map((block) => {
    const name = /^ {4}([a-z0-9][a-z0-9-]*):/.exec(block)[1]
    // [ \t] rather than \s: a trailing \s* would happily cross the line break
    // and swallow the first list item of a block-style glob.
    const run = /^ {6}run:[ \t]*(.+)$/m.exec(block)?.[1] ?? ""
    const priority = Number(/^ {6}priority:[ \t]*(\d+)$/m.exec(block)?.[1] ?? Number.NaN)
    const strip = (value) => value.trim().replace(/^["']|["']$/g, "")
    const inlineGlob = /^ {6}glob:[ \t]*(\S.*)$/m.exec(block)?.[1]
    const listGlobs = [...block.matchAll(/^\s{8}- (.+)$/gm)].map((match) => strip(match[1]))
    const globs = inlineGlob
      ? inlineGlob.startsWith("[")
        ? inlineGlob.slice(1, -1).split(",").map(strip)
        : [strip(inlineGlob)]
      : listGlobs
    return { name, run, priority, globs, stageFixed: /^\s{6}stage_fixed:\s*true$/m.test(block) }
  })

describe("lefthook wiring", () => {
  it("uses commands only — no scripts/only style and no bogus root", () => {
    expect(blocks.length).toBeGreaterThan(10)
    expect(raw).not.toMatch(/^\s*scripts:/m)
    expect(raw).not.toMatch(/^\s*only:/m)
    expect(raw).not.toMatch(/^\s*root:/m)
  })

  it("avoids glob shapes lefthook does not match", () => {
    const globs = blocks.flatMap((block) => block.globs)
    expect(globs.length).toBeGreaterThan(0)
    for (const glob of globs) {
      // "src-tauri/**/*.rs" does not match "src-tauri/build.rs".
      expect(glob, `${glob} misses files directly under its prefix`).not.toMatch(/\/\*\*\/\*?\./)
    }
  })

  it("chains the partial-staging guard in front of every worktree rewriter", () => {
    const rewriters = blocks.filter(
      (block) => block.stageFixed && /fix-staged-whitespace|--fix/.test(block.run),
    )
    expect(rewriters.length).toBeGreaterThan(0)
    for (const block of rewriters) {
      expect(
        block.run,
        `${block.name} must not re-stage without proving the staging area is unambiguous`,
      ).toMatch(/guard-partial-staging\.mjs &&/)
    }
  })

  it("runs the deletion dispatcher unconditionally and the guards early", () => {
    const byName = Object.fromEntries(blocks.map((block) => [block.name, block]))
    expect(byName["changed-paths"]).toBeDefined()
    expect(byName["changed-paths"].globs).toEqual([])
    expect(byName["changed-paths"].run).not.toMatch(/\{(?:staged_files|all_files|files)\}/)
    expect(byName["changed-paths"].priority).toBeLessThan(byName["partial-staging"].priority)
    expect(byName["partial-staging"].priority).toBeLessThan(byName["whitespace"].priority)
    expect(body.indexOf("guard-partial-staging.mjs")).toBeLessThan(
      body.indexOf("exec node node_modules/lefthook/bin/index.js"),
    )
  })

  it("references guards that exist in the repository", () => {
    for (const block of blocks) {
      for (const match of block.run.matchAll(/scripts\/quality\/([\w.-]+)/g)) {
        expect(
          existsSync(path.join(rootDir, "scripts/quality", match[1])),
          `${block.name} → ${match[1]}`,
        ).toBe(true)
      }
    }
  })

  it("keeps the frontend/backend gates wired as run conditions", () => {
    const byName = Object.fromEntries(blocks.map((block) => [block.name, block]))
    expect(byName.frontend.run).toContain("lint:fe")
    expect(byName.frontend.globs).toContain("src/**")
    expect(byName.backend.globs).toEqual(["src-tauri/**"])
    expect(byName.backend.run).toContain("test:be")
  })
})

describe("generated git hooks", () => {
  it("invokes lefthook through node, never through the shell wrapper", () => {
    expect(body).toMatch(/exec node node_modules\/lefthook\/bin\/index\.js run pre-commit/)
    expect(body).not.toMatch(/node_modules\/\.bin\/lefthook/)
  })

  it("stays portable and diagnoses a stripped environment", () => {
    expect(body).not.toMatch(/\/Users\/[a-z]/)
    expect(body).toMatch(/NODE_NOT_FOUND/)
    expect(body).toMatch(/LEFTHOOK_NOT_INSTALLED/)
    expect(body).toMatch(/\.node-version/)
    expect(body).toMatch(/\.husky\/hooks\.env/)
    expect(commitMsg).toMatch(/run commit-msg "\$1"/)
  })
})
