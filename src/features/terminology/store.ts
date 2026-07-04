import { create } from "zustand";

import {
  createCategory,
  createIndustry,
  createSubcategory,
  createTerm,
  deleteCategory,
  deleteIndustry,
  deleteSubcategory,
  deleteTerm,
  listTerminologyData,
  setTermPinned as setTermPinnedCommand,
  updateCategory,
  updateIndustry,
  updateSubcategory,
  updateTerm,
} from "@/lib/tauri/commands/terminology";
import {
  FRONTEND_CATEGORY_ID,
  FRONTEND_INDUSTRY_ID,
  UNCLASSIFIED_SUBCATEGORY_ID,
  isUnclassifiedSubcategoryId,
} from "./constants";
import type { Industry, Term, TermInput } from "./types";

interface TerminologyState {
  industries: Industry[];
  terms: Term[];
  pinnedTermIds: string[];
  selectedIndustryId: string;
  selectedCategoryId: string;
  selectedSubcategoryId: string;
  searchQuery: string;
  isLoading: boolean;
  loadError: string | null;

  hydrate: () => Promise<void>;

  setIndustry: (id: string) => void;
  setCategory: (id: string) => void;
  setSubcategory: (id: string) => void;
  setSearch: (q: string) => void;

  addIndustry: (label: string) => Promise<string>;
  updateIndustry: (id: string, label: string) => Promise<void>;
  deleteIndustry: (id: string) => Promise<void>;

  addCategory: (industryId: string, label: string) => Promise<string>;
  updateCategory: (industryId: string, catId: string, label: string) => Promise<void>;
  deleteCategory: (industryId: string, catId: string) => Promise<void>;
  addSubcategory: (industryId: string, categoryId: string, label: string) => Promise<string>;
  updateSubcategory: (
    industryId: string,
    categoryId: string,
    subcategoryId: string,
    label: string
  ) => Promise<void>;
  deleteSubcategory: (
    industryId: string,
    categoryId: string,
    subcategoryId: string
  ) => Promise<void>;

  addTerm: (term: TermInput) => Promise<void>;
  updateTerm: (term: Term) => Promise<void>;
  deleteTerm: (id: string) => Promise<void>;
  setTermPinned: (id: string, value: boolean) => Promise<void>;

  filteredTerms: () => Term[];
}

function syncSelection(
  industries: Industry[],
  preferredIndustryId: string,
  preferredCategoryId: string,
  preferredSubcategoryId: string
) {
  const selectedIndustryId = industries.some((industry) => industry.id === preferredIndustryId)
    ? preferredIndustryId
    : industries[0]?.id ?? "";
  const selectedIndustry = industries.find((industry) => industry.id === selectedIndustryId);
  const selectedCategoryId =
    selectedIndustry?.categories.some((category) => category.id === preferredCategoryId)
      ? preferredCategoryId
      : "";
  const selectedCategory = selectedIndustry?.categories.find(
    (category) => category.id === selectedCategoryId
  );
  const selectedSubcategoryId =
    selectedCategory?.subcategories.some(
      (subcategory) => subcategory.id === preferredSubcategoryId
    )
      ? preferredSubcategoryId
      : "";

  return { selectedIndustryId, selectedCategoryId, selectedSubcategoryId };
}

function matchesSelectedSubcategory(termSubcategoryId: string | null | undefined, selectedSubcategoryId: string) {
  if (!selectedSubcategoryId) return true;
  if (selectedSubcategoryId === UNCLASSIFIED_SUBCATEGORY_ID) {
    return isUnclassifiedSubcategoryId(termSubcategoryId);
  }
  return termSubcategoryId === selectedSubcategoryId;
}

async function reloadFromBackend(
  set: (partial: Partial<TerminologyState>) => void,
  get: () => TerminologyState,
  preferredIndustryId?: string,
  preferredCategoryId?: string,
  preferredSubcategoryId?: string
) {
  const data = await listTerminologyData();
  const selection = syncSelection(
    data.industries,
    preferredIndustryId ?? get().selectedIndustryId,
    preferredCategoryId ?? get().selectedCategoryId,
    preferredSubcategoryId ?? get().selectedSubcategoryId
  );
  set({
    industries: data.industries,
    terms: data.terms,
    pinnedTermIds: data.pinnedTermIds,
    selectedIndustryId: selection.selectedIndustryId,
    selectedCategoryId: selection.selectedCategoryId,
    selectedSubcategoryId: selection.selectedSubcategoryId,
    isLoading: false,
  });
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
    set({ isLoading: true, loadError: null });
    try {
      await reloadFromBackend(set, get);
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message?: unknown }).message === "string"
          ? ((error as { message: string }).message || "Failed to load terminology data")
          : "Failed to load terminology data";
      set({ isLoading: false, loadError: message });
      throw error;
    }
  },

  setIndustry: (id) => {
    const industry = get().industries.find((item) => item.id === id);
    const selectedCategoryId = industry?.categories.some((category) => category.id === get().selectedCategoryId)
      ? get().selectedCategoryId
      : "";
    const selectedCategory = industry?.categories.find((category) => category.id === selectedCategoryId);
    const selectedSubcategoryId = selectedCategory?.subcategories.some(
      (subcategory) => subcategory.id === get().selectedSubcategoryId
    )
      ? get().selectedSubcategoryId
      : "";
    set({ selectedIndustryId: id, selectedCategoryId, selectedSubcategoryId });
  },
  setCategory: (id) => {
    const industry = get().industries.find((item) => item.id === get().selectedIndustryId);
    const category = industry?.categories.find((item) => item.id === id);
    const selectedSubcategoryId = category?.subcategories.some(
      (subcategory) => subcategory.id === get().selectedSubcategoryId
    )
      ? get().selectedSubcategoryId
      : "";
    set({ selectedCategoryId: id, selectedSubcategoryId });
  },
  setSubcategory: (id) => set({ selectedSubcategoryId: id }),
  setSearch: (q) => set({ searchQuery: q }),

  addIndustry: async (label) => {
    const created = await createIndustry(label);
    await reloadFromBackend(set, get, created.id, "");
    return created.id;
  },
  updateIndustry: async (id, label) => {
    await updateIndustry(id, label);
    await reloadFromBackend(set, get);
  },
  deleteIndustry: async (id) => {
    await deleteIndustry(id);
    await reloadFromBackend(set, get);
  },

  addCategory: async (industryId, label) => {
    const created = await createCategory(industryId, label);
    await reloadFromBackend(set, get, industryId, created.id, "");
    return created.id;
  },
  updateCategory: async (industryId, catId, label) => {
    await updateCategory(industryId, catId, label);
    await reloadFromBackend(set, get);
  },
  deleteCategory: async (industryId, catId) => {
    await deleteCategory(industryId, catId);
    await reloadFromBackend(set, get, industryId, "", "");
  },
  addSubcategory: async (industryId, categoryId, label) => {
    const created = await createSubcategory(industryId, categoryId, label);
    await reloadFromBackend(set, get, industryId, categoryId, created.id);
    return created.id;
  },
  updateSubcategory: async (industryId, categoryId, subcategoryId, label) => {
    await updateSubcategory(industryId, categoryId, subcategoryId, label);
    await reloadFromBackend(set, get);
  },
  deleteSubcategory: async (industryId, categoryId, subcategoryId) => {
    await deleteSubcategory(industryId, categoryId, subcategoryId);
    await reloadFromBackend(
      set,
      get,
      industryId,
      categoryId,
      industryId === FRONTEND_INDUSTRY_ID && categoryId === FRONTEND_CATEGORY_ID
        ? UNCLASSIFIED_SUBCATEGORY_ID
        : ""
    );
  },

  addTerm: async (term) => {
    const created = await createTerm(term);
    await reloadFromBackend(
      set,
      get,
      created.industryId,
      created.categoryId,
      created.subcategoryId ?? ""
    );
  },
  updateTerm: async (term) => {
    await updateTerm(term);
    await reloadFromBackend(set, get);
  },
  deleteTerm: async (id) => {
    await deleteTerm(id);
    await reloadFromBackend(set, get);
  },
  setTermPinned: async (id, value) => {
    await setTermPinnedCommand(id, value);
    await reloadFromBackend(set, get);
  },

  filteredTerms: () => {
    const {
      terms,
      pinnedTermIds,
      selectedIndustryId,
      selectedCategoryId,
      selectedSubcategoryId,
      searchQuery,
    } = get();
    const pinnedSet = new Set(pinnedTermIds);
    return terms
      .filter((term) => {
      if (term.industryId !== selectedIndustryId) return false;
      if (selectedCategoryId && term.categoryId !== selectedCategoryId) return false;
      if (!matchesSelectedSubcategory(term.subcategoryId, selectedSubcategoryId)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          term.title.toLowerCase().includes(q) ||
          term.description.toLowerCase().includes(q)
        );
      }
      return true;
      })
      .sort((a, b) => {
        const aPinned = pinnedSet.has(a.id) ? 1 : 0;
        const bPinned = pinnedSet.has(b.id) ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;

        return a.title.localeCompare(b.title, "zh-Hans-CN");
      });
  },
}));
