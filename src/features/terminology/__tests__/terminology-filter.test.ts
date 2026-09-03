/**
 * terminology filter/selection tests / 术语过滤与选择校验 (A4-4):
 *   getFilteredTerms 纯函数(行业/类目/未分类子类/搜索/置顶排序) + validateSelection。
 */
import { describe, expect, it } from "vitest"
import {
  getFilteredTerms,
  validateSelection,
  type FilterState,
} from "@/features/terminology/services/terminology.use-cases"
import type { Term } from "@/features/terminology/services/terminology.repository"

function term(id: string, overrides: Partial<Term> = {}): Term {
  return {
    id,
    industryId: "ind-1",
    categoryId: "cat-1",
    subcategoryId: "sub-1",
    title: `Term ${id}`,
    description: `Desc ${id}`,
    websites: [],
    createdAt: "2026-01-01 00:00",
    updatedAt: "2026-01-01 00:00",
    ...overrides,
  } as Term
}

const base: FilterState = {
  terms: [],
  pinnedTermIds: [],
  selectedIndustryId: "ind-1",
  selectedCategoryId: "",
  selectedSubcategoryId: "",
  searchQuery: "",
}

describe("getFilteredTerms", () => {
  it("filters by industry, category and subcategory", () => {
    const result = getFilteredTerms({
      ...base,
      terms: [
        term("a"),
        term("b", { industryId: "ind-2" }),
        term("c", { categoryId: "cat-2" }),
        term("d", { subcategoryId: "sub-9" }),
      ],
      selectedCategoryId: "cat-1",
      selectedSubcategoryId: "sub-1",
    })
    expect(result.map((t) => t.id)).toEqual(["a"])
  })

  it("keeps unclassified terms when the unclassified subcategory is selected", () => {
    const result = getFilteredTerms({
      ...base,
      terms: [term("a", { subcategoryId: null }), term("b", { subcategoryId: "sub-1" })],
      selectedSubcategoryId: "__unclassified__",
    })
    expect(result.map((t) => t.id)).toEqual(["a"])
  })

  it("matches search against title and description case-insensitively", () => {
    const result = getFilteredTerms({
      ...base,
      terms: [term("a", { title: "Rust 所有权", description: "ownership" }), term("b")],
      searchQuery: "OWNERSHIP",
    })
    expect(result.map((t) => t.id)).toEqual(["a"])
  })

  it("sorts pinned terms before regular terms", () => {
    const result = getFilteredTerms({
      ...base,
      terms: [
        term("a", { title: "Apple" }),
        term("b", { title: "Banana" }),
        term("c", { title: "Cherry" }),
      ],
      pinnedTermIds: ["c"],
    })
    expect(result.map((t) => t.id)).toEqual(["c", "a", "b"])
  })
})

describe("validateSelection", () => {
  const industries = [
    {
      id: "ind-1",
      label: "I1",
      categories: [{ id: "cat-1", label: "C1", subcategories: [{ id: "sub-1", label: "S1" }] }],
    },
    { id: "ind-2", label: "I2", categories: [] },
  ]

  it("accepts a valid full selection chain", () => {
    expect(validateSelection(industries, "ind-1", "cat-1", "sub-1")).toEqual({
      selectedIndustryId: "ind-1",
      selectedCategoryId: "cat-1",
      selectedSubcategoryId: "sub-1",
    })
  })

  it("falls back to the first industry and keeps its still-valid category chain", () => {
    // 行业回退到第一个后, 若其下确有匹配的类目/子类则保留 (现有契约)。
    expect(validateSelection(industries, "missing", "cat-1", "sub-1")).toEqual({
      selectedIndustryId: "ind-1",
      selectedCategoryId: "cat-1",
      selectedSubcategoryId: "sub-1",
    })
    // 行业有效但类目不属于该行业 → 清空类目链。
    expect(validateSelection(industries, "ind-2", "cat-1", "sub-1")).toEqual({
      selectedIndustryId: "ind-2",
      selectedCategoryId: "",
      selectedSubcategoryId: "",
    })
  })

  it("returns empty selection when there are no industries", () => {
    expect(validateSelection([], "x", "y", "z")).toEqual({
      selectedIndustryId: "",
      selectedCategoryId: "",
      selectedSubcategoryId: "",
    })
  })
})
