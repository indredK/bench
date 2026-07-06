import * as commands from "@/lib/tauri/commands/terminology"
import type {
  Industry,
  Term,
  TermCategory,
  TermInput,
  TermSubcategory,
  TerminologyBundle,
} from "@/lib/tauri/types/terminology"

export type {
  Industry,
  Term,
  TermCategory,
  TermInput,
  TermSubcategory,
  TerminologyBundle,
} from "@/lib/tauri/types/terminology"

export const terminologyRepository = {
  listTerminologyData(): Promise<TerminologyBundle> {
    return commands.listTerminologyData()
  },

  createIndustry(label: string): Promise<Industry> {
    return commands.createIndustry(label)
  },

  updateIndustry(id: string, label: string): Promise<Industry> {
    return commands.updateIndustry(id, label)
  },

  deleteIndustry(id: string): Promise<void> {
    return commands.deleteIndustry(id)
  },

  createCategory(industryId: string, label: string): Promise<TermCategory> {
    return commands.createCategory(industryId, label)
  },

  updateCategory(industryId: string, categoryId: string, label: string): Promise<TermCategory> {
    return commands.updateCategory(industryId, categoryId, label)
  },

  deleteCategory(industryId: string, categoryId: string): Promise<void> {
    return commands.deleteCategory(industryId, categoryId)
  },

  createSubcategory(
    industryId: string,
    categoryId: string,
    label: string,
  ): Promise<TermSubcategory> {
    return commands.createSubcategory(industryId, categoryId, label)
  },

  updateSubcategory(
    industryId: string,
    categoryId: string,
    subcategoryId: string,
    label: string,
  ): Promise<TermSubcategory> {
    return commands.updateSubcategory(industryId, categoryId, subcategoryId, label)
  },

  deleteSubcategory(
    industryId: string,
    categoryId: string,
    subcategoryId: string,
  ): Promise<void> {
    return commands.deleteSubcategory(industryId, categoryId, subcategoryId)
  },

  createTerm(input: TermInput): Promise<Term> {
    return commands.createTerm(input)
  },

  updateTerm(term: Term): Promise<Term> {
    return commands.updateTerm(term)
  },

  deleteTerm(id: string): Promise<void> {
    return commands.deleteTerm(id)
  },

  setTermPinned(id: string, value: boolean): Promise<void> {
    return commands.setTermPinned(id, value)
  },
}
