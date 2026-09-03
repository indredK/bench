/**
 * Controller / 控制器: bind photo-triage state; 绑定状态与派生视图.
 * 提供派生数据（visible/rows/stats/current）与操作句柄，供页面与键盘 hook 使用。
 */
import { useCallback, useMemo } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import {
  usePhotoTriageStore,
  type TriageFilter,
  type TriageMark,
} from "@/features/photo-triage/store"
import {
  buildRows,
  computeStats,
  filterItems,
  shouldShowGroupBar,
  sortForGroup,
} from "@/features/photo-triage/lib/grouping"
import * as uc from "@/features/photo-triage/services/photo-triage.use-cases"

/** 本地路径 → asset 协议 URL（浏览器环境回退原路径）。 */
export function toAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null
  try {
    return convertFileSrc(path)
  } catch {
    return path
  }
}

/** 便捷路径显示：`/Users/<name>/...` → `~/...`（对齐 Python `prettyPath`）。 */
export function prettyPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~")
}

export function usePhotoTriageController() {
  const view = usePhotoTriageStore((s) => s.view)
  const items = usePhotoTriageStore((s) => s.items)
  const source = usePhotoTriageStore((s) => s.source)
  const recent = usePhotoTriageStore((s) => s.recent)
  const sel = usePhotoTriageStore((s) => s.sel)
  const deletedIds = usePhotoTriageStore((s) => s.deletedIds)
  const filter = usePhotoTriageStore((s) => s.filter)
  const groupBy = usePhotoTriageStore((s) => s.groupBy)
  const autoNext = usePhotoTriageStore((s) => s.autoNext)
  const liveView = usePhotoTriageStore((s) => s.liveView)
  const currentId = usePhotoTriageStore((s) => s.currentId)
  const multiSel = usePhotoTriageStore((s) => s.multiSel)
  const lastPickId = usePhotoTriageStore((s) => s.lastPickId)
  const folderCandidates = usePhotoTriageStore((s) => s.folderCandidates)
  const movedCounts = usePhotoTriageStore((s) => s.movedCounts)
  const scanning = usePhotoTriageStore((s) => s.scanning)
  const scanStatus = usePhotoTriageStore((s) => s.scanStatus)
  const capabilities = usePhotoTriageStore((s) => s.capabilities)
  const loaded = usePhotoTriageStore((s) => s.loaded)
  const loadError = usePhotoTriageStore((s) => s.loadError)
  const proxy = usePhotoTriageStore((s) => s.proxy)
  const dragActive = usePhotoTriageStore((s) => s.dragActive)

  const deletedSet = useMemo(() => new Set(deletedIds), [deletedIds])
  const visible = useMemo(
    () => sortForGroup(filterItems(items, filter, sel, deletedSet), groupBy),
    [items, filter, sel, deletedSet, groupBy],
  )
  const rows = useMemo(() => buildRows(visible, groupBy), [visible, groupBy])
  /** 分组开启时的分组数（工具栏按钮展示，对齐筛选按钮的计数风格） */
  const groupCount = useMemo(() => rows.filter((r) => r.kind === "header").length, [rows])
  const stats = useMemo(() => computeStats(items, sel, deletedSet), [items, sel, deletedSet])
  const showGroupBar = shouldShowGroupBar(visible.length, groupBy)
  const current = useMemo(() => items.find((it) => it.id === currentId) ?? null, [items, currentId])
  const currentIndex = useMemo(
    () => visible.findIndex((it) => it.id === currentId),
    [visible, currentId],
  )

  // ---- 派生操作（键盘/按钮共用） ----
  const setFilter = useCallback((f: TriageFilter) => {
    usePhotoTriageStore.getState().setFilter(f)
    uc.persistState()
  }, [])
  const cycleFilter = useCallback(() => {
    const order: TriageFilter[] = ["all", "todo", "keep", "drop", "deleted"]
    const next = order[(order.indexOf(filter) + 1) % order.length]
    setFilter(next)
  }, [filter, setFilter])

  const toggleGroup = useCallback(() => {
    const s = usePhotoTriageStore.getState()
    s.setGroupBy(!s.groupBy)
    uc.persistState()
  }, [])
  const toggleAutoNext = useCallback(() => {
    const s = usePhotoTriageStore.getState()
    s.setAutoNext(!s.autoNext)
    uc.persistState()
  }, [])

  const nav = useCallback(
    (delta: number) => {
      if (!visible.length) return
      const idx = visible.findIndex((it) => it.id === currentId)
      const base = idx >= 0 ? idx : 0
      const next = (base + delta + visible.length) % visible.length
      usePhotoTriageStore.getState().setCurrent(visible[next].id)
    },
    [visible, currentId],
  )

  const gotoNextTodo = useCallback(() => {
    if (!visible.length) return
    const state = usePhotoTriageStore.getState()
    const idx = visible.findIndex((it) => it.id === state.currentId)
    const start = idx >= 0 ? idx : -1
    for (let d = 1; d <= visible.length; d++) {
      const it = visible[(start + d + visible.length) % visible.length]
      if (!state.sel[it.id] && !state.deletedIds.includes(it.id)) {
        state.setCurrent(it.id)
        return
      }
    }
    nav(1)
  }, [visible, nav])

  const markCurrent = useCallback(
    (mark: TriageMark) => {
      const cur = usePhotoTriageStore.getState().currentId
      if (!cur) return
      uc.mark(cur, mark)
      if (autoNext) gotoNextTodo()
    },
    [autoNext, gotoNextTodo],
  )

  const undo = useCallback(() => uc.undo(), [])

  const show = useCallback((id: string | null) => {
    usePhotoTriageStore.getState().setCurrent(id)
  }, [])

  const toggleLive = useCallback(() => {
    const s = usePhotoTriageStore.getState()
    s.setLiveView(s.liveView === "motion" ? "photo" : "motion")
  }, [])

  const toggleMulti = useCallback((id: string) => {
    const s = usePhotoTriageStore.getState()
    s.toggleMulti(id)
    s.setLastPick(id)
  }, [])

  const rangeSelect = useCallback(
    (id: string) => {
      const s = usePhotoTriageStore.getState()
      const anchor = s.lastPickId
      const a = visible.findIndex((x) => x.id === anchor)
      const b = visible.findIndex((x) => x.id === id)
      if (a < 0 || b < 0) return
      const ids = visible
        .slice(Math.min(a, b), Math.max(a, b) + 1)
        .filter((x) => !s.deletedIds.includes(x.id))
        .map((x) => x.id)
      s.setMulti(ids)
      s.setLastPick(id)
    },
    [visible],
  )

  const selectCurrent = useCallback(
    (id: string, opts?: { toggle?: boolean; range?: boolean }) => {
      const s = usePhotoTriageStore.getState()
      if (opts?.toggle) {
        toggleMulti(id)
        return
      }
      if (opts?.range && s.lastPickId) {
        rangeSelect(id)
        return
      }
      if (s.multiSel.length) s.clearMulti()
      s.setLastPick(id)
      show(id)
    },
    [toggleMulti, rangeSelect, show],
  )

  const selectAll = useCallback(() => {
    const s = usePhotoTriageStore.getState()
    const eligible = visible.filter((it) => !s.deletedIds.includes(it.id))
    if (!eligible.length) return
    // 已全选时再点 → 取消全选（toggle，对齐「全选」按钮/⌘A 同一入口）
    const all = eligible.every((it) => s.multiSel.includes(it.id))
    if (all) s.clearMulti()
    else uc.selectAllVisible(visible)
  }, [visible])

  /** 当前筛选下是否已全选（驱动「全选 ↔ 取消全选」按钮文案） */
  const allSelected = useMemo(() => {
    if (!visible.length) return false
    const eligible = visible.filter((it) => !deletedSet.has(it.id))
    return eligible.length > 0 && eligible.every((it) => multiSel.includes(it.id))
  }, [visible, deletedSet, multiSel])

  const moveToFolder = useCallback(async (folder: string, idsOverride?: string[]) => {
    const ids = idsOverride?.length ? idsOverride : uc.selectedOrCurrentIds()
    if (!ids.length) {
      return { ok: false as const, reason: "empty" as const, count: 0 }
    }
    const ok = await uc.moveItems(ids, folder)
    return ok
      ? { ok: true as const, reason: "ok" as const, count: ids.length }
      : { ok: false as const, reason: "failed" as const, count: 0 }
  }, [])

  return {
    // state
    view,
    items,
    source,
    recent,
    sel,
    deletedIds,
    deletedSet,
    filter,
    groupBy,
    autoNext,
    liveView,
    currentId,
    multiSel,
    lastPickId,
    folderCandidates,
    movedCounts,
    scanning,
    scanStatus,
    capabilities,
    loaded,
    loadError,
    proxy,
    dragActive,
    // derived
    visible,
    rows,
    groupCount,
    stats,
    showGroupBar,
    current,
    currentIndex,
    // actions
    setFilter,
    cycleFilter,
    toggleGroup,
    toggleAutoNext,
    nav,
    gotoNextTodo,
    markCurrent,
    undo,
    show,
    toggleLive,
    selectCurrent,
    selectAll,
    allSelected,
    moveToFolder,
  }
}

export type PhotoTriageController = ReturnType<typeof usePhotoTriageController>
