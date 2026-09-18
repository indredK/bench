/**
 * IPC Commands / douyin-content-assets 插件能力面 typed wrapper（DCA-01）。
 * 命令清单与 acl.rs / 插件 manifest acl 保持同步（D-037）。
 */
import { invokeTauriCommand } from "@/lib/tauri/invoke"
import type {
  CapturedItemPage,
  DeleteOutcome,
  DouyinCapabilities,
  ImportFilesOutcome,
} from "@/lib/tauri/types/douyin-content-assets"

export function getDouyinAssetsCapabilities(): Promise<DouyinCapabilities> {
  return invokeTauriCommand("douyin_assets_get_capabilities")
}

export function listDouyinAssetsItems(args: {
  offset?: number
  limit?: number
  listType?: string
  search?: string
}): Promise<CapturedItemPage> {
  return invokeTauriCommand("douyin_assets_list_items", args)
}

/** 打开宿主原生文件选择器导入本地视频；取消返回空列表。 */
export function importDouyinAssetsFiles(): Promise<ImportFilesOutcome> {
  return invokeTauriCommand("douyin_assets_import_files")
}

/** 软删采集条目与/或视频资产（宿主保留数据，遵循回收语义）。 */
export function deleteDouyinAssetsItems(args: {
  itemIds?: string[]
  assetIds?: string[]
}): Promise<DeleteOutcome> {
  return invokeTauriCommand("douyin_assets_delete_items", args)
}
