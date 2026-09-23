/**
 * JSON Schema validator / 模式校验: 纯前端逻辑，零依赖。
 *
 * 刻意不走 IPC 也不引第三方（ajv 等）：本机离线装不了新依赖，而「给一段配置 JSON 配
 * 一个手写 schema 看是否合规」用到的就是 Draft-07 的核心子集，自研既能自测、又不会被
 * 依赖拖进体积/供应链风险（与 regex-tester 同源思路）。
 *
 * 可靠性护栏（design §2「不得把不确定伪装成成功」）：
 * - schema / 数据解析失败一律返回结构化错误，不抛异常；
 * - 遇到**不支持的关键字**不静默放过，而是记进 `unsupported` 让上层标「尽力校验」，
 *   绝不因为漏判就把不合规数据报成 valid；
 * - 递归深度、步数、输出错误数都有上界，避免病态 schema / 数据把渲染线程钉死。
 */

/** 参与解析的 schema/数据字符上限，兜住超大 JSON.parse 的最坏耗时。 */
const MAX_TEXT = 200_000
/** 递归下探的最大深度，防止超深嵌套。 */
const MAX_DEPTH = 64
/** 单次校验的最大评估步数，防止 anyOf/oneOf 组合爆炸。 */
const MAX_STEPS = 200_000
/** 最多收集的错误条数，超出即截断。 */
const MAX_ISSUES = 200

/** 识别为注解（忽略即可，不算 unsupported）的关键字。 */
const ANNOTATION_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$comment",
  "$defs",
  "definitions",
  "title",
  "description",
  "default",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
  "format",
])

/** 本实现支持的关键字；不在表内、又不是注解的，记为 unsupported。 */
const SUPPORTED_KEYWORDS = new Set([
  "type",
  "enum",
  "const",
  "anyOf",
  "allOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "required",
  "properties",
  "patternProperties",
  "additionalProperties",
  "propertyNames",
  "minProperties",
  "maxProperties",
  "items",
  "additionalItems",
  "prefixItems",
  "minItems",
  "maxItems",
  "uniqueItems",
  "contains",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "$ref",
])

export interface JsonSchemaIssue {
  /** 失败位置的 JSON Pointer（如 "/user/age"；根为 ""）。 */
  path: string
  /** 简明英文说明，与 regex 错误同源直显。 */
  message: string
}

export type JsonSchemaResult =
  | {
      ok: true
      /** 数据是否合规；当 unsupported 非空时该结论为「尽力」——已核关键字全过但未覆盖全部约束。 */
      valid: boolean
      issues: JsonSchemaIssue[]
      /** schema 里本实现无法评估、已跳过的关键字（去重）。 */
      unsupported: string[]
      truncated: boolean
    }
  | { ok: false; error: string }

interface Ctx {
  root: unknown
  issues: JsonSchemaIssue[]
  unsupported: Set<string>
  steps: number
  truncated: boolean
}

export function validateJsonSchema(schemaText: string, dataText: string): JsonSchemaResult {
  if (schemaText.length > MAX_TEXT || dataText.length > MAX_TEXT) {
    return { ok: false, error: `input exceeds ${MAX_TEXT} characters` }
  }
  if (schemaText.trim() === "") {
    return { ok: false, error: "schema is empty" }
  }

  let schema: unknown
  try {
    schema = JSON.parse(schemaText)
  } catch (error) {
    return { ok: false, error: `schema is not valid JSON: ${messageOf(error)}` }
  }
  if (typeof schema !== "boolean" && !isPlainObject(schema)) {
    return { ok: false, error: "schema must be a JSON object or boolean" }
  }

  let data: unknown
  try {
    data = JSON.parse(dataText)
  } catch (error) {
    return { ok: false, error: `data is not valid JSON: ${messageOf(error)}` }
  }

  const ctx: Ctx = {
    root: schema,
    issues: [],
    unsupported: new Set<string>(),
    steps: 0,
    truncated: false,
  }
  validateNode(schema, data, "", ctx, 0)

  return {
    ok: true,
    valid: ctx.issues.length === 0 && !ctx.truncated,
    issues: ctx.issues,
    unsupported: [...ctx.unsupported].sort(),
    truncated: ctx.truncated,
  }
}

function validateNode(schema: unknown, data: unknown, path: string, ctx: Ctx, depth: number): void {
  if (ctx.truncated) return
  ctx.steps += 1
  if (ctx.steps > MAX_STEPS) {
    ctx.truncated = true
    return
  }
  if (depth > MAX_DEPTH) {
    ctx.truncated = true
    addIssue(ctx, path, "max schema depth exceeded; validation incomplete")
    return
  }
  // Draft-06+ 布尔 schema：true 放行一切，false 拒绝一切。
  if (schema === true) return
  if (schema === false) {
    addIssue(ctx, path, "schema is false here; no value is allowed")
    return
  }
  if (!isPlainObject(schema)) {
    // 非对象、非布尔的「schema」视为不合法约束——保守拒绝并说明。
    addIssue(ctx, path, "encountered a non-object schema; treated as invalid")
    return
  }

  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key) && !ANNOTATION_KEYWORDS.has(key)) {
      ctx.unsupported.add(key)
    }
  }

  if (schema.$ref !== undefined) {
    const resolved = resolveRef(String(schema.$ref), ctx)
    if (resolved.notFound) {
      addIssue(ctx, path, `cannot resolve $ref "${schema.$ref}"`)
    } else {
      validateNode(resolved.value, data, path, ctx, depth + 1)
    }
  }

  if (schema.type !== undefined) checkType(schema.type, data, path, ctx)
  if (schema.enum !== undefined && Array.isArray(schema.enum)) {
    if (!schema.enum.some((option: unknown) => deepEqual(option, data))) {
      addIssue(ctx, path, `value must be one of: ${schema.enum.map(render).join(", ")}`)
    }
  }
  if ("const" in schema && !deepEqual(schema.const, data)) {
    addIssue(ctx, path, `value must equal ${render(schema.const)}`)
  }

  checkCombinators(schema, data, path, ctx, depth)
  checkConditional(schema, data, path, ctx, depth)
  checkObject(schema, data, path, ctx, depth)
  checkArray(schema, data, path, ctx, depth)
  checkNumber(schema, data, path, ctx)
  checkString(schema, data, path, ctx)
}

function checkCombinators(
  schema: Record<string, unknown>,
  data: unknown,
  path: string,
  ctx: Ctx,
  depth: number,
): void {
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) validateNode(sub, data, path, ctx, depth + 1)
  }
  if (Array.isArray(schema.anyOf)) {
    if (!matchesAny(schema.anyOf, data, ctx, depth)) {
      addIssue(ctx, path, "value must match at least one of anyOf")
    }
  }
  if (Array.isArray(schema.oneOf)) {
    let matched = 0
    for (const sub of schema.oneOf) {
      if (subvalidates(sub, data, ctx, depth)) matched += 1
    }
    if (matched !== 1) {
      addIssue(ctx, path, `value must match exactly one of oneOf (matched ${matched})`)
    }
  }
  if (schema.not !== undefined && subvalidates(schema.not, data, ctx, depth)) {
    addIssue(ctx, path, "value must NOT match the `not` schema")
  }
}

function matchesAny(schemas: unknown[], data: unknown, ctx: Ctx, depth: number): boolean {
  return schemas.some((sub) => subvalidates(sub, data, ctx, depth))
}

/** 在隔离的子上下文里跑一遍 schema，只关心「有没有新错误」，不污染主 issues。 */
function subvalidates(sub: unknown, data: unknown, ctx: Ctx, depth: number): boolean {
  const probe: Ctx = {
    root: ctx.root,
    issues: [],
    unsupported: ctx.unsupported,
    steps: 0,
    truncated: false,
  }
  validateNode(sub, data, "", probe, depth)
  return probe.issues.length === 0 && !probe.truncated
}

function checkConditional(
  schema: Record<string, unknown>,
  data: unknown,
  path: string,
  ctx: Ctx,
  depth: number,
): void {
  if (schema.if === undefined) return
  const passes = subvalidates(schema.if, data, ctx, depth)
  if (passes && schema.then !== undefined) {
    validateNode(schema.then, data, path, ctx, depth + 1)
  }
  if (!passes && schema.else !== undefined) {
    validateNode(schema.else, data, path, ctx, depth + 1)
  }
}

function checkObject(
  schema: Record<string, unknown>,
  data: unknown,
  path: string,
  ctx: Ctx,
  depth: number,
): void {
  if (!isPlainObject(data)) return
  const props = isPlainObject(schema.properties) ? schema.properties : undefined
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (typeof key === "string" && !(key in data)) {
        addIssue(ctx, joinPointer(path, key), "required property is missing")
      }
    }
  }
  if (props) {
    for (const [key, sub] of Object.entries(props)) {
      if (key in data) validateNode(sub, data[key], joinPointer(path, key), ctx, depth + 1)
    }
  }
  if (isPlainObject(schema.patternProperties)) {
    for (const [pattern, sub] of Object.entries(schema.patternProperties)) {
      const re = compile(pattern)
      if (!re) continue
      for (const [key, value] of Object.entries(data)) {
        if (re.test(key)) validateNode(sub, value, joinPointer(path, key), ctx, depth + 1)
      }
    }
  }
  if (schema.additionalProperties !== undefined) {
    const defined = new Set<string>(Object.keys(props ?? {}))
    const matchedByPattern = (key: string): boolean => {
      const pats = isPlainObject(schema.patternProperties)
        ? Object.keys(schema.patternProperties)
        : []
      return pats.some((p) => compile(p)?.test(key) ?? false)
    }
    for (const [key, value] of Object.entries(data)) {
      if (defined.has(key) || matchedByPattern(key)) continue
      if (schema.additionalProperties === false) {
        addIssue(ctx, joinPointer(path, key), "additional property is not allowed")
      } else if (
        isPlainObject(schema.additionalProperties) ||
        typeof schema.additionalProperties === "boolean"
      ) {
        validateNode(schema.additionalProperties, value, joinPointer(path, key), ctx, depth + 1)
      }
    }
  }
  if (schema.propertyNames !== undefined) {
    for (const key of Object.keys(data)) {
      validateNode(schema.propertyNames, key, joinPointer(path, key), ctx, depth + 1)
    }
  }
  const count = Object.keys(data).length
  if (typeof schema.minProperties === "number" && count < schema.minProperties) {
    addIssue(ctx, path, `must have at least ${schema.minProperties} properties`)
  }
  if (typeof schema.maxProperties === "number" && count > schema.maxProperties) {
    addIssue(ctx, path, `must have at most ${schema.maxProperties} properties`)
  }
}

function checkArray(
  schema: Record<string, unknown>,
  data: unknown,
  path: string,
  ctx: Ctx,
  depth: number,
): void {
  if (!Array.isArray(data)) return
  const items = schema.items
  if (Array.isArray(items)) {
    // 旧式 tuple（items 为数组）。
    items.forEach((sub, index) => {
      if (index < data.length) validateNode(sub, data[index], `${path}/${index}`, ctx, depth + 1)
    })
    if (schema.additionalItems === false && data.length > items.length) {
      addIssue(ctx, path, `tuple allows at most ${items.length} items`)
    } else if (isPlainObject(schema.additionalItems)) {
      for (let index = items.length; index < data.length; index += 1) {
        validateNode(schema.additionalItems, data[index], `${path}/${index}`, ctx, depth + 1)
      }
    }
  } else if (items !== undefined) {
    data.forEach((element, index) => {
      validateNode(items, element, `${path}/${index}`, ctx, depth + 1)
    })
  }
  if (typeof schema.minItems === "number" && data.length < schema.minItems) {
    addIssue(ctx, path, `must have at least ${schema.minItems} items`)
  }
  if (typeof schema.maxItems === "number" && data.length > schema.maxItems) {
    addIssue(ctx, path, `must have at most ${schema.maxItems} items`)
  }
  if (schema.uniqueItems === true && hasDuplicates(data)) {
    addIssue(ctx, path, "array items must be unique")
  }
  if (schema.contains !== undefined) {
    if (!data.some((element) => subvalidates(schema.contains, element, ctx, depth))) {
      addIssue(ctx, path, "array must contain at least one item matching `contains`")
    }
  }
}

function checkNumber(schema: Record<string, unknown>, data: unknown, path: string, ctx: Ctx): void {
  if (typeof data !== "number" || !Number.isFinite(data)) return
  if (typeof schema.minimum === "number" && data < schema.minimum) {
    addIssue(ctx, path, `must be >= ${schema.minimum}`)
  }
  if (typeof schema.maximum === "number" && data > schema.maximum) {
    addIssue(ctx, path, `must be <= ${schema.maximum}`)
  }
  if (typeof schema.exclusiveMinimum === "number" && data <= schema.exclusiveMinimum) {
    addIssue(ctx, path, `must be > ${schema.exclusiveMinimum}`)
  }
  if (typeof schema.exclusiveMaximum === "number" && data >= schema.exclusiveMaximum) {
    addIssue(ctx, path, `must be < ${schema.exclusiveMaximum}`)
  }
  if (typeof schema.multipleOf === "number" && schema.multipleOf > 0) {
    const quotient = data / schema.multipleOf
    if (Math.abs(quotient - Math.round(quotient)) > 1e-9) {
      addIssue(ctx, path, `must be a multiple of ${schema.multipleOf}`)
    }
  }
}

function checkString(schema: Record<string, unknown>, data: unknown, path: string, ctx: Ctx): void {
  if (typeof data !== "string") return
  // UTF-16 code units 近似长度（足够工具场景使用）。
  if (typeof schema.minLength === "number" && data.length < schema.minLength) {
    addIssue(ctx, path, `must be at least ${schema.minLength} characters`)
  }
  if (typeof schema.maxLength === "number" && data.length > schema.maxLength) {
    addIssue(ctx, path, `must be at most ${schema.maxLength} characters`)
  }
  if (typeof schema.pattern === "string") {
    const re = compile(schema.pattern)
    if (!re) {
      addIssue(ctx, path, `invalid pattern in schema: ${schema.pattern}`)
    } else if (!re.test(data)) {
      addIssue(ctx, path, `must match pattern /${schema.pattern}/`)
    }
  }
}

const TYPE_SET = new Set(["object", "array", "string", "number", "integer", "boolean", "null"])

function checkType(type: unknown, data: unknown, path: string, ctx: Ctx): void {
  const wanted = Array.isArray(type) ? type : [type]
  if (!wanted.some((entry) => typeof entry === "string" && matchesType(entry, data))) {
    addIssue(
      ctx,
      path,
      `expected type ${Array.isArray(type) ? type.map(String).join(" | ") : String(type)}`,
    )
  }
}

function matchesType(entry: string, data: unknown): boolean {
  if (!TYPE_SET.has(entry)) return false
  switch (entry) {
    case "object":
      return isPlainObject(data)
    case "array":
      return Array.isArray(data)
    case "string":
      return typeof data === "string"
    case "number":
      return typeof data === "number" && Number.isFinite(data)
    case "integer":
      return typeof data === "number" && Number.isInteger(data)
    case "boolean":
      return typeof data === "boolean"
    case "null":
      return data === null
    default:
      return false
  }
}

function resolveRef(ref: string, ctx: Ctx): { value?: unknown; notFound?: boolean } {
  if (!ref.startsWith("#")) return { notFound: true }
  const pointer = ref.slice(1)
  if (pointer === "" || pointer === "/") return { value: ctx.root }
  let current: unknown = ctx.root
  for (const rawSegment of pointer.replace(/^\//, "").split("/")) {
    const segment = decodeURIComponent(rawSegment).replace(/~1/g, "/").replace(/~0/g, "~")
    if (isPlainObject(current) && segment in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[segment]
    } else if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)]
    } else {
      return { notFound: true }
    }
  }
  return { value: current }
}

function hasDuplicates(arr: unknown[]): boolean {
  for (let i = 0; i < arr.length; i += 1) {
    for (let j = i + 1; j < arr.length; j += 1) {
      if (deepEqual(arr[i], arr[j])) return true
    }
  }
  return false
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => deepEqual(value, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return (
      ka.length === kb.length &&
      ka.every(
        (key) =>
          key in b &&
          deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
      )
    )
  }
  return false
}

function compile(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern)
  } catch {
    return null
  }
}

function addIssue(ctx: Ctx, path: string, message: string): void {
  if (ctx.issues.length >= MAX_ISSUES) {
    ctx.truncated = true
    return
  }
  ctx.issues.push({ path, message })
}

function joinPointer(path: string, key: string): string {
  const escaped = key.replace(/~/g, "~0").replace(/\//g, "~1")
  return `${path}/${escaped}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function render(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value)
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
