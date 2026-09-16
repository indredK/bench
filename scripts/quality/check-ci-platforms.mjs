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

// T27.1 豁免：关键浏览器 E2E 跑在 ubuntu（Chromium 依赖链最省事、runner 最便宜）。
// 豁免范围精确到 e2e-critical job 块内的行；Linux 上的 Rust / 打包 / 发布链
// 位于其它 job，仍一律拒绝。
const E2E_JOB_RE = /^ {2}e2e-critical:\s*$/

function e2eJobLines(content) {
  const lines = content.split("\n")
  const allowed = new Set()
  let inside = false
  for (const [index, line] of lines.entries()) {
    if (E2E_JOB_RE.test(line)) {
      inside = true
      allowed.add(index)
      // job 头上方的连续注释行同样豁免（属于该 job 的说明文字）。
      for (let cursor = index - 1; cursor >= 0 && /^\s*#/.test(lines[cursor]); cursor--) {
        allowed.add(cursor)
      }
      continue
    }
    if (inside) {
      // 下一个顶层 job（两空格缩进的 key）即离开 e2e-critical 块。
      if (/^ {2}\S/.test(line)) inside = false
      else allowed.add(index)
    }
  }
  return allowed
}

export function findForbiddenCiPlatforms(file, content) {
  const violations = []
  const lines = content.split("\n")
  const allowed = e2eJobLines(content)
  for (const [index, line] of lines.entries()) {
    if (allowed.has(index)) continue
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
