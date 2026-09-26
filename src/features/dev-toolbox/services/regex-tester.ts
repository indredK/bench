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
const MAX_REGEX_FLAGS_LENGTH = 8

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

  let exec: RegExpExecArray | null
  while ((exec = re.exec(text)) !== null) {
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
      // String.replace 对 /g 正则忽略 lastIndex、从头替换全部命中。
      replaced = text.replace(re, replacement)
    } catch {
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
