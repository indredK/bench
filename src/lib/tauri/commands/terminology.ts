/**
 * IPC Commands / 通信命令: terminology data bridge.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"
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

export function listTerminologyData(): Promise<TerminologyBundle> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.listTerminologyData)
}

export function createIndustry(label: string): Promise<Industry> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.createIndustry, { label })
}

export function updateIndustry(id: string, label: string): Promise<Industry> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.updateIndustry, { id, label })
}

export function deleteIndustry(id: string): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.deleteIndustry, { id })
}

export function createCategory(industryId: string, label: string): Promise<TermCategory> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.createCategory, { industryId, label })
}

export function updateCategory(
  industryId: string,
  categoryId: string,
  label: string,
): Promise<TermCategory> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.updateCategory, {
    industryId,
    categoryId,
    label,
  })
}

export function deleteCategory(industryId: string, categoryId: string): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.deleteCategory, {
    industryId,
    categoryId,
  })
}

export function createSubcategory(
  industryId: string,
  categoryId: string,
  label: string,
): Promise<TermSubcategory> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.createSubcategory, {
    industryId,
    categoryId,
    label,
  })
}

export function updateSubcategory(
  industryId: string,
  categoryId: string,
  subcategoryId: string,
  label: string,
): Promise<TermSubcategory> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.updateSubcategory, {
    industryId,
    categoryId,
    subcategoryId,
    label,
  })
}

export function deleteSubcategory(
  industryId: string,
  categoryId: string,
  subcategoryId: string,
): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.deleteSubcategory, {
    industryId,
    categoryId,
    subcategoryId,
  })
}

export function createTerm(input: TermInput): Promise<Term> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.createTerm, input)
}

export function updateTerm(term: Term): Promise<Term> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.updateTerm, { term })
}

export function deleteTerm(id: string): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.deleteTerm, { id })
}

export function setTermPinned(id: string, value: boolean): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.terminology.setTermPinned, { id, value })
}
