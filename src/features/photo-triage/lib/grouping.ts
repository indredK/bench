/**
 * Grouping / 文件夹分组索引（纯函数）.
 * 对齐 Python `triage.html` 的分组渲染：`visible` 按 `folder` 排序分组，
 * 输出「分组头 + 条目」的扁平 row 序列，供虚拟滚动复用。
 */
import type { PhotoItem } from "@/lib/tauri/types/photo-triage"
import type { TriageFilter, TriageMark } from "@/features/photo-triage/store"

export interface FolderRow {
  kind: "item"
  item: PhotoItem
  /** 在 visible（过滤后排序）列表中的序号，用于加载调度与分组填充 */
  visibleIndex: number
}

export interface HeaderRow {
  kind: "header"
  folder: string
  /** 该分组在 visible 中的起止区间（end 为开区间） */
  start: number
  end: number
}

export type Row = FolderRow | HeaderRow

/** 是否开启分组索引条：条目太少时没有跳转价值（对齐 Python > 24）。 */
export function shouldShowGroupBar(visibleCount: number, groupBy: boolean): boolean {
  return groupBy && visibleCount > 24
}

/**
 * 过滤条目（对齐 Python `matchFilter`）：
 * 已删条目只在 `deleted` / `all` 筛选下可见；未处理的条目在 `todo` 下可见。
 */
export function filterItems(
  items: PhotoItem[],
  filter: TriageFilter,
  sel: Record<string, TriageMark>,
  deletedIds: ReadonlySet<string>,
): PhotoItem[] {
  return items.filter((it) => {
    if (filter === "all") return true
    if (filter === "deleted") return deletedIds.has(it.id)
    if (deletedIds.has(it.id)) return false
    const s = sel[it.id]
    if (filter === "todo") return !s
    if (filter === "keep") return s === "keep"
    if (filter === "drop") return s === "drop"
    return true
  })
}

/**
 * 分组排序（对齐 Python `computeVisible`）：
 * 分组开启时按 folder 值分组聚合（同组保持原始相对顺序）。
 */
export function sortForGroup(visible: PhotoItem[], groupBy: boolean): PhotoItem[] {
  if (!groupBy) return visible
  const byFolder = new Map<string, PhotoItem[]>()
  for (const it of visible) {
    const folder = it.folder || "."
    const list = byFolder.get(folder)
    if (list) list.push(it)
    else byFolder.set(folder, [it])
  }
  const out: PhotoItem[] = []
  byFolder.forEach((arr) => out.push(...arr))
  return out
}

/** 统计面板计数（对齐 Python `updateStat`）。 */
export function computeStats(
  items: PhotoItem[],
  sel: Record<string, TriageMark>,
  deletedIds: ReadonlySet<string>,
): { total: number; keep: number; drop: number; deleted: number; todo: number } {
  let keep = 0
  let drop = 0
  let deleted = 0
  for (const it of items) {
    if (deletedIds.has(it.id)) {
      deleted++
      continue
    }
    const s = sel[it.id]
    if (s === "keep") keep++
    else if (s === "drop") drop++
  }
  return {
    total: items.length,
    keep,
    drop,
    deleted,
    todo: items.length - keep - drop - deleted,
  }
}

/**
 * 由已过滤 + 已排序的 visible 构建分组 row 序列。
 * 分组时按 folder 顺序成组（分组头在组首）；未分组时每个条目单独成行。
 */
export function buildRows(visible: PhotoItem[], groupBy: boolean): Row[] {
  const rows: Row[] = []
  if (!groupBy) {
    for (let i = 0; i < visible.length; i++) {
      rows.push({ kind: "item", item: visible[i], visibleIndex: i })
    }
    return rows
  }
  let prevFolder: string | null = null
  let start = 0
  for (let i = 0; i < visible.length; i++) {
    const folder = visible[i].folder || "."
    if (prevFolder !== null && folder !== prevFolder) {
      rows.push({ kind: "header", folder: prevFolder, start, end: i })
      start = i
    }
    rows.push({ kind: "item", item: visible[i], visibleIndex: i })
    prevFolder = folder
  }
  if (prevFolder !== null) {
    rows.push({ kind: "header", folder: prevFolder, start, end: visible.length })
  }
  return rows
}

/** 计算每个分组的已加载比例（loadedIds = 已载入缩略图的条目 id）。 */
export function groupFill(
  rows: Row[],
  loadedIds: ReadonlySet<string>,
): Map<string, { loaded: number; total: number; ratio: number }> {
  const counts = new Map<string, number>()
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (row.kind !== "header") continue
    totals.set(row.folder, row.end - row.start)
    counts.set(row.folder, 0)
  }
  for (const row of rows) {
    if (row.kind !== "item") continue
    const folder = row.item.folder || "."
    if (counts.has(folder) && loadedIds.has(row.item.id)) {
      counts.set(folder, (counts.get(folder) ?? 0) + 1)
    }
  }
  const out = new Map<string, { loaded: number; total: number; ratio: number }>()
  for (const [folder, total] of totals) {
    const loaded = counts.get(folder) ?? 0
    out.set(folder, {
      loaded,
      total,
      ratio: total > 0 ? loaded / total : 0,
    })
  }
  return out
}
