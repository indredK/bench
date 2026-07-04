/**
 * IPC Types / 通信类型: terminology domain payloads.
 */
export interface TermWebsite {
  url: string
  label?: string | null
}

export interface TermCategory {
  id: string
  label: string
  subcategories: TermSubcategory[]
}

export interface TermSubcategory {
  id: string
  label: string
}

export interface Industry {
  id: string
  label: string
  categories: TermCategory[]
}

export interface Term {
  id: string
  industryId: string
  categoryId: string
  subcategoryId?: string | null
  title: string
  description: string
  websites: TermWebsite[]
}

export interface TermInput {
  industryId: string
  categoryId: string
  subcategoryId?: string | null
  title: string
  description: string
  websites: TermWebsite[]
}

export interface TerminologyBundle {
  industries: Industry[]
  terms: Term[]
  pinnedTermIds: string[]
}
