/**
 * douyin-content-assets 插件 IPC DTO（DCA-01；与 Rust
 * `src-tauri/src/douyin_content_assets/types.rs` 保持 camelCase 同构）。
 */

export interface CapturedItem {
  id: string
  /** 幂等键：`pid:<listType>:<itemId>` 或 `url:<listType>:<normalizedShareUrl>`。 */
  dedupeKey: string
  listType: string
  /** 规范化后的分享链接；仅有平台作品 ID 时为空串。 */
  shareUrl: string
  platformItemId: string | null
  title: string | null
  author: string | null
  coverUrl: string | null
  pageUrl: string | null
  capturedAt: string
  sourceCaptureId: string | null
  /** `new`（未导入视频）| `imported`（已导入本地视频）。 */
  status: string
  videoAssetId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface VideoAsset {
  id: string
  originalName: string
  /** 相对插件私有数据目录的路径；前端不接触绝对路径。 */
  relPath: string
  sha256: string
  sizeBytes: number
  /** `mp4` | `mov` | `ebml`（mkv/webm）| `avi`。 */
  container: string
  importedAt: string
  deletedAt: string | null
}

export interface MediaWorkerStatus {
  /** P1 固定 false：媒体 worker 尚未接入（DCA-02 按 PoC ADR 决定）。 */
  available: boolean
  /** `NOT_INSTALLED` | `READY`。 */
  status: string
}

export interface DouyinLimits {
  maxBatchItems: number
  maxImportFileBytes: number
  maxPageLimit: number
}

export interface CaptureStatus {
  /** 本机桥是否就绪（Companion 能否提交采集批次）。 */
  bridgeReady: boolean
}

export interface DouyinCapabilities {
  mediaWorker: MediaWorkerStatus
  limits: DouyinLimits
  capture: CaptureStatus
}

export interface CapturedItemPage {
  items: CapturedItem[]
  total: number
  hasMore: boolean
}

export interface ImportFilesOutcome {
  imported: VideoAsset[]
  /** SHA-256 去重命中的数量（未重复导入）。 */
  duplicates: number
}

export interface DeleteOutcome {
  itemsDeleted: number
  assetsDeleted: number
}

export type DouyinAssetsErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "STORE_FAIL" | "UNSUPPORTED"

export interface DouyinAssetsError {
  code: DouyinAssetsErrorCode
  message: string
}
