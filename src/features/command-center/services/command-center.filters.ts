import type { CommandCard } from "@/lib/tauri/types/command-center"

export const MAX_COMMAND_CARD_GROUP_LENGTH = 80
export const MAX_COMMAND_CARD_TAGS = 12
export const MAX_COMMAND_CARD_TAG_LENGTH = 40

export interface CommandCardFilters {
  query: string
  group: string
  tag: string
}

function takeCharacters(value: string, limit: number) {
  return Array.from(value).slice(0, limit).join("")
}

export function normalizeCommandCardGroup(value: string) {
  return takeCharacters(value.trim(), MAX_COMMAND_CARD_GROUP_LENGTH)
}

export function normalizeCommandCardTags(value: string): string[] {
  const tags: string[] = []
  const seen = new Set<string>()

  for (const rawTag of value.split(/[,，;；\n]/u)) {
    const tag = takeCharacters(rawTag.trim(), MAX_COMMAND_CARD_TAG_LENGTH)
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length === MAX_COMMAND_CARD_TAGS) break
  }

  return tags
}

export function filterCommandCards(cards: CommandCard[], filters: CommandCardFilters) {
  const terms = filters.query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  const group = filters.group.trim().toLowerCase()
  const tag = filters.tag.trim().toLowerCase()

  return cards.filter((card) => {
    const cardGroup = (card.group ?? "").trim()
    const cardTags = (card.tags ?? []).map((value) => value.trim())

    if (group && cardGroup.toLowerCase() !== group) return false
    if (tag && !cardTags.some((value) => value.toLowerCase() === tag)) return false

    if (terms.length === 0) return true
    const searchable = [
      card.title,
      card.description,
      card.command,
      card.kind,
      cardGroup,
      ...cardTags,
    ]
      .join("\n")
      .toLowerCase()

    return terms.every((term) => searchable.includes(term))
  })
}
