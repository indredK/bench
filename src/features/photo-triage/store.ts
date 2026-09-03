/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 * Photo Triage 状态：相册清单、留/删标记、视图偏好、多选、待选文件夹、扫描状态。
 * 持久化与命令编排在 services/use-cases 中处理，store 只保存状态。
 */
import { create } from "zustand"
import type {
  PhotoItem,
  PhotoTriageCapabilities,
  RecentAlbum,
  ScanStatus,
} from "@/lib/tauri/types/photo-triage"

export type TriageFilter = "all" | "todo" | "keep" | "drop" | "deleted"
export type TriageMark = "keep" | "drop"
export type TriageLiveView = "photo" | "motion"

export interface HistoryEntry {
  id: string
  prev?: TriageMark
}

export type TriageView = "welcome" | "triage"

interface PhotoTriageState {
  view: TriageView
  source: string
  items: PhotoItem[]
  recent: RecentAlbum[]
  capabilities: PhotoTriageCapabilities | null
  loaded: boolean
  loadError: string | null

  // 标记（内存 + localStorage 持久化）
  sel: Record<string, TriageMark>
  deletedIds: string[]
  history: HistoryEntry[]

  // 视图偏好（随相册记忆）
  filter: TriageFilter
  groupBy: boolean
  autoNext: boolean
  liveView: TriageLiveView
  currentId: string | null
  multiSel: string[]
  lastPickId: string | null

  // 待选文件夹（随相册记忆）
  folderCandidates: string[]
  movedCounts: Record<string, number>

  // 扫描
  scanning: boolean
  scanStatus: ScanStatus | null

  // 代理路径缓存：id -> 绝对本地路径（保证重复浏览零重复生成）
  proxy: Record<string, string>
  /** 缩略图已实际载入的条目 id（分组刻度填充依据，对齐 Python `loadedIds`） */
  loadedIds: string[]
  /** 缩略图栏宽度（splitter 拖拽调整，随 localStorage 记忆） */
  stripWidth: number

  // 弹窗（供键盘 ? 与工具栏打开）
  helpOpen: boolean
  emptyDirsOpen: boolean

  // ---- actions ----
  setHelpOpen: (open: boolean) => void
  setEmptyDirsOpen: (open: boolean) => void
  setView: (view: TriageView) => void
  openAlbum: (source: string, items: PhotoItem[]) => void
  setRecent: (recent: RecentAlbum[]) => void
  setCapabilities: (capabilities: PhotoTriageCapabilities) => void
  setLoaded: (loaded: boolean) => void
  setLoadError: (error: string | null) => void

  setSel: (id: string, mark: TriageMark) => void
  setSelAll: (marks: Record<string, TriageMark>) => void
  pushHistory: (entry: HistoryEntry) => void
  resetHistory: () => void
  popHistory: () => HistoryEntry | undefined

  setFilter: (filter: TriageFilter) => void
  setGroupBy: (groupBy: boolean) => void
  setAutoNext: (autoNext: boolean) => void
  setLiveView: (liveView: TriageLiveView) => void
  setCurrent: (id: string | null) => void
  toggleMulti: (id: string) => void
  setMulti: (ids: string[]) => void
  clearMulti: () => void
  setLastPick: (id: string | null) => void

  setFolderCandidates: (folders: string[]) => void
  addFolderCandidate: (folder: string) => void
  removeFolderCandidate: (folder: string) => void
  setMovedCounts: (counts: Record<string, number>) => void
  bumpMovedCount: (folder: string, delta: number) => void

  setScanning: (scanning: boolean) => void
  setScanStatus: (status: ScanStatus | null) => void

  setProxy: (id: string, path: string) => void
  /** 登记缩略图加载完成（成功或失败都算处理完，刻度不会卡在半格） */
  setItemLoaded: (id: string) => void
  resetLoaded: () => void
  setStripWidth: (width: number) => void

  // 移动后应用服务端返回的条目更新（from → to 迁移标记）；返回值：移出相册的 id
  applyMoveUpdates: (
    updates: {
      from: string
      to: string
      folder: string
      image?: string | null
      video?: string | null
    }[],
  ) => string[]
  removeItems: (ids: string[]) => void
  markDeleted: (ids: string[]) => void
  unmarkDeleted: (ids: string[]) => void
}

export const usePhotoTriageStore = create<PhotoTriageState>((set, get) => ({
  view: "welcome",
  source: "",
  items: [],
  recent: [],
  capabilities: null,
  loaded: false,
  loadError: null,

  sel: {},
  deletedIds: [],
  history: [],

  filter: "all",
  groupBy: false,
  autoNext: true,
  liveView: "photo",
  currentId: null,
  multiSel: [],
  lastPickId: null,

  folderCandidates: [],
  movedCounts: {},

  scanning: false,
  scanStatus: null,

  proxy: {},
  loadedIds: [],
  stripWidth: 320,
  helpOpen: false,
  emptyDirsOpen: false,

  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setEmptyDirsOpen: (emptyDirsOpen) => set({ emptyDirsOpen }),
  setView: (view) => set({ view }),
  openAlbum: (source, items) =>
    set({
      view: "triage",
      source,
      items,
      currentId: null,
      multiSel: [],
      history: [],
      loaded: true,
      loadError: null,
      loadedIds: [],
      proxy: {},
    }),
  setRecent: (recent) => set({ recent }),
  setCapabilities: (capabilities) => set({ capabilities }),
  setLoaded: (loaded) => set({ loaded }),
  setLoadError: (loadError) => set({ loadError }),

  setSel: (id, mark) =>
    set((s) => {
      const prev = s.sel[id]
      const next = { ...s.sel }
      if (prev === mark) delete next[id]
      else next[id] = mark
      return { sel: next }
    }),
  setSelAll: (marks) => set({ sel: marks }),
  pushHistory: (entry) => set((s) => ({ history: [...s.history.slice(-299), entry] })),
  resetHistory: () => set({ history: [] }),
  popHistory: () => {
    const { history } = get()
    if (history.length === 0) return undefined
    const entry = history[history.length - 1]
    set({ history: history.slice(0, -1) })
    return entry
  },

  setFilter: (filter) => set({ filter }),
  setGroupBy: (groupBy) => set({ groupBy }),
  setAutoNext: (autoNext) => set({ autoNext }),
  setLiveView: (liveView) => set({ liveView }),
  setCurrent: (id) => set({ currentId: id }),
  toggleMulti: (id) =>
    set((s) => ({
      multiSel: s.multiSel.includes(id) ? s.multiSel.filter((x) => x !== id) : [...s.multiSel, id],
    })),
  setMulti: (ids) => set({ multiSel: ids }),
  clearMulti: () => set({ multiSel: [] }),
  setLastPick: (id) => set({ lastPickId: id }),

  setFolderCandidates: (folders) => set({ folderCandidates: folders }),
  addFolderCandidate: (folder) =>
    set((s) =>
      s.folderCandidates.includes(folder)
        ? {}
        : { folderCandidates: [...s.folderCandidates, folder] },
    ),
  removeFolderCandidate: (folder) =>
    set((s) => ({
      folderCandidates: s.folderCandidates.filter((f) => f !== folder),
    })),
  setMovedCounts: (counts) => set({ movedCounts: counts }),
  bumpMovedCount: (folder, delta) =>
    set((s) => ({
      movedCounts: { ...s.movedCounts, [folder]: (s.movedCounts[folder] ?? 0) + delta },
    })),

  setScanning: (scanning) => set({ scanning }),
  setScanStatus: (scanStatus) => set({ scanStatus }),

  setProxy: (id, path) => set((s) => ({ proxy: { ...s.proxy, [id]: path } })),

  setItemLoaded: (id) =>
    set((s) => (s.loadedIds.includes(id) ? {} : { loadedIds: [...s.loadedIds, id] })),
  resetLoaded: () => set({ loadedIds: [] }),
  setStripWidth: (stripWidth) => set({ stripWidth }),

  applyMoveUpdates: (updates) => {
    const s = get()
    const itemsById = new Map(s.items.map((it) => [it.id, it]))
    const newSel = { ...s.sel }
    const newDeleted = [...s.deletedIds]
    let currentId = s.currentId
    const movedOut: string[] = []
    for (const u of updates) {
      const old = itemsById.get(u.from)
      if (!old) continue
      itemsById.delete(u.from)
      const moved = {
        ...old,
        id: u.to,
        folder: u.folder,
        image: u.image ?? null,
        video: u.video ?? null,
      }
      itemsById.set(u.to, moved)
      if (newSel[u.from] !== undefined) {
        newSel[u.to] = newSel[u.from]
        delete newSel[u.from]
      }
      if (newDeleted.includes(u.from)) {
        newDeleted.push(u.to)
      }
      if (currentId === u.from) currentId = u.to
      if (u.folder.startsWith("/")) movedOut.push(u.to)
    }
    set({
      items: s.items
        .map((it) => (itemsById.has(it.id) ? itemsById.get(it.id)! : it))
        .filter((it) => itemsById.has(it.id)),
      sel: newSel,
      deletedIds: newDeleted,
      currentId,
      proxy: {},
    })
    return movedOut
  },

  removeItems: (ids) => {
    const s = get()
    const out = new Set(ids)
    set({
      items: s.items.filter((it) => !out.has(it.id)),
      currentId: out.has(s.currentId ?? "") ? null : s.currentId,
      multiSel: s.multiSel.filter((id) => !out.has(id)),
      sel: Object.fromEntries(Object.entries(s.sel).filter(([id]) => !out.has(id))),
      deletedIds: s.deletedIds.filter((id) => !out.has(id)),
      proxy: Object.fromEntries(Object.entries(s.proxy).filter(([id]) => !out.has(id))),
    })
  },

  markDeleted: (ids) =>
    set((s) => {
      const set = new Set(s.deletedIds)
      ids.forEach((id) => set.add(id))
      return { deletedIds: [...set] }
    }),
  unmarkDeleted: (ids) =>
    set((s) => {
      const out = new Set(ids)
      return { deletedIds: s.deletedIds.filter((id) => !out.has(id)) }
    }),
}))
