/**
 * Repository / 数据层: re-export IPC commands; 封装业务层调用入口.
 * Clean Space 命令封装。
 */
export {
  scanStorageOverview,
  scanStorageStream,
  getCategoryItems,
  executeCategoryCleanup,
  scanCustomFolder,
  openSystemStorageSettings,
  getCleanupRecords,
  addCleanupRecord,
} from "@/lib/tauri/commands/clean-space"
