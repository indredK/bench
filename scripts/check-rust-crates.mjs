/**
 * Cross-platform crate usage scanner.
 *
 * Scans Rust source files under src-tauri/src for references to external
 * crates that are NOT declared in Cargo.toml, with special attention to
 * references inside `#[cfg(target_os = "...")]` gated blocks — these compile
 * fine on the developer's platform but break CI on other platforms (e.g.
 * `nix::` used under `cfg(target_os = "linux")` without `nix` in Cargo.toml).
 *
 * Strategy: only flag **snake_case identifiers** used as the root of a
 * multi-segment path (`name::...`). Rust crate names are snake_case by
 * convention; CamelCase identifiers are types/enums (e.g. `HashMap::new()`),
 * not crate roots. This keeps false positives near zero.
 *
 * Exit code 1 if any undeclared crate reference is found, 0 otherwise.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriSrcDir = path.join(rootDir, "src-tauri", "src");
const cargoTomlPath = path.join(rootDir, "src-tauri", "Cargo.toml");

// --- 1. Parse declared crate names from Cargo.toml ---

function parseDeclaredCrates(tomlContent) {
  const crates = new Set();

  let inDependencySection = false;
  for (const line of tomlContent.split("\n")) {
    const trimmed = line.trim();

    if (trimmed.startsWith("[")) {
      // Match [dependencies], [dev-dependencies], [build-dependencies],
      // [target.'cfg(...)'.dependencies], etc.
      inDependencySection = /dependencies\s*\]/i.test(trimmed);
      continue;
    }

    if (!inDependencySection) continue;

    // Match `crate-name = ...` (allow hyphens in crate names)
    const match = trimmed.match(/^([a-z0-9_-]+)\s*=/i);
    if (match) {
      // Convert hyphens to underscores (Rust crate naming convention)
      crates.add(match[1].replace(/-/g, "_"));
    }
  }

  // Add the crate's own lib/package name as a valid self-reference
  const libMatch = tomlContent.match(/\[lib\][\s\S]*?name\s*=\s*"([^"]+)"/);
  if (libMatch) crates.add(libMatch[1].replace(/-/g, "_"));
  const pkgMatch = tomlContent.match(/\[package\][\s\S]*?name\s*=\s*"([^"]+)"/);
  if (pkgMatch) crates.add(pkgMatch[1].replace(/-/g, "_"));

  return crates;
}

// --- 2. Walk Rust source files ---

function walkRsFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "target" || entry === "gen" || entry === ".git") continue;
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkRsFiles(fullPath, results);
    } else if (entry.endsWith(".rs")) {
      results.push(fullPath);
    }
  }
  return results;
}

// --- 3. Collect local modules to exclude ---

function collectLocalModules(dir, modules = new Set()) {
  for (const filePath of walkRsFiles(dir)) {
    const content = readFileSync(filePath, "utf8");
    const modRegex = /\bmod\s+([a-z0-9_]+)/gi;
    let modMatch;
    while ((modMatch = modRegex.exec(content)) !== null) {
      modules.add(modMatch[1]);
    }
  }
  return modules;
}

// Standard library crate roots and known prelude items that appear as
// lowercase identifiers with `::` but are NOT external crates.
const STD_AND_PRELUDE = new Set([
  "std", "core", "alloc", "test", "proc_macro",
  "crate", "super", "self",
  // Common std types used with :: (all lowercase or in prelude)
  "vec", "option", "result", "string", "box",
]);

// Rust primitive types that support associated functions (e.g. `u8::from_str_radix`).
const PRIMITIVES = new Set([
  "u8", "u16", "u32", "u64", "u128", "usize",
  "i8", "i16", "i32", "i64", "i128", "isize",
  "f32", "f64", "bool", "char", "str",
]);

// Lint tool namespaces used in attributes like `#[allow(clippy::...)]`.
const LINT_NAMESPACES = new Set(["clippy", "rustfmt"]);

// --- 4. Collect use-imported names (lowercase identifiers brought into scope) ---

function collectUseImports(dir, imports = new Set()) {
  for (const filePath of walkRsFiles(dir)) {
    const content = readFileSync(filePath, "utf8");
    // Strip comments to avoid matching inside them
    const cleaned = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

    // Match `use <path>::{<items>};` and `use <path>::<item>;`
    // We only care about the final segment(s) — those are the names in scope.
    const useRegex = /\buse\s+([\s\S]*?);/g;
    let useMatch;
    while ((useMatch = useRegex.exec(cleaned)) !== null) {
      const useBody = useMatch[1];
      // Handle grouped imports: `path::{a, b, c}`
      const groupMatch = useBody.match(/([\s\S]*?)::\s*\{([^}]*)\}/);
      if (groupMatch) {
        for (const item of groupMatch[2].split(",")) {
          const name = item.trim().split(/\s+as\s+/)[0].trim();
          // `self` means the module before `::` is imported
          if (name === "self") {
            const pathSegments = groupMatch[1].trim().split("::");
            const last = pathSegments[pathSegments.length - 1].trim();
            if (last && isSnakeCase(last)) imports.add(last);
          } else if (name && isSnakeCase(name)) {
            imports.add(name);
          }
        }
      } else {
        // Non-grouped: last segment of the path is the imported name
        const segments = useBody.trim().split("::");
        const last = segments[segments.length - 1].trim().split(/\s+as\s+/)[0].trim();
        if (last && isSnakeCase(last)) imports.add(last);
      }
    }
  }
  return imports;
}

// --- 4. Scan for external crate references ---

function isSnakeCase(name) {
  // Crate names are all lowercase with underscores. Types are CamelCase.
  // This filter eliminates ~95% of false positives (type method calls).
  return /^[a-z][a-z0-9_]*$/.test(name) && name !== name.toUpperCase();
}

function scanFile(filePath, declaredCrates, localModules, useImports) {
  const rawContent = readFileSync(filePath, "utf8");
  // Strip comments and `use ...;` declarations so we only scan actual usage,
  // not import statements (which legitimately reference crate paths).
  const content = rawContent
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\buse\s+[\s\S]*?;/g, "");
  const issues = [];
  const seen = new Set(); // dedupe within a file

  // Match `<snake_case_name>::` — potential crate root references.
  // Use a lookbehind to avoid matching after `.` (method call) or `::`
  // (nested path), and after word characters (part of a larger identifier).
  const crateRefRegex = /(?<![.\w:])[a-z_][a-z0-9_]*::/gi;

  let match;
  while ((match = crateRefRegex.exec(content)) !== null) {
    const refName = match[0].slice(0, -2); // strip trailing ::

    if (!isSnakeCase(refName)) continue;
    if (STD_AND_PRELUDE.has(refName)) continue;
    if (PRIMITIVES.has(refName)) continue;
    if (LINT_NAMESPACES.has(refName)) continue;
    if (declaredCrates.has(refName)) continue;
    if (localModules.has(refName)) continue;
    if (useImports.has(refName)) continue;

    const lineNumber = content.slice(0, match.index).split("\n").length;
    const key = `${refName}:${lineNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);

    issues.push({
      file: path.relative(rootDir, filePath),
      line: lineNumber,
      crate: refName,
      snippet: content.split("\n")[lineNumber - 1]?.trim() ?? "",
    });
  }

  return issues;
}

// --- Main ---

const cargoContent = readFileSync(cargoTomlPath, "utf8");
const declaredCrates = parseDeclaredCrates(cargoContent);
const localModules = collectLocalModules(tauriSrcDir);
const useImports = collectUseImports(tauriSrcDir);

const allIssues = [];
for (const filePath of walkRsFiles(tauriSrcDir)) {
  allIssues.push(...scanFile(filePath, declaredCrates, localModules, useImports));
}

if (allIssues.length === 0) {
  console.log("✓ Cross-platform crate check passed — no undeclared crate references found.");
  process.exit(0);
}

console.error("✗ Cross-platform crate check FAILED — found undeclared crate references:\n");
for (const issue of allIssues) {
  console.error(`  ${issue.file}:${issue.line}  →  ${issue.crate}::`);
  console.error(`    ${issue.snippet}`);
}
console.error(
  `\nThese crates are referenced in source but not declared in Cargo.toml. ` +
    `They may be inside #[cfg(target_os = ...)] blocks that compile on ` +
    `some platforms but break CI on others. Either add the dependency to ` +
    `Cargo.toml or replace the usage with a std/declared-crate alternative.\n`
);
process.exit(1);
