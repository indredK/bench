import { create } from "zustand"

import type { Industry, Term, TermInput } from "./services/terminology.repository"
import {
  FRONTEND_INDUSTRY_ID,
  FRONTEND_CATEGORY_ID,
  UNCLASSIFIED_SUBCATEGORY_ID,
} from "./constants"
import {
  validateSelection,
  getFilteredTerms,
  loadData,
  addIndustry as addIndustryUC,
  updateIndustry as updateIndustryUC,
  deleteIndustry as deleteIndustryUC,
  addCategory as addCategoryUC,
  updateCategory as updateCategoryUC,
  deleteCategory as deleteCategoryUC,
  addSubcategory as addSubcategoryUC,
  updateSubcategory as updateSubcategoryUC,
  deleteSubcategory as deleteSubcategoryUC,
  addTerm as addTermUC,
  updateTerm as updateTermUC,
  deleteTerm as deleteTermUC,
  setTermPinned as setTermPinnedUC,
} from "./services/terminology.use-cases"

interface TerminologyState {
  industries: Industry[]
  terms: Term[]
  pinnedTermIds: string[]
  selectedIndustryId: string
  selectedCategoryId: string
  selectedSubcategoryId: string
  searchQuery: string
  isLoading: boolean
  loadError: string | null

  hydrate: () => Promise<void>

  setIndustry: (id: string) => void
  setCategory: (id: string) => void
  setSubcategory: (id: string) => void
  setSearch: (q: string) => void

  addIndustry: (label: string) => Promise<string>
  updateIndustry: (id: string, label: string) => Promise<void>
  deleteIndustry: (id: string) => Promise<void>

  addCategory: (industryId: string, label: string) => Promise<string>
  updateCategory: (industryId: string, catId: string, label: string) => Promise<void>
  deleteCategory: (industryId: string, catId: string) => Promise<void>
  addSubcategory: (industryId: string, categoryId: string, label: string) => Promise<string>
  updateSubcategory: (
    industryId: string,
    categoryId: string,
    subcategoryId: string,
    label: string,
  ) => Promise<void>
  deleteSubcategory: (
    industryId: string,
    categoryId: string,
    subcategoryId: string,
  ) => Promise<void>

  addTerm: (term: TermInput) => Promise<void>
  updateTerm: (term: Term) => Promise<void>
  deleteTerm: (id: string) => Promise<void>
  setTermPinned: (id: string, value: boolean) => Promise<void>

  filteredTerms: () => Term[]
}

function stateFromData(
  data: { industries: Industry[]; terms: Term[]; pinnedTermIds: string[] },
  preferredIndustryId?: string,
  preferredCategoryId?: string,
  preferredSubcategoryId?: string,
) {
  const selection = validateSelection(
    data.industries,
    preferredIndustryId ?? data.industries[0]?.id ?? "",
    preferredCategoryId ?? "",
    preferredSubcategoryId ?? "",
  )
  return {
    industries: data.industries,
    terms: data.terms,
    pinnedTermIds: data.pinnedTermIds,
    ...selection,
  }
}

export const useTerminologyStore = create<TerminologyState>((set, get) => ({
  industries: [],
  terms: [],
  pinnedTermIds: [],
  selectedIndustryId: "",
  selectedCategoryId: "",
  selectedSubcategoryId: "",
  searchQuery: "",
  isLoading: true,
  loadError: null,

  hydrate: async () => {
    set({ isLoading: true, loadError: null })
    try {
      const data = await loadData()
      set({ ...stateFromData(data), isLoading: false })
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message || "terminology.errors.loadFailed"
          : "terminology.errors.loadFailed"
      set({ isLoading: false, loadError: message })
      throw error
    }
  },

  setIndustry: (id) => {
    const industry = get().industries.find((item) => item.id === id)
    const selectedCategoryId = industry?.categories.some(
      (category) => category.id === get().selectedCategoryId,
    )
      ? get().selectedCategoryId
      : ""
    const selectedCategory = industry?.categories.find(
      (category) => category.id === selectedCategoryId,
    )
    const selectedSubcategoryId = selectedCategory?.subcategories.some(
      (subcategory) => subcategory.id === get().selectedSubcategoryId,
    )
      ? get().selectedSubcategoryId
      : ""
    set({ selectedIndustryId: id, selectedCategoryId, selectedSubcategoryId })
  },
  setCategory: (id) => {
    const industry = get().industries.find((item) => item.id === get().selectedIndustryId)
    const category = industry?.categories.find((item) => item.id === id)
    const selectedSubcategoryId = category?.subcategories.some(
      (subcategory) => subcategory.id === get().selectedSubcategoryId,
    )
      ? get().selectedSubcategoryId
      : ""
    set({ selectedCategoryId: id, selectedSubcategoryId })
  },
  setSubcategory: (id) => set({ selectedSubcategoryId: id }),
  setSearch: (q) => set({ searchQuery: q }),

  addIndustry: async (label) => {
    const { created, data } = await addIndustryUC(label)
    set({ ...stateFromData(data, created.id, "", ""), isLoading: false })
    return created.id
  },
  updateIndustry: async (id, label) => {
    const data = await updateIndustryUC(id, label)
    set({ ...stateFromData(data, id), isLoading: false })
  },
  deleteIndustry: async (id) => {
    const data = await deleteIndustryUC(id)
    set({ ...stateFromData(data), isLoading: false })
  },

  addCategory: async (industryId, label) => {
    const { created, data } = await addCategoryUC(industryId, label)
    set({ ...stateFromData(data, industryId, created.id, ""), isLoading: false })
    return created.id
  },
  updateCategory: async (industryId, catId, label) => {
    const data = await updateCategoryUC(industryId, catId, label)
    set({ ...stateFromData(data, industryId, catId), isLoading: false })
  },
  deleteCategory: async (industryId, catId) => {
    const data = await deleteCategoryUC(industryId, catId)
    set({ ...stateFromData(data, industryId, "", ""), isLoading: false })
  },
  addSubcategory: async (industryId, categoryId, label) => {
    const { created, data } = await addSubcategoryUC(industryId, categoryId, label)
    set({ ...stateFromData(data, industryId, categoryId, created.id), isLoading: false })
    return created.id
  },
  updateSubcategory: async (industryId, categoryId, subcategoryId, label) => {
    const data = await updateSubcategoryUC(industryId, categoryId, subcategoryId, label)
    set({ ...stateFromData(data, industryId, categoryId, subcategoryId), isLoading: false })
  },
  deleteSubcategory: async (industryId, categoryId, subcategoryId) => {
    const data = await deleteSubcategoryUC(industryId, categoryId, subcategoryId)
    const preferredSubcategoryId =
      industryId === FRONTEND_INDUSTRY_ID && categoryId === FRONTEND_CATEGORY_ID
        ? UNCLASSIFIED_SUBCATEGORY_ID
        : ""
    set({
      ...stateFromData(data, industryId, categoryId, preferredSubcategoryId),
      isLoading: false,
    })
  },

  addTerm: async (term) => {
    const { created, data } = await addTermUC(term)
    set({
      ...stateFromData(data, created.industryId, created.categoryId, created.subcategoryId ?? ""),
      isLoading: false,
    })
  },
  updateTerm: async (term) => {
    const data = await updateTermUC(term)
    set({ ...stateFromData(data), isLoading: false })
  },
  deleteTerm: async (id) => {
    const data = await deleteTermUC(id)
    set({ ...stateFromData(data), isLoading: false })
  },
  setTermPinned: async (id, value) => {
    const data = await setTermPinnedUC(id, value)
    set({ ...stateFromData(data), isLoading: false })
  },

  filteredTerms: () => {
    const s = get()
    return getFilteredTerms({
      terms: s.terms,
      pinnedTermIds: s.pinnedTermIds,
      selectedIndustryId: s.selectedIndustryId,
      selectedCategoryId: s.selectedCategoryId,
      selectedSubcategoryId: s.selectedSubcategoryId,
      searchQuery: s.searchQuery,
    })
  },
}))
