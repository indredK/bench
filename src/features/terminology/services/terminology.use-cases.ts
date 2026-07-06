import {
  UNCLASSIFIED_SUBCATEGORY_ID,
  isUnclassifiedSubcategoryId,
} from "../constants"
import type {
  Industry,
  Term,
  TermCategory,
  TermInput,
  TermSubcategory,
  TerminologyBundle,
} from "./terminology.repository"
import { terminologyRepository } from "./terminology.repository"

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FilterState {
  terms: Term[]
  pinnedTermIds: string[]
  selectedIndustryId: string
  selectedCategoryId: string
  selectedSubcategoryId: string
  searchQuery: string
}

export interface TerminologyData {
  industries: Industry[]
  terms: Term[]
  pinnedTermIds: string[]
}

export interface ValidatedSelection {
  selectedIndustryId: string
  selectedCategoryId: string
  selectedSubcategoryId: string
}

// ─── Pure helpers (moved from store.ts) ────────────────────────────────────────

function matchesSelectedSubcategory(
  termSubcategoryId: string | null | undefined,
  selectedSubcategoryId: string,
): boolean {
  if (!selectedSubcategoryId) return true
  if (selectedSubcategoryId === UNCLASSIFIED_SUBCATEGORY_ID) {
    return isUnclassifiedSubcategoryId(termSubcategoryId)
  }
  return termSubcategoryId === selectedSubcategoryId
}

export function getFilteredTerms(state: FilterState): Term[] {
  const {
    terms,
    pinnedTermIds,
    selectedIndustryId,
    selectedCategoryId,
    selectedSubcategoryId,
    searchQuery,
  } = state
  const pinnedSet = new Set(pinnedTermIds)
  return terms
    .filter((term) => {
      if (term.industryId !== selectedIndustryId) return false
      if (selectedCategoryId && term.categoryId !== selectedCategoryId) return false
      if (!matchesSelectedSubcategory(term.subcategoryId, selectedSubcategoryId)) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return term.title.toLowerCase().includes(q) || term.description.toLowerCase().includes(q)
      }
      return true
    })
    .sort((a, b) => {
      const aPinned = pinnedSet.has(a.id) ? 1 : 0
      const bPinned = pinnedSet.has(b.id) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      return a.title.localeCompare(b.title, "zh-Hans-CN")
    })
}

export function validateSelection(
  industries: Industry[],
  preferredIndustryId: string,
  preferredCategoryId: string,
  preferredSubcategoryId: string,
): ValidatedSelection {
  const selectedIndustryId = industries.some((industry) => industry.id === preferredIndustryId)
    ? preferredIndustryId
    : (industries[0]?.id ?? "")
  const selectedIndustry = industries.find((industry) => industry.id === selectedIndustryId)
  const selectedCategoryId = selectedIndustry?.categories.some(
    (category) => category.id === preferredCategoryId,
  )
    ? preferredCategoryId
    : ""
  const selectedCategory = selectedIndustry?.categories.find(
    (category) => category.id === selectedCategoryId,
  )
  const selectedSubcategoryId = selectedCategory?.subcategories.some(
    (subcategory) => subcategory.id === preferredSubcategoryId,
  )
    ? preferredSubcategoryId
    : ""

  return { selectedIndustryId, selectedCategoryId, selectedSubcategoryId }
}

// ─── Data loading ──────────────────────────────────────────────────────────────

export async function loadData(): Promise<TerminologyData> {
  const bundle: TerminologyBundle = await terminologyRepository.listTerminologyData()
  return {
    industries: bundle.industries,
    terms: bundle.terms,
    pinnedTermIds: bundle.pinnedTermIds,
  }
}

// ─── CRUD orchestration ────────────────────────────────────────────────────────

export async function addIndustry(
  label: string,
): Promise<{ created: Industry; data: TerminologyData }> {
  const created = await terminologyRepository.createIndustry(label)
  const data = await loadData()
  return { created, data }
}

export async function updateIndustry(
  id: string,
  label: string,
): Promise<TerminologyData> {
  await terminologyRepository.updateIndustry(id, label)
  return loadData()
}

export async function deleteIndustry(id: string): Promise<TerminologyData> {
  await terminologyRepository.deleteIndustry(id)
  return loadData()
}

export async function addCategory(
  industryId: string,
  label: string,
): Promise<{ created: TermCategory; data: TerminologyData }> {
  const created = await terminologyRepository.createCategory(industryId, label)
  const data = await loadData()
  return { created, data }
}

export async function updateCategory(
  industryId: string,
  categoryId: string,
  label: string,
): Promise<TerminologyData> {
  await terminologyRepository.updateCategory(industryId, categoryId, label)
  return loadData()
}

export async function deleteCategory(
  industryId: string,
  categoryId: string,
): Promise<TerminologyData> {
  await terminologyRepository.deleteCategory(industryId, categoryId)
  return loadData()
}

export async function addSubcategory(
  industryId: string,
  categoryId: string,
  label: string,
): Promise<{ created: TermSubcategory; data: TerminologyData }> {
  const created = await terminologyRepository.createSubcategory(industryId, categoryId, label)
  const data = await loadData()
  return { created, data }
}

export async function updateSubcategory(
  industryId: string,
  categoryId: string,
  subcategoryId: string,
  label: string,
): Promise<TerminologyData> {
  await terminologyRepository.updateSubcategory(industryId, categoryId, subcategoryId, label)
  return loadData()
}

export async function deleteSubcategory(
  industryId: string,
  categoryId: string,
  subcategoryId: string,
): Promise<TerminologyData> {
  await terminologyRepository.deleteSubcategory(industryId, categoryId, subcategoryId)
  return loadData()
}

export async function addTerm(
  input: TermInput,
): Promise<{ created: Term; data: TerminologyData }> {
  const created = await terminologyRepository.createTerm(input)
  const data = await loadData()
  return { created, data }
}

export async function updateTerm(term: Term): Promise<TerminologyData> {
  await terminologyRepository.updateTerm(term)
  return loadData()
}

export async function deleteTerm(id: string): Promise<TerminologyData> {
  await terminologyRepository.deleteTerm(id)
  return loadData()
}

export async function setTermPinned(
  id: string,
  value: boolean,
): Promise<TerminologyData> {
  await terminologyRepository.setTermPinned(id, value)
  return loadData()
}
