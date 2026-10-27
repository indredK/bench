import { describe, expect, it } from "vitest"
import {
  filterCommandCards,
  MAX_COMMAND_CARD_TAGS,
  normalizeCommandCardGroup,
  normalizeCommandCardTags,
} from "@/features/command-center/services/command-center.filters"
import type { CommandCard } from "@/lib/tauri/types/command-center"

function card(overrides: Partial<CommandCard> = {}): CommandCard {
  return {
    id: "card-1",
    title: "Restart API",
    description: "Restart the local development service",
    kind: "shell",
    command: "pnpm dev:restart",
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    group: "Development",
    tags: ["api", "local"],
    ...overrides,
  }
}

describe("command card metadata filters", () => {
  it("trims group names and limits them by Unicode characters", () => {
    expect(normalizeCommandCardGroup("  工具 ")).toBe("工具")
    expect(normalizeCommandCardGroup("界".repeat(100))).toHaveLength(80)
  })

  it("normalizes comma-separated tags, removes duplicates, and enforces limits", () => {
    expect(normalizeCommandCardTags(" API，api; local\nnetwork ")).toEqual([
      "API",
      "local",
      "network",
    ])
    expect(
      normalizeCommandCardTags(Array.from({ length: 14 }, (_, i) => `tag-${i}`).join(",")),
    ).toHaveLength(MAX_COMMAND_CARD_TAGS)
    expect(normalizeCommandCardTags("界".repeat(50))[0]).toHaveLength(40)
  })

  it("matches every query term across card text and combines group/tag filters", () => {
    const cards = [
      card(),
      card({ id: "card-2", title: "Production API", group: "Operations", tags: ["api"] }),
      card({ id: "card-3", title: "Restart worker", tags: ["worker"] }),
    ]

    expect(
      filterCommandCards(cards, { query: "restart local", group: "Development", tag: "API" }).map(
        (item) => item.id,
      ),
    ).toEqual(["card-1"])
    expect(
      filterCommandCards(cards, { query: "api", group: "", tag: "" }).map((c) => c.id),
    ).toEqual(["card-1", "card-2"])
  })

  it("treats legacy cards without metadata as ungrouped and untagged", () => {
    const legacy = card({ group: undefined, tags: undefined })

    expect(filterCommandCards([legacy], { query: "", group: "", tag: "" })).toEqual([legacy])
    expect(filterCommandCards([legacy], { query: "", group: "", tag: "local" })).toEqual([])
  })
})
