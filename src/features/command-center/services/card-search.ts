import type { CommandCard } from "@/lib/tauri/types/command-center"

/**
 * filterCardsByQuery / 关键字过滤命令卡片.
 *
 * 纯函数、大小写不敏感、去首尾空白；空查询原样返回入参（保持引用不变以便 memo 短路）。
 * 匹配标题 / 描述 / 命令正文 / 任一标签。分组显示尚未实现（见 planned/command-center.md）。
 */
export function filterCardsByQuery(cards: CommandCard[], query: string): CommandCard[] {
  const q = query.trim().toLowerCase()
  if (!q) return cards
  return cards.filter(
    (card) =>
      card.title.toLowerCase().includes(q) ||
      card.description.toLowerCase().includes(q) ||
      card.command.toLowerCase().includes(q) ||
      (card.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
  )
}

/**
 * parseTags / 解析标签输入: 把逗号或换行分隔的自由文本转成去重、去空白的标签数组。
 * 纯函数、可单测；大小写保留（展示原样），仅按精确字符串去重。
 */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(/[,\n]/)) {
    const tag = part.trim()
    if (tag) seen.add(tag)
  }
  return [...seen]
}

/** tagsToText / 标签转编辑文本: 用 `, ` 连接，供输入框回显。 */
export function tagsToText(tags: string[]): string {
  return tags.join(", ")
}

export interface CardGroup {
  /** 分组键 = 卡片首个标签；无标签卡片归到空串键。 */
  key: string
  cards: CommandCard[]
}

/**
 * groupByFirstTag / 按首个标签分组.
 * 纯函数：按各分组「首次出现」的顺序排列，组内保持原相对顺序，不打乱卡片次序。
 * 无标签的卡片统一落到 key === "" 的分组（上层显示为「未分类」）。
 */
export function groupByFirstTag(cards: CommandCard[]): CardGroup[] {
  const groups: CardGroup[] = []
  const index = new Map<string, CardGroup>()
  for (const card of cards) {
    const key = card.tags && card.tags.length > 0 ? card.tags[0] : ""
    let group = index.get(key)
    if (!group) {
      group = { key, cards: [] }
      index.set(key, group)
      groups.push(group)
    }
    group.cards.push(card)
  }
  return groups
}
