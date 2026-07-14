import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const workflowsDir = path.join(rootDir, ".github", "workflows")

const forbiddenPlatformPatterns = [
  { label: "Linux platform", pattern: /\blinux\b/i },
  { label: "Ubuntu runner", pattern: /\bubuntu(?:-[a-z0-9.]+)?\b/i },
  { label: "Debian runner or package", pattern: /\bdebian\b/i },
  { label: "Fedora runner or package", pattern: /\bfedora\b/i },
  { label: "Alpine runner or package", pattern: /\balpine\b/i },
  { label: "AppImage package", pattern: /\bappimage\b/i },
  { label: "deb package", pattern: /(?:^|[^a-z0-9])\.?deb(?:$|[^a-z0-9])/i },
  { label: "rpm package", pattern: /(?:^|[^a-z0-9])\.?rpm(?:$|[^a-z0-9])/i },
]

export function findForbiddenCiPlatforms(file, content) {
  const violations = []
  for (const [index, line] of content.split("\n").entries()) {
    for (const rule of forbiddenPlatformPatterns) {
      if (rule.pattern.test(line)) {
        violations.push({ file, line: index + 1, label: rule.label, source: line.trim() })
      }
    }
  }
  return violations
}

export function checkCiPlatforms(directory = workflowsDir) {
  const violations = []
  const workflowFiles = readdirSync(directory)
    .filter((file) => /\.ya?ml$/i.test(file))
    .sort()

  for (const file of workflowFiles) {
    const content = readFileSync(path.join(directory, file), "utf8")
    violations.push(...findForbiddenCiPlatforms(file, content))
  }
  return { workflowCount: workflowFiles.length, violations }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkCiPlatforms()
  if (result.violations.length > 0) {
    console.error("CI platform guard failed: only macOS and Windows runners/packages are allowed.")
    for (const violation of result.violations) {
      console.error(`  ${violation.file}:${violation.line} ${violation.label}: ${violation.source}`)
    }
    process.exit(1)
  }

  console.log(
    `CI platform guard passed: ${result.workflowCount} workflows target macOS/Windows only.`,
  )
}
