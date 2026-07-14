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
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g
  for (const match of source.matchAll(linkPattern)) {
    let target = match[1].trim()
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1)
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
