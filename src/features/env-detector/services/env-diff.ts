import type { EnvTool } from "@/lib/tauri/types"

/** 较上次扫描的环境差异（按工具名比对）。 */
export interface EnvDiff {
  added: EnvTool[]
  removed: EnvTool[]
  changed: { name: string; from: string; to: string }[]
  isEmpty: boolean
}

/**
 * diffEnvTools / 环境扫描差异对比.
 *
 * 纯函数，按 `name` 对齐两份扫描结果：新增（仅在 curr）、移除（仅在 prev）、
 * 版本变更（两边都有但 version 不同）。任一为空则视为无差异（首次扫描 / 失败清空
 * 时不谎报「全部新增/移除」）。
 */
export function diffEnvTools(prev: EnvTool[], curr: EnvTool[]): EnvDiff {
  if (prev.length === 0 || curr.length === 0) {
    return { added: [], removed: [], changed: [], isEmpty: true }
  }
  const prevByName = new Map(prev.map((t) => [t.name, t]))
  const currByName = new Map(curr.map((t) => [t.name, t]))

  const added = curr.filter((t) => !prevByName.has(t.name))
  const removed = prev.filter((t) => !currByName.has(t.name))
  const changed: { name: string; from: string; to: string }[] = []
  for (const [name, currTool] of currByName) {
    const prevTool = prevByName.get(name)
    if (prevTool && prevTool.version !== currTool.version) {
      changed.push({ name, from: prevTool.version, to: currTool.version })
    }
  }
  return { added, removed, changed, isEmpty: added.length + removed.length + changed.length === 0 }
}

/** 跨机器对比交换用的最小条目：只带 name + version。 */
export interface EnvEntry {
  name: string
  version: string
}

/**
 * serializeEnvExchange / 序列化为可粘贴到另一台机器的 JSON。
 * 只导出「已安装且有版本」的工具，按名去重，取 `{name,version}[]`。
 */
export function serializeEnvExchange(tools: EnvTool[]): string {
  const seen = new Set<string>()
  const entries: EnvEntry[] = []
  for (const tool of tools) {
    if (!tool.available || !tool.version || seen.has(tool.name)) continue
    seen.add(tool.name)
    entries.push({ name: tool.name, version: tool.version })
  }
  return JSON.stringify(entries)
}

/**
 * parseEnvExchange / 解析另一台机器粘贴来的 JSON。
 * 结构校验：必须是 `{name:string, version?:string}` 数组；非法返回 ok:false + error。
 */
export function parseEnvExchange(
  text: string,
): { ok: true; entries: EnvEntry[] } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: "invalid-json" }
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "not-array" }
  const entries: EnvEntry[] = []
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) return { ok: false, error: "bad-item" }
    const record = item as Record<string, unknown>
    if (typeof record.name !== "string") return { ok: false, error: "bad-item" }
    entries.push({
      name: record.name,
      version: typeof record.version === "string" ? record.version : "",
    })
  }
  return { ok: true, entries }
}

/** 把交换条目还原成 diffEnvTools 可消费的最小 EnvTool（available 恒真，其余留空）。 */
export function entriesToTools(entries: EnvEntry[]): EnvTool[] {
  return entries.map((entry) => ({
    name: entry.name,
    version: entry.version,
    path: "",
    size_bytes: 0,
    size_display: "",
    install_time: "",
    available: true,
    category: "",
    source: "",
    kind: "",
    status: "",
    detector: "",
    all_paths: [],
    issue: "",
  }))
}
