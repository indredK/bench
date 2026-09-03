/**
 * Pairing tests / 配对与分组纯函数单测.
 */
import { describe, expect, it } from "vitest"
import {
  fnv1a,
  pairFiles,
  typeOf,
  folderOf,
  IMAGE_EXTS,
  VIDEO_EXTS,
} from "@/features/photo-triage/lib/pairing"
import {
  filterItems,
  sortForGroup,
  buildRows,
  computeStats,
  groupFill,
} from "@/features/photo-triage/lib/grouping"
import type { PhotoItem } from "@/lib/tauri/types/photo-triage"

function item(id: string, folder: string, type: PhotoItem["type"] = "photo"): PhotoItem {
  return { id, type, stem: id, folder, image: `${folder}/${id}.jpg`, size_bytes: 1 }
}

describe("pairing", () => {
  it("pairs image + video by shared stem", () => {
    const groups = pairFiles(["IMG_0001.HEIC", "IMG_0001.MOV", "IMG_0002.JPG"])
    expect(groups).toHaveLength(2)
    const live = groups.find((g) => g.key === "IMG_0001")
    expect(live?.image).toBe("IMG_0001.HEIC")
    expect(live?.video).toBe("IMG_0001.MOV")
    expect(typeOf(live!)).toBe("live")
    expect(typeOf(groups[1])).toBe("photo")
  })

  it("ignores unsupported extensions", () => {
    const groups = pairFiles(["a.txt", "b.pdf", "c.mp3"])
    expect(groups).toHaveLength(0)
  })

  it("lowercases extension so case differences pair alike", () => {
    expect(pairFiles(["A.HEIC"])[0].key).toBe("A")
    expect(pairFiles(["A.heic"])[0].key).toBe("A")
  })

  it("folderOf resolves parent and root", () => {
    expect(folderOf("2024/Jan/IMG")).toBe("2024/Jan")
    expect(folderOf("IMG")).toBe(".")
  })

  it("fnv1a is deterministic and stable", () => {
    expect(fnv1a("IMG_0001")).toBe(fnv1a("IMG_0001"))
    expect(fnv1a("x")).not.toBe(fnv1a("y"))
  })

  it("ext lists mirror the constants", () => {
    expect(IMAGE_EXTS).toContain("heic")
    expect(VIDEO_EXTS).toContain("mov")
  })
})

describe("grouping", () => {
  const items: PhotoItem[] = [item("a", "."), item("b", "sub"), item("c", "sub"), item("d", ".")]

  it("filterItems honors filter semantics", () => {
    const sel = { b: "keep" as const, c: "drop" as const }
    const deleted = new Set(["d"])
    expect(filterItems(items, "all", sel, deleted).map((i) => i.id)).toEqual(["a", "b", "c", "d"])
    expect(filterItems(items, "keep", sel, deleted).map((i) => i.id)).toEqual(["b"])
    expect(filterItems(items, "drop", sel, deleted).map((i) => i.id)).toEqual(["c"])
    expect(filterItems(items, "deleted", sel, deleted).map((i) => i.id)).toEqual(["d"])
    expect(filterItems(items, "todo", sel, deleted).map((i) => i.id)).toEqual(["a"])
  })

  it("sortForGroup groups by folder order", () => {
    const visible = [items[0], items[1], items[2], items[3]]
    const grouped = sortForGroup(visible, true)
    expect(grouped.map((i) => i.folder)).toEqual([".", ".", "sub", "sub"])
  })

  it("buildRows emits headers at group starts", () => {
    const rows = buildRows(sortForGroup(items, true), true)
    const headers = rows.filter((r) => r.kind === "header")
    expect(headers).toHaveLength(2)
    const first = headers[0]
    expect(first.folder).toBe(".")
    expect(first.start).toBe(0)
    expect(first.end).toBe(2)
  })

  it("computeStats counts keep/drop/todo/deleted", () => {
    const sel = { a: "keep" as const, b: "drop" as const }
    const deleted = new Set(["c"])
    const stats = computeStats(items, sel, deleted)
    expect(stats.total).toBe(4)
    expect(stats.keep).toBe(1)
    expect(stats.drop).toBe(1)
    expect(stats.deleted).toBe(1)
    expect(stats.todo).toBe(1)
  })

  it("groupFill reports per-folder loaded ratio", () => {
    const rows = buildRows(sortForGroup(items, true), true)
    const loaded = new Set(["a", "b"])
    const fill = groupFill(rows, loaded)
    expect(fill.get(".")?.loaded).toBe(1)
    expect(fill.get(".")?.ratio).toBe(0.5)
    expect(fill.get("sub")?.loaded).toBe(1)
    expect(fill.get("sub")?.total).toBe(2)
  })
})
