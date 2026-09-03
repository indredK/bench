/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 * Photo Triage（照片筛选）——字段名与 Rust `photo_triage/types.rs` 及 Python 版
 * manifest.json 保持一致，保证已有扫描结果可直接复用。
 */

export type PhotoItemType = "live" | "photo" | "video"

export interface PhotoItem {
  id: string
  type: PhotoItemType
  stem: string
  /** 相对相册根目录的目录；`.` 表示根目录；移出相册后为绝对路径 */
  folder: string
  image?: string | null
  video?: string | null
  image_proxy?: string | null
  video_proxy?: string | null
  video_poster?: string | null
  size_bytes?: number
  /** 该条目文件已移入废纸篓 */
  deleted?: boolean
  trash?: Record<string, string>
}

export interface TriageManifest {
  source: string
  count: number
  items: PhotoItem[]
}

export interface ScanStatus {
  running: boolean
  phase: string
  done: number
  total: number
  current: string
  error?: string | null
  /** 完成时刻（Unix 秒） */
  finished: number
}

export interface PhotoTriageCapabilities {
  has_ffmpeg: boolean
  ffmpeg_path?: string | null
}

export interface RecentAlbum {
  src: string
  build: string
  last: string
}

export interface FileMoveInfo {
  from: string
  to: string
}

export interface PathError {
  path: string
  error: string
}

export interface IdError {
  id: string
  error: string
}

export interface TrashResult {
  moved: FileMoveInfo[]
  errors: PathError[]
  count: number
}

export interface RestoreResult {
  restored: FileMoveInfo[]
  errors: PathError[]
  count: number
}

/** 移动后的条目信息，前端据此迁移标记（from → to）。 */
export interface MoveUpdate {
  from: string
  to: string
  folder: string
  image?: string | null
  video?: string | null
}

export interface MoveResult {
  moved: string[]
  items: MoveUpdate[]
  errors: IdError[]
  count: number
}

export interface PruneResult {
  removed: number
  kept: number
}

export interface EmptyDirsResult {
  dirs: string[]
}

export interface DeleteEmptyDirsResult {
  deleted: string[]
  errors: PathError[]
  count: number
}

export interface ExportResult {
  copied: number
  errors: PathError[]
  zip_path?: string | null
}

export interface ScanStartResult {
  ok: boolean
  build: string
}

/** 预览代理的本地路径（前端经 convertFileSrc 加载）。 */
export interface ProxyPath {
  path?: string | null
}
