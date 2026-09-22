import { describe, expect, it } from "vitest"
import { filterCardsByQuery } from "@/features/command-center/services/card-search"
import type { CommandCard } from "@/lib/tauri/types/command-center"

function card(overrides: Partial<CommandCard> = {}): CommandCard {
  return {
    id: "a",
    title: "Git status",
    description: "show working tree",
    kind: "shell",
    command: "git status --short",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe("filterCardsByQuery", () => {
  const cards = [
    card({ id: "a", title: "Git status", command: "git status --short" }),
    card({ id: "b", title: "Docker ps", description: "list containers", command: "docker ps" }),
  ]

  it("returns the same reference for an empty or whitespace query", () => {
    expect(filterCardsByQuery(cards, "")).toBe(cards)
    expect(filterCardsByQuery(cards, "   ")).toBe(cards)
  })

  it("matches on title", () => {
    expect(filterCardsByQuery(cards, "docker").map((c) => c.id)).toEqual(["b"])
  })

  it("matches on command body", () => {
    expect(filterCardsByQuery(cards, "--short").map((c) => c.id)).toEqual(["a"])
  })

  it("matches on description", () => {
    expect(filterCardsByQuery(cards, "containers").map((c) => c.id)).toEqual(["b"])
  })

  it("is case-insensitive and trims input", () => {
    expect(filterCardsByQuery(cards, "  GIT  ").map((c) => c.id)).toEqual(["a"])
  })

  it("returns [] when nothing matches", () => {
    expect(filterCardsByQuery(cards, "kubernetes")).toEqual([])
  })
})
