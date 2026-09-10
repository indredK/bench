import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const docsRoot = path.join(repoRoot, "docs")

function collectMarkdownFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...collectMarkdownFiles(absolutePath))
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolutePath)
  }
  return files
}

const markdownFiles = collectMarkdownFiles(docsRoot)
const failures = []
let linkCount = 0

for (const markdownFile of markdownFiles) {
  const source = fs.readFileSync(markdownFile, "utf8")
  // Strip fenced code blocks before link extraction: ASCII diagrams inside
  // ``` fences contain parenthesized text that is not a Markdown link.
  const linkSource = source.replace(/^(`{3}|~{3})[^\n]*$[\s\S]*?^\1[^\n]*$/gm, "")
  // Strip inline code spans too: regex literals in `...` (e.g.
  // `^[a-z0-9]([a-z0-9-]*[a-z0-9])?`) contain `](` sequences that would
  // otherwise be parsed as link syntax.
  const codeStripped = linkSource.replace(/`[^`\n]+`/g, " ")
  // Angle-bracketed URLs (e.g. <https://x.com/a-(b)>) may contain ")" which
  // would otherwise break the simple [^)]+ capture; handle them as a unit.
  const linkPattern = /!?\[[^\]]*\]\((?:<([^>]+)>|([^)]+))\)/g
  for (const match of codeStripped.matchAll(linkPattern)) {
    let target = (match[1] ?? match[2]).trim()
    if (
      !target ||
      target.startsWith("#") ||
      target.startsWith("https://") ||
      target.startsWith("http://") ||
      target.startsWith("mailto:")
    ) {
      continue
    }

    const fileTarget = decodeURIComponent(target.split("#", 1)[0].split("?", 1)[0])
    if (!fileTarget) continue
    linkCount += 1
    const resolved = path.resolve(path.dirname(markdownFile), fileTarget)
    if (!fs.existsSync(resolved)) {
      failures.push(
        `${path.relative(repoRoot, markdownFile)} -> ${target} (missing ${path.relative(repoRoot, resolved)})`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error("Markdown relative link check failed:")
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(
  `Markdown relative links passed: ${linkCount} links across ${markdownFiles.length} files.`,
)
