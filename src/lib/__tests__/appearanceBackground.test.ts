import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  BACKGROUND_STORAGE_KEY,
  parseBackground,
  readBackground,
  saveBackground,
} from "@/lib/appearanceBackground"

describe("appearance background preference", () => {
  beforeEach(() => window.localStorage.clear())

  it("restores supported colors and raster images, rejecting unsafe input", () => {
    expect(parseBackground('{"kind":"color","value":"#123abc"}')).toEqual({
      kind: "color",
      value: "#123abc",
    })
    expect(parseBackground('{"kind":"image","value":"data:image/png;base64,YWJj"}').kind).toBe(
      "image",
    )
    expect(parseBackground('{"kind":"image","value":"data:image/svg+xml;base64,YWJj"}').kind).toBe(
      "default",
    )
    expect(parseBackground('{"kind":"color","value":"red; }"}').kind).toBe("default")
    expect(parseBackground("not-json").kind).toBe("default")
  })

  it("persists the selection and reports storage failures", () => {
    expect(saveBackground({ kind: "color", value: "#abcdef" })).toBe(true)
    expect(readBackground()).toEqual({ kind: "color", value: "#abcdef" })
    expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toContain("#abcdef")
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    expect(saveBackground({ kind: "default" })).toBe(false)
    setItem.mockRestore()
  })
})
