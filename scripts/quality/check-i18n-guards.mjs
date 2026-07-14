import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const scriptPath = fileURLToPath(import.meta.url)
const rootDir = path.resolve(path.dirname(scriptPath), "..", "..")

const REQUIRED_KEYS = [
  "common.appTitle",
  "theme.sectionTitle",
  "portManager.errors.desktopOnly",
  "portManager.errors.killOneFailed",
  "portManager.errors.killAllFailed",
  "appManager.errors.scanFailed",
  "appManager.errors.updateCheckFailed",
  "appManager.errors.missingMacAppStoreId",
  "appManager.errors.noDownloadUrl",
  "appManager.errors.genericBatchFailure",
]

// UNKNOWN intentionally falls back to the structured backend message.
export const EMPTY_LOCALE_ALLOWLIST = new Map([
  ["errors.UNKNOWN", "Empty by design so the raw structured error remains visible."],
])

const SKIP_DIRS = new Set(["node_modules", "locales", "__tests__", "dist", ".git"])
const USER_VISIBLE_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "placeholder",
  "title",
])
const IGNORED_JSX_TAGS = new Set(["script", "style", "Trans"])
const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/
// Language-neutral protocol, currency, algorithm, brand, and formula tokens.
// Keeping this list explicit prevents broad "all-uppercase is safe" exemptions.
const TECHNICAL_LITERAL_TOKENS = [
  "SOCKS5",
  "SHA256",
  "SHA384",
  "SHA512",
  "HTTP",
  "SHA1",
  "MD5",
  "USD",
  "CNY",
  "tokens",
  "1M",
  "B",
  "v",
]
const TECHNICAL_LITERAL_RE = new RegExp(
  `\\b(?:${TECHNICAL_LITERAL_TOKENS.map((token) =>
    token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|")})\\b`,
  "g",
)

function issue(kind, message, details = {}) {
  return { kind, message, ...details }
}

function displayType(value) {
  if (Array.isArray(value)) return "array"
  if (value === null) return "null"
  return typeof value
}

export function flattenLocale(value, prefix = "", output = new Map()) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    output.set(prefix, value)
    return output
  }

  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (child != null && typeof child === "object" && !Array.isArray(child)) {
      flattenLocale(child, fullKey, output)
    } else {
      output.set(fullKey, child)
    }
  }
  return output
}

export function extractInterpolationTokens(value) {
  if (typeof value !== "string") return []
  const tokens = new Set()
  for (const match of value.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/g)) {
    tokens.add(match[1])
  }
  return [...tokens].sort()
}

export function validateLocaleObjects(en, zh, options = {}) {
  const emptyAllowlist = options.emptyAllowlist ?? EMPTY_LOCALE_ALLOWLIST
  const enEntries = flattenLocale(en)
  const zhEntries = flattenLocale(zh)
  const issues = []

  for (const key of [...enEntries.keys()].sort()) {
    if (!zhEntries.has(key)) {
      issues.push(issue("missing-key", `${key} exists in en but is missing in zh`, { key }))
      continue
    }

    const enValue = enEntries.get(key)
    const zhValue = zhEntries.get(key)
    const enType = displayType(enValue)
    const zhType = displayType(zhValue)

    if (enType !== zhType) {
      issues.push(
        issue("type-mismatch", `${key} has type ${enType} in en and ${zhType} in zh`, { key }),
      )
      continue
    }

    if (typeof enValue === "string") {
      const enEmpty = !enValue.trim()
      const zhEmpty = !String(zhValue).trim()
      if (enEmpty !== zhEmpty) {
        issues.push(issue("empty-mismatch", `${key} is empty in only one locale`, { key }))
      } else if (enEmpty && !emptyAllowlist.has(key)) {
        issues.push(issue("empty-value", `${key} must be non-empty in both locales`, { key }))
      }

      const enTokens = extractInterpolationTokens(enValue)
      const zhTokens = extractInterpolationTokens(zhValue)
      if (enTokens.join("\0") !== zhTokens.join("\0")) {
        issues.push(
          issue(
            "placeholder-mismatch",
            `${key} interpolation differs: en=[${enTokens.join(", ")}] zh=[${zhTokens.join(", ")}]`,
            { key },
          ),
        )
      }
    }
  }

  for (const key of [...zhEntries.keys()].sort()) {
    if (!enEntries.has(key)) {
      issues.push(issue("missing-key", `${key} exists in zh but is missing in en`, { key }))
    }
  }

  const pluralFamilies = new Map()
  for (const key of enEntries.keys()) {
    const match = PLURAL_SUFFIX_RE.exec(key)
    if (!match) continue
    const family = key.slice(0, -match[0].length)
    if (!pluralFamilies.has(family)) pluralFamilies.set(family, new Set())
    pluralFamilies.get(family).add(match[1])
  }
  for (const [family, suffixes] of pluralFamilies) {
    if (!suffixes.has("other")) {
      issues.push(
        issue("plural-family", `${family} has plural variants but no _other key`, { key: family }),
      )
    }
  }

  return { issues, enEntries, zhEntries }
}

function propertyNameText(name) {
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isIdentifier(name)) {
    return name.text
  }
  return null
}

export function findDuplicateJsonKeys(text, fileName = "locale.json") {
  const sourceFile = ts.parseJsonText(fileName, text)
  const issues = sourceFile.parseDiagnostics.map((diagnostic) =>
    issue("invalid-json", ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"), {
      file: fileName,
    }),
  )

  function visit(node, objectPath = "") {
    if (ts.isObjectLiteralExpression(node)) {
      const seen = new Set()
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) continue
        const name = propertyNameText(property.name)
        if (name == null) continue
        const key = objectPath ? `${objectPath}.${name}` : name
        if (seen.has(name)) {
          const position = sourceFile.getLineAndCharacterOfPosition(
            property.name.getStart(sourceFile),
          )
          issues.push(
            issue("duplicate-key", `duplicate locale key ${key}`, {
              file: fileName,
              line: position.line + 1,
              key,
            }),
          )
        }
        seen.add(name)
        visit(property.initializer, key)
      }
      return
    }
    ts.forEachChild(node, (child) => visit(child, objectPath))
  }

  visit(sourceFile)
  return issues
}

function walkSourceFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      walkSourceFiles(fullPath, files)
    } else if (/\.tsx?$/.test(entry) && !/\.(?:test|spec)\.tsx?$/.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}

function translationCallName(expression) {
  if (ts.isIdentifier(expression) && expression.text === "t") return "t"
  if (ts.isPropertyAccessExpression(expression) && expression.name.text === "t") {
    return expression.getText()
  }
  return null
}

function templatePattern(template) {
  if (ts.isStringLiteral(template) || ts.isNoSubstitutionTemplateLiteral(template)) {
    return { exact: template.text, pattern: null }
  }
  if (!ts.isTemplateExpression(template)) return null

  const pieces = [template.head.text, ...template.templateSpans.map((span) => span.literal.text)]
  const escaped = pieces.map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  return {
    exact: null,
    pattern: new RegExp(`^${escaped.join(".+")}$`),
    display: pieces.join("${...}"),
  }
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join("${...}")
  }
  if (ts.isJsxText(node)) return node.getText()
  return null
}

function isUserFacingText(value) {
  const normalized = value.replace(/\s+/g, " ").trim()
  const withoutTechnicalTokens = normalized
    .replace(/&[A-Za-z][A-Za-z0-9]+;/g, "")
    .replace(TECHNICAL_LITERAL_RE, "")
  return normalized.length > 0 && /\p{L}/u.test(withoutTechnicalTokens)
}

function jsxTagName(node) {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText()
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText()
  return null
}

function callLabel(expression) {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.getText()
  return ""
}

function sourceLocation(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return position.line + 1
}

export function analyzeSource(content, fileName, options = {}) {
  const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  )
  const checkHardcoded = options.checkHardcoded ?? true
  const staticKeys = new Map()
  const dynamicPatterns = []
  const hardcoded = []

  function recordHardcoded(node, value, context) {
    if (!checkHardcoded || !isUserFacingText(value)) return
    hardcoded.push(
      issue("hardcoded-text", `${context}: ${JSON.stringify(value.replace(/\s+/g, " ").trim())}`, {
        file: fileName,
        line: sourceLocation(sourceFile, node),
      }),
    )
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const translationName = translationCallName(node.expression)
      if (translationName && node.arguments.length > 0) {
        const pattern = templatePattern(node.arguments[0])
        if (pattern?.exact) {
          if (!staticKeys.has(pattern.exact)) staticKeys.set(pattern.exact, [])
          staticKeys
            .get(pattern.exact)
            .push({ file: fileName, line: sourceLocation(sourceFile, node) })
        } else if (pattern?.pattern) {
          dynamicPatterns.push({
            ...pattern,
            file: fileName,
            line: sourceLocation(sourceFile, node),
          })
        }
      }

      const label = callLabel(node.expression)
      const isVisibleCall =
        /(^|\.)toast\.(success|error|info|warning|loading)$/.test(label) ||
        /^(alert|confirm|prompt)$/.test(label)
      if (isVisibleCall && node.arguments.length > 0) {
        const value = literalText(node.arguments[0])
        if (value != null) recordHardcoded(node.arguments[0], value, `${label} argument`)
      }
    }

    if (ts.isJsxText(node)) {
      const tag = ts.isJsxElement(node.parent) ? jsxTagName(node.parent) : null
      if (!tag || !IGNORED_JSX_TAGS.has(tag)) recordHardcoded(node, node.getText(), "JSX text")
    }

    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      const value = literalText(node.expression)
      if (value != null) recordHardcoded(node.expression, value, "JSX expression")
    }

    if (ts.isJsxAttribute(node) && USER_VISIBLE_ATTRIBUTES.has(node.name.getText())) {
      let value = null
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        value = node.initializer.text
      } else if (
        node.initializer &&
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression
      ) {
        value = literalText(node.initializer.expression)
      }
      if (value != null) recordHardcoded(node, value, `${node.name.getText()} attribute`)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return { staticKeys, dynamicPatterns, hardcoded }
}

export function validateTranslationUsage(analyses, localeEntries) {
  const issues = []
  const localeKeys = [...localeEntries.keys()]

  for (const analysis of analyses) {
    for (const [key, locations] of analysis.staticKeys) {
      if (localeEntries.has(key)) continue
      const location = locations[0]
      issues.push(
        issue("missing-used-key", `translation key ${key} is missing`, {
          key,
          file: location.file,
          line: location.line,
        }),
      )
    }
    for (const dynamic of analysis.dynamicPatterns) {
      if (localeKeys.some((key) => dynamic.pattern.test(key))) continue
      issues.push(
        issue(
          "missing-dynamic-family",
          `dynamic translation family ${dynamic.display} has no keys`,
          {
            file: dynamic.file,
            line: dynamic.line,
          },
        ),
      )
    }
    issues.push(...analysis.hardcoded)
  }
  return issues
}

function printIssues(issues) {
  for (const item of issues) {
    const location = item.file ? `${item.file}${item.line ? `:${item.line}` : ""}` : item.key
    console.error(`  ${location ? `${location} - ` : ""}${item.message}`)
  }
}

export function runI18nGuards() {
  const localePaths = {
    en: "src/i18n/locales/en.json",
    zh: "src/i18n/locales/zh.json",
  }
  const rawLocales = Object.fromEntries(
    Object.entries(localePaths).map(([locale, relativePath]) => [
      locale,
      readFileSync(path.join(rootDir, relativePath), "utf8"),
    ]),
  )

  const jsonIssues = [
    ...findDuplicateJsonKeys(rawLocales.en, localePaths.en),
    ...findDuplicateJsonKeys(rawLocales.zh, localePaths.zh),
  ]
  if (jsonIssues.length > 0) {
    console.error("i18n guard failed: invalid locale JSON")
    printIssues(jsonIssues)
    return 1
  }

  const en = JSON.parse(rawLocales.en)
  const zh = JSON.parse(rawLocales.zh)
  const localeResult = validateLocaleObjects(en, zh)

  for (const key of REQUIRED_KEYS) {
    if (!localeResult.enEntries.has(key) || !localeResult.zhEntries.has(key)) {
      localeResult.issues.push(
        issue("missing-required-key", `required locale key ${key} is missing`, { key }),
      )
    }
  }

  const sourceFiles = walkSourceFiles(path.join(rootDir, "src"))
  const analyses = sourceFiles.map((file) => {
    const relativePath = path.relative(rootDir, file).replaceAll("\\", "/")
    return analyzeSource(readFileSync(file, "utf8"), relativePath, {
      checkHardcoded: !relativePath.startsWith("src/data/") && !relativePath.endsWith(".d.ts"),
    })
  })
  const usageIssues = validateTranslationUsage(analyses, localeResult.enEntries)
  const allIssues = [...localeResult.issues, ...usageIssues]

  if (allIssues.length > 0) {
    console.error(`i18n guard failed with ${allIssues.length} issue(s):`)
    printIssues(allIssues)
    return 1
  }

  const usedKeys = new Set()
  const dynamicPatterns = []
  for (const analysis of analyses) {
    for (const key of analysis.staticKeys.keys()) usedKeys.add(key)
    dynamicPatterns.push(...analysis.dynamicPatterns)
  }

  console.log(
    `Checked ${usedKeys.size} static i18n keys across ${sourceFiles.length} source files.`,
  )
  console.log(`Validated ${dynamicPatterns.length} dynamic i18n key families.`)
  console.log(
    `Locale structure passed: ${localeResult.enEntries.size} keys in both zh.json and en.json.`,
  )
  console.log("Frontend i18n guards passed.")
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  process.exit(runI18nGuards())
}
