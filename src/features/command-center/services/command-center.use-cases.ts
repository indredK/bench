/**
 * Use Case / 用例层: coordinate business rules; 只编排业务规则.
 */
import { commandCenterRepository } from "@/features/command-center/services/command-center.repository"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import type { CardKind, CommandCard } from "@/lib/tauri/types/command-center"

/** 需要二次确认的动作类型（提权 + 打开外部目标）。 */
const CONFIRM_KINDS: ReadonlySet<CardKind> = new Set<CardKind>(["shellAdmin"])

export const commandCenterUseCases = {
  isAvailable() {
    return canUseDesktopFeatures()
  },

  requiresConfirm(kind: CardKind) {
    return CONFIRM_KINDS.has(kind)
  },

  listCards() {
    return commandCenterRepository.listCommandCards()
  },

  upsertCard(card: CommandCard) {
    return commandCenterRepository.upsertCommandCard(card)
  },

  deleteCard(id: string) {
    return commandCenterRepository.deleteCommandCard(id)
  },

  runCard(card: CommandCard) {
    return commandCenterRepository.runCommandCard(card.kind, card.command)
  },

  cancelRun() {
    return commandCenterRepository.cancelCommandCard()
  },

  exportCards(path: string, cards: CommandCard[]) {
    return commandCenterRepository.exportCommandCards(path, cards)
  },

  importCards(path: string) {
    return commandCenterRepository.importCommandCards(path)
  },

  createDraft(): CommandCard {
    const now = Date.now()
    return {
      id: `card-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: "",
      description: "",
      kind: "shell",
      command: "",
      icon: null,
      createdAt: now,
      updatedAt: now,
    }
  },

  /** 纯函数：按 id 顺序重排卡片，未出现在 orderedIds 中的卡片保持原相对顺序追加在末尾。 */
  reorderByIds(cards: CommandCard[], orderedIds: string[]): CommandCard[] {
    const byId = new Map(cards.map((c) => [c.id, c]))
    const seen = new Set<string>()
    const next: CommandCard[] = []
    for (const id of orderedIds) {
      const card = byId.get(id)
      if (card) {
        next.push(card)
        seen.add(id)
      }
    }
    for (const card of cards) {
      if (!seen.has(card.id)) next.push(card)
    }
    return next
  },

  reorderCards(cards: CommandCard[]) {
    return commandCenterRepository.saveCommandCards(cards)
  },
}
