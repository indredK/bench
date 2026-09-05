/**
 * Rust conditional-compilation hygiene scanner.
 *
 * Background: this crate compiles with `-D warnings` (see `clippy:be`), so
 * `unused_imports` / `dead_code` / `unused_mut` are hard errors, not warnings.
 * CI builds on BOTH macOS and Windows. A developer (or an AI agent) on macOS
 * cannot compile the Windows target locally, so a platform-gated usage pattern
 * silently leaks to CI and breaks the build there.
 *
 * What it detects — an item is dead code on platform P when the ITEM is
 * compiled on P but no REFERENCE to it is compiled on P:
 *
 *   Rule A — const / static / fn / use-binding whose reference set leaves one
 *            supported platform without any live reference (dead_code,
 *            unused_imports).
 *   Rule B — `let mut x` where some supported platform has the binding but no
 *            live reassignment (unused_mut).
 *
 * Liveness is computed per platform, which is what makes this precise:
 *   - `#[cfg(target_os = "macos")]` and `#[cfg(target_os = "windows")]` call
 *     sites are complementary, not dead — every supported platform still has
 *     one live reference.
 *   - `#[cfg(target_os = "macos")] mod macos_webview;` gates a whole file, so
 *     its items are never live on Windows and never dead there either.
 *
 * Scope limits (deliberate, to keep false positives at zero):
 *   - Only platform predicates are modelled. `#[cfg(test)]`, `feature = "..."`
 *     and other unknown predicates are treated as active everywhere.
 *   - `cfg_attr` is NOT a gate: it only applies another attribute, it never
 *     removes the item from the build.
 *   - Items referenced zero times are skipped (rustc already reports those on
 *     every platform, including the developer's).
 *   - Names defined more than once in the crate are skipped (ambiguous).
 *
 * Exit code 1 if any violation is found, 0 otherwise.
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const tauriSrcDir = path.join(rootDir, "src-tauri", "src")

// Only macOS and Windows are supported targets (see check-ci-platforms.mjs).
const SUPPORTED_PLATFORMS = ["macos", "windows"]
const UNIVERSAL = new Set(SUPPORTED_PLATFORMS)

const LINT_EXEMPT_RE = /(?:allow|expect)\s*\([^)]*(?:dead_code|unused_imports|unused_mut|unused)\b/

// --- Set helpers ---

const intersectSets = (a, b) => new Set([...a].filter((p) => b.has(p)))
const unionSets = (a, b) => new Set([...a, ...b])

// --- cfg predicate evaluation ---

function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let current = ""
  let inString = false
  for (const ch of text) {
    if (ch === '"') {
      inString = !inString
      current += ch
      continue
    }
    if (!inString) {
      if (ch === "(" || ch === "[") depth++
      else if (ch === ")" || ch === "]") depth--
      else if (ch === "," && depth === 0) {
        parts.push(current)
        current = ""
        continue
      }
    }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

const only = (name) => new Set(SUPPORTED_PLATFORMS.filter((p) => p === name))

function evalCfgExpr(expr) {
  const e = expr.trim()

  const not = /^not\s*\(([\s\S]*)\)$/.exec(e)
  if (not) return new Set(SUPPORTED_PLATFORMS.filter((p) => !evalCfgExpr(not[1]).has(p)))

  const any = /^any\s*\(([\s\S]*)\)$/.exec(e)
  if (any) {
    let acc = new Set()
    for (const part of splitTopLevel(any[1])) acc = unionSets(acc, evalCfgExpr(part))
    return acc
  }

  const all = /^all\s*\(([\s\S]*)\)$/.exec(e)
  if (all) {
    let acc = new Set(UNIVERSAL)
    for (const part of splitTopLevel(all[1])) acc = intersectSets(acc, evalCfgExpr(part))
    return acc
  }

  const os = /^target_os\s*=\s*"([a-z0-9]+)"$/.exec(e)
  if (os) return only(os[1])

  const family = /^target_family\s*=\s*"([a-z0-9]+)"$/.exec(e)
  if (family) {
    if (family[1] === "unix") return only("macos")
    if (family[1] === "windows") return only("windows")
    return new Set()
  }

  if (e === "unix") return only("macos")
  if (e === "windows") return only("windows")
  if (e === "macos") return only("macos")

  // Unknown predicate (target_arch, feature, debug_assertions, ...): assume
  // active everywhere. Being conservative here only costs recall, never
  // produces a false positive.
  return new Set(UNIVERSAL)
}

// `cfg_attr` applies another attribute; it never removes code from the build,
// so it is not a gate.
function cfgPredicate(attrText) {
  const m = /^cfg\s*\(([\s\S]*)\)$/.exec(attrText.trim())
  return m ? m[1] : null
}

// --- 1. Mask comments and string bodies (preserve length and newlines) ---

function maskSource(src) {
  const out = src.split("")
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " "
  }
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src[i]
    if (c === "/" && src[i + 1] === "/") {
      let j = i
      while (j < n && src[j] !== "\n") j++
      blank(i, j)
      i = j
      continue
    }
    if (c === "/" && src[i + 1] === "*") {
      let j = i + 2
      while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++
      j = Math.min(n, j + 2)
      blank(i, j)
      i = j
      continue
    }
    if (c === "r" && (src[i + 1] === '"' || src[i + 1] === "#")) {
      let k = i + 1
      let hashes = 0
      while (src[k] === "#") {
        hashes++
        k++
      }
      if (src[k] === '"') {
        const terminator = '"' + "#".repeat(hashes)
        const end = src.indexOf(terminator, k + 1)
        const j = end === -1 ? n : end + terminator.length
        blank(i, j)
        i = j
        continue
      }
    }
    if (c === '"') {
      let j = i + 1
      while (j < n) {
        if (src[j] === "\\") {
          j += 2
          continue
        }
        if (src[j] === '"') {
          j++
          break
        }
        j++
      }
      blank(i, j)
      i = j
      continue
    }
    if (c === "'") {
      const m = /^'(\\.|[^'\\])'/.exec(src.slice(i))
      if (m) {
        blank(i, i + m[0].length)
        i += m[0].length
        continue
      }
    }
    i++
  }
  return out.join("")
}

// --- 2. Brace walk: platforms on which each offset is compiled ---

/**
 * Brace walk over the masked source. Attribute TEXT is read from the raw
 * source: `maskSource` blanks string bodies, which would destroy the
 * `"macos"` in `#[cfg(target_os = "macos")]` and make the predicate
 * un-evaluable (falling back to "active everywhere", i.e. never gated).
 * Offsets are identical in both views, so raw slices line up exactly.
 */
function buildGates(masked, raw) {
  const n = masked.length
  const gates = new Array(n).fill(UNIVERSAL)
  const owner = new Array(n).fill(-1)
  const closeAt = new Array(n).fill(-1)
  const stack = []
  let pending = null
  let i = 0

  const topPred = () => (stack.length ? stack[stack.length - 1].pred : UNIVERSAL)
  const topOpen = () => (stack.length ? stack[stack.length - 1].openIdx : -1)

  while (i < n) {
    const c = masked[i]

    if (c === "#" && masked[i + 1] === "[") {
      let depth = 0
      let j = i + 1
      for (; j < n; j++) {
        if (masked[j] === "[") depth++
        else if (masked[j] === "]") {
          depth--
          if (depth === 0) {
            j++
            break
          }
        }
      }
      const text = raw.slice(i + 2, j - 1).trim()
      const pred = cfgPredicate(text)
      if (pred !== null) pending = evalCfgExpr(pred)
      i = j
      continue
    }

    if (c === "{") {
      stack.push({ openIdx: i, pred: pending ?? topPred() })
      pending = null
      gates[i] = topPred()
      owner[i] = i
      i++
      continue
    }

    if (c === "}") {
      const top = stack.pop()
      if (top) closeAt[top.openIdx] = i
      gates[i] = topPred()
      owner[i] = topOpen()
      i++
      continue
    }

    // Attributes cover the whole following item/statement, not just a brace
    // body: a multi-line `#[cfg(x)] let b = Builder::new(...);` stays gated
    // until its `;`.
    if (c === ";") {
      pending = null
      gates[i] = topPred()
      owner[i] = topOpen()
      i++
      continue
    }

    gates[i] = pending ?? topPred()
    owner[i] = topOpen()
    i++
  }

  return { gates, owner, closeAt }
}

// --- 3. Attribute lookup: `#[...]` blocks immediately above an offset ---

const QUALIFIERS = ["pub", "unsafe", "async", "const", "extern", "default"]

function skipQualifiers(masked, j) {
  let moved = true
  while (moved) {
    moved = false
    while (j >= 0 && /\s/.test(masked[j])) j--
    if (j < 0) return j

    if (masked[j] === ")") {
      let depth = 0
      let k = j
      for (; k >= 0; k--) {
        if (masked[k] === ")") depth++
        else if (masked[k] === "(") {
          depth--
          if (depth === 0) break
        }
      }
      if (k >= 0 && masked[k] === "(") {
        let p = k - 1
        while (p >= 0 && /\s/.test(masked[p])) p--
        if (p >= 2 && masked.slice(p - 2, p + 1) === "pub") {
          j = p - 3
          moved = true
          continue
        }
      }
      return j
    }

    for (const q of QUALIFIERS) {
      const start = j - q.length + 1
      if (start >= 0 && masked.slice(start, j + 1) === q) {
        const prev = start - 1
        if (prev < 0 || !/[A-Za-z0-9_]/.test(masked[prev])) {
          j = prev
          moved = true
          break
        }
      }
    }
  }
  return j
}

function ownAttrs(masked, offset, raw) {
  const text = raw ?? masked
  const attrs = []
  let j = offset - 1
  while (j >= 0) {
    while (j >= 0 && /\s/.test(masked[j])) j--
    if (j < 0) break

    if (masked[j] === "]") {
      let depth = 0
      let k = j
      for (; k >= 0; k--) {
        if (masked[k] === "]") depth++
        else if (masked[k] === "[") {
          depth--
          if (depth === 0) break
        }
      }
      if (k >= 0 && masked[k] === "[") {
        let p = k - 1
        while (p >= 0 && /\s/.test(masked[p])) p--
        if (p >= 0 && masked[p] === "#") {
          attrs.unshift(text.slice(k + 1, j).trim())
          j = p - 1
          continue
        }
      }
      break
    }

    // Step over `pub(crate)`, `unsafe`, `async`, ... between attrs and keyword.
    const skipped = skipQualifiers(masked, j)
    if (skipped === j) break
    j = skipped
  }
  return attrs
}

// --- 4. File-level module gating (`#[cfg(...)] mod foo;`) ---

const MOD_DECL_RE = /\bmod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g

function resolveFileGates(files, maskedByFile, rawByFile, srcDir) {
  const dirGates = new Map()
  const fileGates = new Map()

  for (const filePath of files) {
    const masked = maskedByFile.get(filePath)
    const raw = rawByFile.get(filePath)
    MOD_DECL_RE.lastIndex = 0
    let m
    while ((m = MOD_DECL_RE.exec(masked)) !== null) {
      let gate = new Set(UNIVERSAL)
      for (const attr of ownAttrs(masked, m.index, raw)) {
        const pred = cfgPredicate(attr)
        if (pred !== null) gate = intersectSets(gate, evalCfgExpr(pred))
      }
      if (gate.size === SUPPORTED_PLATFORMS.length) continue
      const dir = path.join(path.dirname(filePath), m[1])
      dirGates.set(dir, gate)
      fileGates.set(dir + ".rs", gate)
    }
  }

  const cache = new Map()
  return function fileGate(filePath) {
    if (cache.has(filePath)) return cache.get(filePath)
    let acc = new Set(UNIVERSAL)
    const parts = path.relative(srcDir, filePath).split(path.sep)
    let current = srcDir
    for (let i = 0; i < parts.length - 1; i++) {
      current = path.join(current, parts[i])
      const gate = dirGates.get(current)
      if (gate) acc = intersectSets(acc, gate)
    }
    const selfGate = fileGates.get(filePath)
    if (selfGate) acc = intersectSets(acc, selfGate)
    cache.set(filePath, acc)
    return acc
  }
}

// --- 5. Definition extraction ---

const IDENT = "[A-Za-z_][A-Za-z0-9_]*"

// `const fn` is a function qualifier, not a const item.
const ITEM_PATTERNS = [
  { kind: "const", re: new RegExp(`\\bconst\\s+(?!fn\\b)(?:mut\\s+)?(${IDENT})`, "g") },
  { kind: "static", re: new RegExp(`\\bstatic\\s+(?:mut\\s+)?(${IDENT})`, "g") },
  { kind: "fn", re: new RegExp(`\\bfn\\s+(${IDENT})`, "g") },
]

const USE_RE = /\buse\s+([^;]+);/g
const LET_MUT_RE = /\blet\s+mut\s+([A-Za-z_][A-Za-z0-9_]*)/g

function parseUseNames(body) {
  const cleaned = body.replace(/^pub\s*(\([^)]*\))?\s*/, "").trim()
  if (cleaned.startsWith("*")) return []
  const names = []
  const open = cleaned.indexOf("{")
  if (open === -1) {
    const segments = cleaned.split("::")
    const last = segments[segments.length - 1].trim()
    const aliased = last.split(/\s+as\s+/)
    const name = (aliased[1] ?? aliased[0]).trim()
    if (name && name !== "*") names.push(name)
    return names
  }
  const close = cleaned.lastIndexOf("}")
  const inner = cleaned.slice(open + 1, close === -1 ? cleaned.length : close)
  for (const raw of inner.split(",")) {
    const item = raw.trim()
    if (!item || item === "*") continue
    const aliased = item.split(/\s+as\s+/)
    let name = (aliased[1] ?? aliased[0]).trim()
    if (name.startsWith("::")) name = name.slice(2)
    if (name === "self") {
      const prefix = cleaned.slice(0, open).trim().split("::")
      name = prefix[prefix.length - 1].trim()
    }
    if (name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.push(name)
  }
  return names
}

function collectDefinitions(masked, gates, raw) {
  const defs = []

  for (const { kind, re } of ITEM_PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(masked)) !== null) {
      const name = m[1]
      const offset = m.index + m[0].length - name.length
      defs.push({
        kind,
        name,
        offset,
        spanEnd: offset + name.length,
        platforms: gates[offset] ?? UNIVERSAL,
        exempt: ownAttrs(masked, m.index, raw).some((a) => LINT_EXEMPT_RE.test(a)),
      })
    }
  }

  USE_RE.lastIndex = 0
  let u
  while ((u = USE_RE.exec(masked)) !== null) {
    const attrs = ownAttrs(masked, u.index, raw)
    const platforms = gates[u.index] ?? UNIVERSAL
    const exempt = attrs.some((a) => LINT_EXEMPT_RE.test(a))
    for (const name of parseUseNames(u[1])) {
      defs.push({
        kind: "import",
        name,
        offset: u.index,
        spanEnd: u.index + u[0].length,
        platforms,
        exempt,
      })
    }
  }

  return defs
}

// --- 6. File walking ---

function walkRsFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "target" || entry === "gen" || entry === ".git") continue
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) walkRsFiles(fullPath, results)
    else if (entry.endsWith(".rs")) results.push(fullPath)
  }
  return results
}

// --- 7. Main analysis ---

/**
 * @param {{ path: string, content: string }[]} sources Rust sources to analyse.
 * @param {{ srcDir: string, displayRoot: string }} layout module root and the
 *   prefix stripped from reported paths.
 */
export function analyzeRustSources(sources, { srcDir, displayRoot }) {
  const files = sources.map((s) => s.path)
  const maskedByFile = new Map()
  const rawByFile = new Map()
  for (const { path: filePath, content } of sources) {
    rawByFile.set(filePath, content)
    maskedByFile.set(filePath, maskSource(content))
  }

  const fileGate = resolveFileGates(files, maskedByFile, rawByFile, srcDir)

  const parsed = files.map((filePath) => {
    const masked = maskedByFile.get(filePath)
    const raw = rawByFile.get(filePath)
    const { gates, owner, closeAt } = buildGates(masked, raw)
    const gate = fileGate(filePath)

    const tokens = new Map()
    const tokenRe = /\b[A-Za-z_][A-Za-z0-9_]*\b/g
    let t
    while ((t = tokenRe.exec(masked)) !== null) {
      if (!tokens.has(t[0])) tokens.set(t[0], [])
      tokens.get(t[0]).push(t.index)
    }

    return {
      file: path.relative(displayRoot, filePath),
      absPath: filePath,
      masked,
      raw,
      gates,
      owner,
      closeAt,
      tokens,
      gate,
      defs: collectDefinitions(masked, gates, raw),
    }
  })

  const byPath = new Map(parsed.map((p) => [p.file, p]))

  // Rule A: item is compiled on a platform where no reference is compiled.
  const defs = []
  for (const entry of parsed) {
    for (const def of entry.defs) defs.push({ ...def, file: entry.file })
  }

  // A `use` binding site is an alias, not a use: if the binding itself is
  // never used on a platform, rustc also reports the imported item as dead
  // there. So every definition span of a name is excluded from its reference
  // set, which makes deadness propagate through imports without a fixpoint.
  const spansByName = new Map()
  for (const def of defs) {
    if (!spansByName.has(def.name)) spansByName.set(def.name, [])
    spansByName.get(def.name).push({ file: def.file, start: def.offset, end: def.spanEnd })
  }

  const refsByName = new Map()
  for (const [name, spans] of spansByName) {
    const refs = []
    for (const entry of parsed) {
      const offsets = entry.tokens.get(name)
      if (!offsets) continue
      for (const offset of offsets) {
        const isDefinition = spans.some(
          (s) => s.file === entry.file && offset >= s.start && offset < s.end,
        )
        if (isDefinition) continue
        refs.push({
          file: entry.file,
          offset,
          platforms: intersectSets(entry.gates[offset] ?? UNIVERSAL, entry.gate),
        })
      }
    }
    refsByName.set(name, refs)
  }

  const violations = []

  for (const def of defs) {
    if (def.exempt) continue

    const refs = refsByName.get(def.name)
    if (!refs || refs.length === 0) continue // rustc already flags this everywhere

    const defEntry = byPath.get(def.file)
    const defPlatforms = intersectSets(def.platforms, defEntry.gate)
    if (defPlatforms.size === 0) continue

    const deadOn = SUPPORTED_PLATFORMS.filter(
      (p) => defPlatforms.has(p) && !refs.some((r) => r.platforms.has(p)),
    )
    if (deadOn.length === 0) continue

    const first = refs[0]
    const firstEntry = byPath.get(first.file)
    violations.push({
      rule: "A",
      file: def.file,
      line: lineOf(defEntry.masked, def.offset),
      name: def.name,
      kind: def.kind,
      detail:
        `${describe(def.kind)} \`${def.name}\` 在 ${deadOn.join(" / ")} 上会被编译，但没有任何引用在该平台编译` +
        `（引用共 ${refs.length} 处，首个 ${first.file}:${lineOf(firstEntry.masked, first.offset)}）。` +
        `该平台下即为 dead code，\`-D warnings\` 会直接编译失败。`,
      fix:
        `把定义处与引用点的 \`#[cfg(...)]\` 对齐：要么给 \`${def.name}\` 补上引用点相同的平台门控，` +
        `要么把引用移出平台分支。`,
    })
  }

  // Rule B: binding is compiled on a platform where no reassignment is.
  for (const entry of parsed) {
    LET_MUT_RE.lastIndex = 0
    let m
    while ((m = LET_MUT_RE.exec(entry.masked)) !== null) {
      const name = m[1]
      const offset = m.index + m[0].length - name.length
      if (ownAttrs(entry.masked, m.index, entry.raw).some((a) => LINT_EXEMPT_RE.test(a))) continue

      const bindingPlatforms = intersectSets(entry.gates[offset] ?? UNIVERSAL, entry.gate)
      if (bindingPlatforms.size === 0) continue

      const blockOpen = entry.owner[offset]
      const blockEnd = blockOpen === -1 ? -1 : entry.closeAt[blockOpen]
      const limit = blockEnd === -1 ? entry.masked.length : blockEnd

      const mutationRe = new RegExp(`\\b${name}\\s*(?:[-+*/%&|^]=|=(?![=>]))`, "g")
      mutationRe.lastIndex = offset + name.length

      const mutations = []
      let mm
      while ((mm = mutationRe.exec(entry.masked)) !== null && mm.index < limit) {
        mutations.push({
          offset: mm.index,
          platforms: intersectSets(entry.gates[mm.index] ?? UNIVERSAL, entry.gate),
        })
      }

      if (mutations.length === 0) continue // not platform-dependent

      const deadOn = SUPPORTED_PLATFORMS.filter(
        (p) => bindingPlatforms.has(p) && !mutations.some((x) => x.platforms.has(p)),
      )
      if (deadOn.length === 0) continue

      const first = mutations[0]
      // `letStart` / `nameEnd` are the byte offsets of the entire `let mut X`
      // token in the masked source. They are the same in the raw source because
      // maskSource preserves length + newlines. They drive `--fix` so it can
      // rewrite the binding in place without re-parsing.
      violations.push({
        rule: "B",
        file: entry.file,
        line: lineOf(entry.masked, offset),
        name,
        kind: "let mut",
        letStart: m.index,
        nameEnd: m.index + m[0].length,
        detail:
          `\`let mut ${name}\` 在 ${deadOn.join(" / ")} 上会被编译，但 ${mutations.length} 处重新赋值都不在该平台编译` +
          `（首个 ${entry.file}:${lineOf(entry.masked, first.offset)}）。` +
          `该平台下触发 \`unused_mut\`，\`-D warnings\` 会直接编译失败。`,
        fix: `为 \`let mut ${name}\` 加平台门控并在 \`#[cfg(not(...))]\` 分支提供不可变版本，或用 \`#[cfg_attr(not(...), allow(unused_mut))]\` 显式豁免。`,
      })
    }
  }

  return { fileCount: files.length, violations }
}

/** Analyse the real crate on disk. */
export function checkRustCfgHygiene(srcDir = tauriSrcDir) {
  const sources = walkRsFiles(srcDir).map((filePath) => ({
    path: filePath,
    content: readFileSync(filePath, "utf8"),
  }))
  return analyzeRustSources(sources, { srcDir, displayRoot: rootDir })
}

function lineOf(masked, offset) {
  return masked.slice(0, offset).split("\n").length
}

function describe(kind) {
  switch (kind) {
    case "import":
      return "导入绑定"
    case "const":
      return "常量"
    case "static":
      return "静态变量"
    default:
      return "函数"
  }
}

// --- 8. Auto-fix (Rule B only) ---

/**
 * Pure helper: rewrite the source `content` so that every `let mut X` listed in
 * `violations` becomes `let X`. Returns the new content and the number of
 * bindings actually rewritten. Idempotent: a binding that is no longer `mut`
 * after one pass is no longer matched by `LET_MUT_RE`, so a second pass is a
 * no-op.
 *
 * `violations` should be the Rule-B slice for THIS file only (other files'
 * offsets would be wrong). `letStart` / `nameEnd` come from the same masked
 * source as `content` — they line up because `maskSource` preserves length.
 *
 * Exported for the unit tests; the CLI drives `applyRuleBFixesOnDisk`.
 */
export function applyRuleBFixesToContent(content, violations) {
  const ruleB = violations.filter((v) => v.rule === "B")
  if (ruleB.length === 0) return { content, fixedCount: 0 }

  // Sort by offset descending so earlier rewrites don't shift later offsets.
  const sorted = [...ruleB].sort((a, b) => b.letStart - a.letStart)
  let next = content
  let fixedCount = 0
  for (const v of sorted) {
    const slice = next.slice(v.letStart, v.nameEnd)
    const replacement = slice.replace(/^let\s+mut\s+/, "let ")
    if (replacement !== slice) {
      next = next.slice(0, v.letStart) + replacement + next.slice(v.nameEnd)
      fixedCount++
    }
  }
  return { content: next, fixedCount }
}

/**
 * Group violations by file, apply `applyRuleBFixesToContent` to each, and write
 * back only the files that actually changed. Returns the list of files that
 * were modified (displayRoot-relative paths).
 */
function applyRuleBFixesOnDisk(violations, displayRoot) {
  const byFile = new Map()
  for (const v of violations) {
    if (v.rule !== "B") continue
    if (!byFile.has(v.file)) byFile.set(v.file, [])
    byFile.get(v.file).push(v)
  }
  const modified = []
  for (const [relPath, viols] of byFile) {
    const absPath = path.join(displayRoot, relPath)
    const original = readFileSync(absPath, "utf8")
    const { content, fixedCount } = applyRuleBFixesToContent(original, viols)
    if (fixedCount === 0) continue
    writeFileSync(absPath, content, "utf8")
    modified.push(relPath)
  }
  return modified
}

function printViolations(violations) {
  for (const v of violations) {
    console.error(`  [Rule ${v.rule}] ${v.file}:${v.line}  →  ${v.name} (${v.kind})`)
    console.error(`    ${v.detail}`)
    console.error(`    fix: ${v.fix}\n`)
  }
}

// --- CLI ---

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixMode = process.argv.includes("--fix")

  if (fixMode) {
    // 1. Run the analysis on the current crate on disk.
    const before = checkRustCfgHygiene()
    const ruleB = before.violations.filter((v) => v.rule === "B")

    if (ruleB.length === 0) {
      console.log("No Rule B (`let mut`) violations to auto-fix.")
    } else {
      const modified = applyRuleBFixesOnDisk(ruleB, rootDir)
      console.log(
        `✓ Auto-fixed ${ruleB.length} \`let mut\` violation(s) in ${modified.length} file(s):`,
      )
      for (const file of modified) console.log(`  fixed: ${file}`)
    }

    // 2. Re-analyze after the rewrite. Any remaining violation is Rule A
    // (const/static/fn/use dead code) — too ambiguous to auto-fix, the dev
    // must decide between gating the definition or moving the usage.
    const after = checkRustCfgHygiene()
    if (after.violations.length === 0) {
      console.log(
        `✓ Rust cfg hygiene check passed — ${after.fileCount} files scanned after auto-fix.`,
      )
      process.exit(0)
    }

    console.error(
      `\n✗ ${after.violations.length} violation(s) remain after auto-fix ` +
        `(Rule A: const/static/fn/use dead code, requires manual alignment):\n`,
    )
    printViolations(after.violations)
    console.error(
      "Local builds only prove ONE platform. Align the #[cfg(...)] on the definition with " +
        "the one on its call sites, or move the usage out of the platform branch.",
    )
    process.exit(1)
  }

  // Default mode: pure detection, no mutation.
  const result = checkRustCfgHygiene()
  if (result.violations.length === 0) {
    console.log(
      `✓ Rust cfg hygiene check passed — ${result.fileCount} files scanned, ` +
        `no platform-gated dead code on any supported platform.`,
    )
    process.exit(0)
  }

  console.error(
    "✗ Rust cfg hygiene check FAILED — these are compiled on one supported platform but " +
      "unreferenced there, which breaks -D warnings on that platform:\n",
  )
  printViolations(result.violations)
  console.error(
    "Local builds only prove ONE platform. Align the #[cfg(...)] on the definition with the " +
      "one on its call sites, or move the usage out of the platform branch.",
  )
  process.exit(1)
}
