import type { CommandCard } from "@/lib/tauri/types/command-center"

/**
 * filterCardsByQuery / 关键字过滤命令卡片.
 *
 * 纯函数、大小写不敏感、去首尾空白；空查询原样返回入参（保持引用不变以便 memo 短路）。
 * 匹配标题 / 描述 / 命令正文三处文本。分组/标签过滤尚未实现（见 planned/command-center.md）。
 */
export function filterCardsByQuery(cards: CommandCard[], query: string): CommandCard[] {
  const q = query.trim().toLowerCase()
  if (!q) return cards
  return cards.filter(
    (card) =>
      card.title.toLowerCase().includes(q) ||
      card.description.toLowerCase().includes(q) ||
      card.command.toLowerCase().includes(q),
  )
}
