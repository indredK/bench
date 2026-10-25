/**
 * Regex tester / 正则测试器: 纯前端逻辑，基于原生 RegExp。
 *
 * 刻意走前端而非 IPC: 后端 `regex` crate 的语义与 JS 正则不同（不支持前后向断言、
 * 反向引用），而「正则测试」的使用者写的是 JS/浏览器风味正则——用原生引擎才是他们
 * 期望的结果，且纯文本计算不需要任何特权能力。
 *
 * 可靠性护栏: 调用方必须在可终止的 Worker 中执行此函数；这里限制输入与结果规模，
 * Worker runner 另设时间上限，避免灾难性回溯阻塞渲染线程。
 */

export interface RegexGroup {
  /** 命名捕获组的名称；数字组为 undefined。 */
  name?: string
  value: string | null
}

export interface RegexMatch {
  index: number
  value: string
  groups: RegexGroup[]
}

export interface RegexTestRequest {
  pattern: string
  flags: string
  input: string
  replacement?: string
}

export type RegexTestErrorCode =
  | "INVALID_PATTERN"
  | "PATTERN_TOO_LONG"
  | "INPUT_TOO_LONG"
  | "REPLACEMENT_TOO_LONG"
  | "REPLACEMENT_OUTPUT_TOO_LARGE"
  | "MATCH_OUTPUT_TOO_LARGE"
  | "TIMEOUT"
  | "WORKER_UNAVAILABLE"
  | "WORKER_FAILED"

export type RegexTestResult =
  | {
      ok: true
      matches: RegexMatch[]
      total: number
      truncated: boolean
      /** 仅当调用方传入 replacement 时给出替换结果，否则为 null。 */
      replaced: string | null
    }
  | { ok: false; code: RegexTestErrorCode }

/** 最多枚举的匹配数，超出即截断，防止极端模式耗尽循环。 */
const MAX_MATCHES = 1000
/** 限制传入 Worker 的数据量，避免消息结构化克隆产生无界内存开销。 */
export const MAX_REGEX_PATTERN_LENGTH = 4096
export const MAX_REGEX_INPUT_LENGTH = 20000
export const MAX_REGEX_REPLACED_LENGTH = 1_000_000
/** Bound rendered match/capture payloads independently from replacement output. */
export const MAX_REGEX_MATCH_OUTPUT_LENGTH = 1_000_000
/** Bound React list work even when captures are empty strings. */
export const MAX_REGEX_RESULT_CAPTURE_ENTRIES = 4096
const MAX_REGEX_FLAGS_LENGTH = 8
const REPLACEMENT_OUTPUT_LIMIT = Symbol("replacement output limit")

function expandReplacementTemplate(
  template: string,
  input: string,
  matched: string,
  offset: number,
  captures: Array<string | undefined>,
  namedCaptures: Record<string, string | undefined> | undefined,
  maxLength: number,
): string {
  const parts: string[] = []
  let length = 0
  const append = (part: string) => {
    if (length + part.length > maxLength) throw REPLACEMENT_OUTPUT_LIMIT
    parts.push(part)
    length += part.length
  }

  for (let index = 0; index < template.length;) {
    const current = template[index]
    const next = template[index + 1]
    if (current === undefined) break
    if (current !== "$" || next === undefined) {
      append(current)
      index += 1
      continue
    }

    if (next === "$") {
      append("$")
      index += 2
      continue
    }
    if (next === "&") {
      append(matched)
      index += 2
      continue
    }
    if (next === "`") {
      append(input.slice(0, offset))
      index += 2
      continue
    }
    if (next === "'") {
      append(input.slice(offset + matched.length))
      index += 2
      continue
    }
    if (next === "<" && namedCaptures !== undefined) {
      const end = template.indexOf(">", index + 2)
      if (end !== -1) {
        const name = template.slice(index + 2, end)
        append(Object.hasOwn(namedCaptures, name) ? (namedCaptures[name] ?? "") : "")
        index = end + 1
        continue
      }
    }
    if (next >= "0" && next <= "9") {
      const first = Number(next)
      const second = template[index + 2]
      if (first === 0) {
        if (second !== undefined && second >= "1" && second <= "9") {
          const groupIndex = Number(second)
          if (groupIndex <= captures.length) {
            append(captures[groupIndex - 1] ?? "")
            index += 3
            continue
          }
        }
      } else {
        const twoDigit =
          second !== undefined && second >= "0" && second <= "9" ? first * 10 + Number(second) : 0
        if (twoDigit > 0 && twoDigit <= captures.length) {
          append(captures[twoDigit - 1] ?? "")
          index += 3
          continue
        }
        if (first <= captures.length) {
          append(captures[first - 1] ?? "")
          index += 2
          continue
        }
      }
    }

    // Invalid substitution forms remain literal, matching String.prototype.replace.
    append("$")
    index += 1
  }

  return parts.join("")
}

function replaceWithBoundedOutput(input: string, regex: RegExp, template: string): string {
  let emittedLength = 0
  let previousEnd = 0
  const result = input.replace(regex, (...args: unknown[]) => {
    const lastArgument = args[args.length - 1]
    const namedCaptures =
      typeof lastArgument === "object" && lastArgument !== null
        ? (args.pop() as Record<string, string | undefined>)
        : undefined
    const source = args.pop()
    const offset = args.pop()
    const matched = args[0]
    if (typeof source !== "string" || typeof offset !== "number" || typeof matched !== "string") {
      throw new TypeError("Unexpected RegExp replacement callback arguments")
    }

    const captures = args.slice(1) as Array<string | undefined>
    const unmatchedLength = offset - previousEnd
    if (unmatchedLength < 0 || emittedLength + unmatchedLength > MAX_REGEX_REPLACED_LENGTH) {
      throw REPLACEMENT_OUTPUT_LIMIT
    }
    emittedLength += unmatchedLength
    const replacement = expandReplacementTemplate(
      template,
      source,
      matched,
      offset,
      captures,
      namedCaptures,
      MAX_REGEX_REPLACED_LENGTH - emittedLength,
    )
    emittedLength += replacement.length
    previousEnd = offset + matched.length
    return replacement
  })

  if (result.length > MAX_REGEX_REPLACED_LENGTH) throw REPLACEMENT_OUTPUT_LIMIT
  return result
}

export function testRegex(
  pattern: string,
  flags: string,
  input: string,
  replacement?: string,
): RegexTestResult {
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return { ok: false, code: "PATTERN_TOO_LONG" }
  }
  if (input.length > MAX_REGEX_INPUT_LENGTH) {
    return { ok: false, code: "INPUT_TOO_LONG" }
  }
  if (replacement !== undefined && replacement.length > MAX_REGEX_INPUT_LENGTH) {
    return { ok: false, code: "REPLACEMENT_TOO_LONG" }
  }
  if (flags.length > MAX_REGEX_FLAGS_LENGTH) {
    return { ok: false, code: "INVALID_PATTERN" }
  }
  if (pattern === "") {
    return { ok: true, matches: [], total: 0, truncated: false, replaced: null }
  }

  let re: RegExp
  try {
    // 枚举全部匹配必须用 /g；保留用户其余 flags。非法 pattern/flags 归为结构化错误。
    const globalFlags = flags.includes("g") ? flags : `${flags}g`
    re = new RegExp(pattern, globalFlags)
  } catch {
    return { ok: false, code: "INVALID_PATTERN" }
  }

  const text = input
  const matches: RegexMatch[] = []
  let truncated = false
  let matchOutputLength = 0
  let resultGroupCount = 0

  let exec: RegExpExecArray | null
  while ((exec = re.exec(text)) !== null) {
    // A short pattern can still return a very large capture tree (for example, many
    // zero-width matches with hundreds of empty captures). Bound both text and entry
    // count before materializing objects that the UI would have to render.
    let nextMatchOutputLength = matchOutputLength + exec[0].length
    let nextGroupCount = resultGroupCount + Math.max(0, exec.length - 1)
    for (let i = 1; i < exec.length; i += 1) {
      nextMatchOutputLength += exec[i]?.length ?? 0
    }
    if (exec.groups) {
      for (const value of Object.values(exec.groups)) {
        nextGroupCount += 1
        nextMatchOutputLength += value?.length ?? 0
      }
    }
    if (
      nextMatchOutputLength > MAX_REGEX_MATCH_OUTPUT_LENGTH ||
      nextGroupCount > MAX_REGEX_RESULT_CAPTURE_ENTRIES
    ) {
      return { ok: false, code: "MATCH_OUTPUT_TOO_LARGE" }
    }

    const groups: RegexGroup[] = []
    for (let i = 1; i < exec.length; i += 1) {
      groups.push({ value: exec[i] ?? null })
    }
    if (exec.groups) {
      for (const [name, value] of Object.entries(exec.groups)) {
        groups.push({ name, value: (value as string | undefined) ?? null })
      }
    }
    matches.push({ index: exec.index, value: exec[0], groups })
    matchOutputLength = nextMatchOutputLength
    resultGroupCount = nextGroupCount

    if (exec[0].length === 0) {
      // 零长度匹配手动前进一格，否则 /g 的 exec 会原地死循环。
      re.lastIndex += 1
    }
    if (matches.length >= MAX_MATCHES) {
      truncated = re.exec(text) !== null
      break
    }
  }

  let replaced: string | null = null
  if (typeof replacement === "string") {
    try {
      // Keep native RegExp replacement semantics while bounding output before each chunk.
      replaced = replaceWithBoundedOutput(text, re, replacement)
    } catch (error) {
      if (error === REPLACEMENT_OUTPUT_LIMIT) {
        return { ok: false, code: "REPLACEMENT_OUTPUT_TOO_LARGE" }
      }
      return { ok: false, code: "WORKER_FAILED" }
    }
  }

  return {
    ok: true,
    matches,
    total: matches.length,
    truncated,
    replaced,
  }
}
