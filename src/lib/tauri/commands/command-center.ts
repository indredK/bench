/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"
import type { CardKind, CommandCard } from "@/lib/tauri/types/command-center"

export function listCommandCards() {
  return invokeTauriCommand(TAURI_COMMANDS.commandCenter.listCommandCards)
}

export function saveCommandCards(cards: CommandCard[]) {
  return invokeTauriCommand(TAURI_COMMANDS.commandCenter.saveCommandCards, { cards })
}

export function upsertCommandCard(card: CommandCard) {
  return invokeTauriCommand(TAURI_COMMANDS.commandCenter.upsertCommandCard, { card })
}

export function deleteCommandCard(id: string) {
  return invokeTauriCommand(TAURI_COMMANDS.commandCenter.deleteCommandCard, { id })
}

export function runCommandCard(kind: CardKind, command: string) {
  return invokeTauriCommand(TAURI_COMMANDS.commandCenter.runCommandCard, { kind, command })
}

export function cancelCommandCard() {
  return invokeTauriCommand(TAURI_COMMANDS.commandCenter.cancelCommandCard)
}

export function exportCommandCards(path: string, cards: CommandCard[]) {
  return invokeTauriCommand(TAURI_COMMANDS.commandCenter.exportCommandCards, { path, cards })
}

export function importCommandCards(path: string) {
  return invokeTauriCommand(TAURI_COMMANDS.commandCenter.importCommandCards, { path })
}

/** 浏览命令市场（市场源由宿主 env 配置；未配置返回空列表）。 */
export function listMarketCommands() {
  return invokeTauriCommand(TAURI_COMMANDS.commandMarket.listMarketCommands)
}

/** 从命令市场安装命令（sha256 校验 + 版本单调，落位进本地卡片库）。 */
export function installMarketCommand(commandId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.commandMarket.installMarketCommand, { commandId })
}
