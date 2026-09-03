/**
 * Use Cases / 业务编排: compose repository calls; 只组合数据层调用.
 * Photo Triage 用例编排：扫描/打开相册/标记/撤销/移动/废纸篓/恢复/导出/重置。
 * 端到端行为对齐 Python 版 `triage.html` + `desktop/app.py`。
 */
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import { listenToPlatformEvent } from "@/platform/events"
import { getErrorMessage } from "@/lib/tauri/errors"
import { usePhotoTriageStore, type TriageMark } from "@/features/photo-triage/store"
import * as repository from "@/features/photo-triage/services/photo-triage.repository"
import type { MoveUpdate, PhotoItem, ScanStatus } from "@/lib/tauri/types/photo-triage"

// ---------------------------------------------------------------------------
// 持久化（对齐 Python localStorage 语义：标记/偏好/待选文件夹随相册记忆）
// ---------------------------------------------------------------------------

function stateKey(source: string): string {
  return `photo-triage:state:${source || ""}`
}
function foldersKey(source: string): string {
  return `photo-triage:folders:${source || ""}`
}
function movedKey(source: string): string {
  return `photo-triage:moved:${source || ""}`
}

export function persistState() {
  const s = usePhotoTriageStore.getState()
  if (!s.source) return
  try {
    localStorage.setItem(
      stateKey(s.source),
      JSON.stringify({
        sel: s.sel,
        deletedIds: s.deletedIds,
        groupBy: s.groupBy,
        autoNext: s.autoNext,
        filter: s.filter,
        folderCandidates: s.folderCandidates,
        movedCounts: s.movedCounts,
      }),
    )
  } catch {
    // ignore quota / privacy errors
  }
}

export function persistFolders() {
  const s = usePhotoTriageStore.getState()
  if (!s.source) return
  try {
    localStorage.setItem(foldersKey(s.source), JSON.stringify(s.folderCandidates))
    localStorage.setItem(movedKey(s.source), JSON.stringify(s.movedCounts))
  } catch {
    // ignore
  }
}

export function restoreState(items: PhotoItem[]) {
  const store = usePhotoTriageStore.getState()
  const idSet = new Set(items.map((it) => it.id))
  const valid = <T extends { id: string }>(arr: T[]): T[] => arr.filter((x) => idSet.has(x.id))
  try {
    const raw = localStorage.getItem(stateKey(store.source))
    if (raw) {
      const saved = JSON.parse(raw) as {
        sel?: Record<string, TriageMark>
        deletedIds?: string[]
        groupBy?: boolean
        autoNext?: boolean
        filter?: string
        folderCandidates?: string[]
        movedCounts?: Record<string, number>
      }
      // 只恢复当前 manifest 中仍存在的 id，避免重扫后错位
      if (saved.sel) {
        const validSel = Object.fromEntries(
          Object.entries(saved.sel).filter(([id]) => idSet.has(id)),
        )
        usePhotoTriageStore.setState({ sel: validSel })
      }
      if (Array.isArray(saved.deletedIds)) {
        usePhotoTriageStore.setState({
          deletedIds: valid(saved.deletedIds.map((id) => ({ id }))).map((x) => x.id),
        })
      }
      if (typeof saved.groupBy === "boolean")
        usePhotoTriageStore.setState({ groupBy: saved.groupBy })
      if (saved.autoNext !== false) usePhotoTriageStore.setState({ autoNext: true })
      else usePhotoTriageStore.setState({ autoNext: false })
      const allowed = ["all", "todo", "keep", "drop", "deleted"]
      if (typeof saved.filter === "string" && allowed.includes(saved.filter)) {
        usePhotoTriageStore.setState({ filter: saved.filter as never })
      }
      if (Array.isArray(saved.folderCandidates)) {
        const migrated = (saved.folderCandidates as string[])
          .filter((x) => typeof x === "string" && x)
          .map((x) => {
            if (x.startsWith("/") || x.startsWith("~")) return x
            return (store.source.replace(/\/+$/, "") || "") + "/" + x
          })
        usePhotoTriageStore.setState({ folderCandidates: [...new Set(migrated)] })
      }
      if (saved.movedCounts && typeof saved.movedCounts === "object") {
        usePhotoTriageStore.setState({ movedCounts: saved.movedCounts })
      }
    }
  } catch {
    // ignore corrupt storage
  }
}

// ---------------------------------------------------------------------------
// 欢迎页：最近相册 / 扫描 / 打开
// ---------------------------------------------------------------------------

let activeUnlisteners: (() => void)[] = []

export async function loadRecent() {
  try {
    const recent = await repository.photoTriageListRecent()
    usePhotoTriageStore.getState().setRecent(recent)
  } catch (err) {
    // 最近相册加载失败：避免失败折叠为空态，写入欢迎页错误条供重试
    usePhotoTriageStore.getState().setLoadError(getErrorMessage(err))
  }
}

export async function loadCapabilities() {
  try {
    const caps = await repository.photoTriageCapabilities()
    usePhotoTriageStore.getState().setCapabilities(caps)
  } catch (err) {
    console.warn("[photo-triage] loadCapabilities failed:", getErrorMessage(err))
  }
}

/** 选择目录（tauri-plugin-dialog）——用户主动选择即视为授权（迁移方案 §6.8 L2）。 */
export async function pickFolder(): Promise<string | null> {
  const { openPlatformDialog } = await import("@/platform/dialog")
  const picked = await openPlatformDialog({
    directory: true,
    multiple: false,
  })
  const dir = Array.isArray(picked) ? (picked[0] ?? null) : picked
  return typeof dir === "string" ? dir : null
}

/** 扫描相册：先挂事件监听，再触发后台扫描；返回扫描是否已开始。 */
export async function startScan(src: string): Promise<boolean> {
  const store = usePhotoTriageStore.getState()
  if (store.scanning) return false
  store.setScanning(true)
  store.setLoadError(null)

  for (const unlisten of activeUnlisteners) unlisten()
  activeUnlisteners = []
  const unlistenProgress = await listenToPlatformEvent<ScanStatus>(
    TAURI_EVENTS.photoTriage.scanProgress,
    (event) => {
      usePhotoTriageStore.getState().setScanStatus(event.payload)
    },
  )
  const unlistenDone = await listenToPlatformEvent<ScanStatus>(
    TAURI_EVENTS.photoTriage.scanDone,
    async (event) => {
      const status = event.payload
      const s = usePhotoTriageStore.getState()
      s.setScanStatus(status)
      s.setScanning(false)
      if (!status.error) {
        // 扫描完成自动打开相册（拉取 manifest）
        await openAlbum(src, { fromScan: true })
      } else {
        s.setLoadError(status.error)
      }
    },
  )
  activeUnlisteners = [unlistenProgress, unlistenDone]

  try {
    await repository.photoTriageScan(src)
    return true
  } catch (err) {
    usePhotoTriageStore.getState().setScanning(false)
    usePhotoTriageStore.getState().setLoadError(getErrorMessage(err))
    for (const unlisten of activeUnlisteners) unlisten()
    activeUnlisteners = []
    return false
  }
}

/** 打开相册（拉取 manifest 并恢复标记）。 */
export async function openAlbum(src: string, opts?: { fromScan?: boolean }): Promise<boolean> {
  try {
    const manifest = await repository.photoTriageOpen(src)
    const store = usePhotoTriageStore.getState()
    store.openAlbum(manifest.source || src, manifest.items)
    restoreState(manifest.items)
    persistState()
    await loadRecent()
    return true
  } catch (err) {
    usePhotoTriageStore.getState().setLoadError(getErrorMessage(err))
    if (!opts?.fromScan) usePhotoTriageStore.getState().setView("welcome")
    return false
  }
}

// ---------------------------------------------------------------------------
// 标记 / 撤销（对齐 Python `setSel` / `undo`）
// ---------------------------------------------------------------------------

/** 标记留/删；同键再按一次取消；autoNext 时跳下一个未处理项。 */
export function mark(id: string, mark: TriageMark) {
  const store = usePhotoTriageStore.getState()
  const it = store.items.find((x) => x.id === id)
  if (!it || store.deletedIds.includes(id)) return
  const prev = store.sel[id]
  const changed = prev !== mark
  store.pushHistory({ id, prev })
  store.setSel(id, mark)
  persistState()
  if (store.autoNext && changed) {
    const idx = store.items.findIndex((x) => x.id === id)
    const ni = store.items.length
      ? (((idx + 1) % store.items.length) + store.items.length) % store.items.length
      : -1
    if (ni >= 0) store.setCurrent(store.items[ni].id)
  }
}

export function undo() {
  const store = usePhotoTriageStore.getState()
  const entry = store.popHistory()
  if (!entry) return
  if (entry.prev === undefined) {
    const sel = { ...store.sel }
    delete sel[entry.id]
    usePhotoTriageStore.setState({ sel })
  } else {
    usePhotoTriageStore.setState({ sel: { ...store.sel, [entry.id]: entry.prev } })
  }
  persistState()
  if (store.items.some((it) => it.id === entry.id)) {
    store.setCurrent(entry.id)
  }
}

export function markAll(mark: TriageMark) {
  const store = usePhotoTriageStore.getState()
  if (!store.items.length) return
  const marks: Record<string, TriageMark> = {}
  store.items.forEach((it) => {
    if (!store.deletedIds.includes(it.id)) marks[it.id] = mark
  })
  store.setSelAll(marks)
  store.resetHistory()
  persistState()
}

/** 导出 selection.json：留/删 id 列表（对齐 Python `exportBtn`，浏览器下载）。 */
export function exportSelectionJson(): { keeps: number; drops: number } | null {
  const s = usePhotoTriageStore.getState()
  const deleted = new Set(s.deletedIds)
  const keeps = s.items
    .filter((it) => s.sel[it.id] === "keep" && !deleted.has(it.id))
    .map((it) => it.id)
  const drops = s.items
    .filter((it) => s.sel[it.id] === "drop" && !deleted.has(it.id))
    .map((it) => it.id)
  if (!keeps.length && !drops.length) return null
  try {
    const blob = new Blob([JSON.stringify({ source: s.source, keeps, drops }, null, 2)], {
      type: "application/json",
    })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "selection.json"
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (e) {
    console.error("[photo-triage] export selection.json failed:", e)
    throw e
  }
  return { keeps: keeps.length, drops: drops.length }
}

// ---------------------------------------------------------------------------
// 预览代理（对齐 Python `/api/proxy-image|video`：按需生成一次并缓存）
// ---------------------------------------------------------------------------

export type ProxyKind = "image" | "poster" | "video"

/** 取某条目预览代理的本地路径（统一走后端 ensure_proxy：按需生成、缓存、登记清单）。 */
export async function ensureProxy(id: string, kind: ProxyKind): Promise<string | null> {
  const store = usePhotoTriageStore.getState()
  const cacheKey = `${id}:${kind}`
  const cached = store.proxy[cacheKey]
  if (cached) return cached
  try {
    const res = await repository.photoTriageEnsureProxy(id, kind)
    if (res.path) {
      store.setProxy(cacheKey, res.path)
      return res.path
    }
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 移动 / 多选 / 待选文件夹（对齐 Python `moveItems` / `selectAllVisible` / `quickMove`）
// ---------------------------------------------------------------------------

export function selectedOrCurrentIds(): string[] {
  const s = usePhotoTriageStore.getState()
  if (s.multiSel.length) return s.multiSel
  return s.currentId ? [s.currentId] : []
}

export function selectAllVisible(visible: PhotoItem[]) {
  const s = usePhotoTriageStore.getState()
  const ids = visible.filter((it) => !s.deletedIds.includes(it.id)).map((it) => it.id)
  s.setMulti(ids)
}

export async function moveItems(ids: string[], target: string): Promise<boolean> {
  const store = usePhotoTriageStore.getState()
  const list = ids.filter(
    (id) => store.items.some((it) => it.id === id) && !store.deletedIds.includes(id),
  )
  if (!list.length) return false
  try {
    const res = await repository.photoTriageMove(list, target)
    const updates: MoveUpdate[] = res.items ?? []
    if (!updates.length) return false
    const movedOut = store.applyMoveUpdates(updates)
    if (movedOut.length) {
      store.removeItems(movedOut)
    }
    store.clearMulti()
    store.bumpMovedCount(target, updates.length)
    persistState()
    persistFolders()
    return true
  } catch {
    return false
  }
}

/** 右键在访达中显示（助手 API 供 chips 使用）。 */
export async function revealPath(path: string): Promise<boolean> {
  try {
    await repository.photoTriageReveal(path)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// 废纸篓 / 恢复（对齐 Python `cfOk` / `restoreItems`）
// ---------------------------------------------------------------------------

/** 移入废纸篓（批量）：返回 { ok, count, errorCount }。 */
export async function trashItems(
  ids: string[],
): Promise<{ ok: boolean; count: number; errorCount: number }> {
  const store = usePhotoTriageStore.getState()
  try {
    const res = await repository.photoTriageTrash(ids)
    const movedFrom = new Set((res.moved ?? []).map((m) => m.from))
    const itemsById = new Map(store.items.map((it) => [it.id, it]))
    const fullyMoved: string[] = []
    for (const id of ids) {
      const it = itemsById.get(id)
      if (!it) continue
      const files = [it.image, it.video].filter((x): x is string => !!x)
      if (files.length && files.every((f) => movedFrom.has(f))) {
        fullyMoved.push(id)
      }
    }
    if (fullyMoved.length) {
      store.markDeleted(fullyMoved)
      persistState()
    }
    return { ok: true, count: res.count ?? 0, errorCount: (res.errors ?? []).length }
  } catch (e) {
    return { ok: false, count: 0, errorCount: 0 }
  }
}

/** 从废纸篓恢复（后悔药）：恢复成功自动标记为「留」。 */
export async function restoreItems(
  ids: string[],
): Promise<{ ok: boolean; count: number; errorCount: number }> {
  const store = usePhotoTriageStore.getState()
  try {
    const res = await repository.photoTriageRestore(ids)
    const restoredTo = new Set((res.restored ?? []).map((x) => x.to))
    const okIds: string[] = []
    const itemsById = new Map(store.items.map((it) => [it.id, it]))
    for (const id of ids) {
      const it = itemsById.get(id)
      if (!it) continue
      const files = [it.image, it.video].filter((x): x is string => !!x)
      const failedPath = (res.errors ?? []).some((e) => files.includes(e.path))
      if (files.length && files.every((f) => restoredTo.has(f)) && !failedPath) {
        okIds.push(id)
      }
    }
    if (okIds.length) {
      store.unmarkDeleted(okIds)
      const sel = { ...store.sel }
      okIds.forEach((id) => {
        if (!sel[id]) sel[id] = "keep"
      })
      usePhotoTriageStore.setState({ sel })
      persistState()
    }
    return { ok: true, count: res.count ?? 0, errorCount: (res.errors ?? []).length }
  } catch (e) {
    return { ok: false, count: 0, errorCount: 0 }
  }
}

// ---------------------------------------------------------------------------
// 导出 / 重置缓存 / 清理空文件夹（对齐 Python export/prune/empty-dirs）
// ---------------------------------------------------------------------------

export async function exportSelection(ids: string[]): Promise<boolean> {
  if (!ids.length) return false
  try {
    const { savePlatformDialog } = await import("@/platform/dialog")
    const out = await savePlatformDialog({
      title: "export",
      defaultPath: "keeps",
    })
    if (!out) return false
    const res = await repository.photoTriageExport(ids, out, false)
    return (res.copied ?? 0) > 0
  } catch (e) {
    console.warn("[photo-triage] export failed:", getErrorMessage(e))
    return false
  }
}

export async function pruneManifest(): Promise<{ removed: number; kept: number } | null> {
  try {
    const res = await repository.photoTriagePrune()
    return { removed: res.removed ?? 0, kept: res.kept ?? 0 }
  } catch (e) {
    console.warn("[photo-triage] prune failed:", getErrorMessage(e))
    return null
  }
}

export async function listEmptyDirs(): Promise<string[] | null> {
  try {
    const res = await repository.photoTriageEmptyDirs()
    return res.dirs ?? []
  } catch {
    // null = 加载失败（与空列表区分），由弹窗提示并保留旧列表
    return null
  }
}

export async function deleteEmptyDirs(
  paths: string[],
): Promise<{ count: number; errorCount: number }> {
  try {
    const res = await repository.photoTriageDeleteEmptyDirs(paths)
    return { count: res.count ?? 0, errorCount: (res.errors ?? []).length }
  } catch (e) {
    console.warn("[photo-triage] deleteEmptyDirs failed:", getErrorMessage(e))
    return { count: 0, errorCount: paths.length }
  }
}
