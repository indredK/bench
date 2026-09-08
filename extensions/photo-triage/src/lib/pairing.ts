/**
 * Pairing / 稳定 ID 与配对（纯函数，可单测）.
 *
 * 与 Python 版 `scan.py` 的算法逐字节一致：key 为「相对路径去扩展名（后缀小写化）」，
 * 稳定 ID 为 `md5(key)[:12]`。目标项目后端 `src-tauri/src/photo_triage/scan.rs`
 * 是真正执行者；此处仅在前端做只读校验/展示辅助，保持算法单一来源的对照。
 */

/** 支持的后缀（不含点，小写）。与后端 IMAGE_EXTS 一致。 */
export const IMAGE_EXTS = [
  "heic",
  "heif",
  "jpg",
  "jpeg",
  "png",
  "tif",
  "tiff",
  "bmp",
  "webp",
] as const

/** 支持的后缀（不含点，小写）。与后端 VIDEO_EXTS 一致。 */
export const VIDEO_EXTS = ["mov", "mp4", "m4v", "avi", "mkv", "webm"] as const

export interface PairingFile {
  /** 相对相册根目录的路径（含后缀） */
  rel: string
  /** 后缀（小写，不带点） */
  ext: string
  kind: "image" | "video"
}

export interface PairedGroup {
  key: string
  image?: string
  video?: string
}

const FNV_OFFSET = 2166136261
const FNV_PRIME = 16777619

/**
 * FNV-1a（32 位）哈希，用于无 Node 环境下的稳定 key 校验。
 * 注意：这与后端的稳定 ID（MD5）不是同一算法——后端负责落盘 ID，
 * 前端只在浏览器里用它对「按 key 配对」这类纯逻辑做对称校验。
 */
export function fnv1a(input: string): string {
  let hash = FNV_OFFSET >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

function extOf(rel: string): string {
  const dot = rel.lastIndexOf(".")
  return dot > 0 ? rel.slice(dot + 1).toLowerCase() : ""
}

function stemOf(rel: string): string {
  const dot = rel.lastIndexOf(".")
  return dot > 0 ? rel.slice(0, dot) : rel
}

/**
 * 把一组文件按「相对路径去扩展名」配对（对齐 Python `scan.py` 的 groups）。
 * 同 key 下的第一个 image / 第一个 video 配对；同名不同扩展名不冲突。
 */
export function pairFiles(files: string[]): PairedGroup[] {
  const groups = new Map<string, PairedGroup>()
  for (const rel of files) {
    const ext = extOf(rel)
    const kind = (IMAGE_EXTS as readonly string[]).includes(ext)
      ? "image"
      : (VIDEO_EXTS as readonly string[]).includes(ext)
        ? "video"
        : undefined
    if (!kind) continue
    const key = stemOf(rel)
    const group = groups.get(key) ?? { key }
    if (kind === "image" && !group.image) group.image = rel
    else if (kind === "video" && !group.video) group.video = rel
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/** 由配对组推导条目类型（对齐 Python `typ` 判定）。 */
export function typeOf(group: PairedGroup): "live" | "photo" | "video" {
  if (group.image && group.video) return "live"
  if (group.image) return "photo"
  return "video"
}

/** 配对组 → 后端 PhotoItem 的对照校验辅助：验证 items 的 folder/stem 派生规则。 */
export function folderOf(key: string): string {
  const slash = key.lastIndexOf("/")
  if (slash < 0) return "."
  const folder = key.slice(0, slash)
  return folder || "."
}
