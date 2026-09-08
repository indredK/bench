export const FRONTEND_INDUSTRY_ID = "computer"
export const FRONTEND_CATEGORY_ID = "frontend"
export const UNCLASSIFIED_SUBCATEGORY_ID = "__unclassified__"

export function isUnclassifiedSubcategoryId(id: string | null | undefined): boolean {
  return id == null || id === "" || id === UNCLASSIFIED_SUBCATEGORY_ID
}

export function toUnclassifiedSubcategoryId(id: string | null | undefined): string {
  return id ?? UNCLASSIFIED_SUBCATEGORY_ID
}
