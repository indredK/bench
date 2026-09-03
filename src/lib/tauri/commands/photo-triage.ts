/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 * Photo Triage（照片筛选）。
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"

export function photoTriageScan(src: string) {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.scan, { src })
}

export function photoTriageScanStatus() {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.scanStatus)
}

export function photoTriageListRecent() {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.listRecent)
}

export function photoTriageOpen(src: string) {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.open, { src })
}

export function photoTriageCapabilities() {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.capabilities)
}

export function photoTriageEnsureProxy(id: string, kind: "image" | "poster" | "video") {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.ensureProxy, { id, kind })
}

export function photoTriageOriginalPath(id: string) {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.originalPath, { id })
}

export function photoTriageTrash(ids: string[]) {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.trash, { ids })
}

export function photoTriageRestore(ids: string[]) {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.restore, { ids })
}

export function photoTriageMove(ids: string[], target: string) {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.move, { ids, target })
}

export function photoTriageReveal(path: string) {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.reveal, { path })
}

export function photoTriagePrune() {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.prune)
}

export function photoTriageEmptyDirs() {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.emptyDirs)
}

export function photoTriageDeleteEmptyDirs(paths: string[]) {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.deleteEmptyDirs, { paths })
}

export function photoTriageExport(ids: string[], out: string, zip: boolean) {
  return invokeTauriCommand(TAURI_COMMANDS.photoTriage.export, { ids, out, zip })
}
