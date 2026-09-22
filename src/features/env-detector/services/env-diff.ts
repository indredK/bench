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
