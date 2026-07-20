import { describe, expect, it } from "vitest"
import { commandCenterUseCases } from "@/features/command-center/services/command-center.use-cases"
import type { CommandCard } from "@/lib/tauri/types/command-center"

function card(id: string): CommandCard {
  return {
    id,
    title: id,
    description: "",
    kind: "shell",
    command: "",
    icon: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe("reorderByIds", () => {
  const cards = [card("a"), card("b"), card("c"), card("d")]

  it("reorders by the given id sequence", () => {
    expect(
      commandCenterUseCases.reorderByIds(cards, ["c", "a", "b", "d"]).map((c) => c.id),
    ).toEqual(["c", "a", "b", "d"])
  })

  it("keeps cards not present in orderedIds at the end, preserving relative order", () => {
    expect(commandCenterUseCases.reorderByIds(cards, ["d", "b"]).map((c) => c.id)).toEqual([
      "d",
      "b",
      "a",
      "c",
    ])
  })

  it("ignores unknown ids in the sequence", () => {
    expect(
      commandCenterUseCases.reorderByIds(cards, ["x", "a", "c", "y"]).map((c) => c.id),
    ).toEqual(["a", "c", "b", "d"])
  })

  it("returns original order for an empty sequence", () => {
    expect(commandCenterUseCases.reorderByIds(cards, []).map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ])
  })

  it("does not mutate the input array", () => {
    const snapshot = cards.map((c) => c.id)
    commandCenterUseCases.reorderByIds(cards, ["d", "c", "b", "a"])
    expect(cards.map((c) => c.id)).toEqual(snapshot)
  })
})
