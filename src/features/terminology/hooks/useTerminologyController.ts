/**
 * Controller / 控制器: bind terminology page state; 连接术语页状态与 IPC 编排.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useTerminologyStore } from "../store"
import type { Term } from "../types"

export function getTauriErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === "string" ? code : null
}

export function toastTerminologyError(
  t: (key: string, opts?: Record<string, unknown>) => string,
  error: unknown,
  fallbackKey: string,
) {
  const code = getTauriErrorCode(error)
  const key =
    code === "DUPLICATE_NAME"
      ? "terminology.toasts.duplicateName"
      : code === "INVALID_INPUT"
        ? "terminology.toasts.invalidInput"
        : code === "NOT_FOUND"
          ? "terminology.toasts.targetNotFound"
          : fallbackKey
  toast.error(t(key))
}

export function useTerminologyController() {
  const { t } = useTranslation()

  const industries = useTerminologyStore((s) => s.industries)
  const pinnedTermIds = useTerminologyStore((s) => s.pinnedTermIds)
  const selectedIndustryId = useTerminologyStore((s) => s.selectedIndustryId)
  const selectedCategoryId = useTerminologyStore((s) => s.selectedCategoryId)
  const selectedSubcategoryId = useTerminologyStore((s) => s.selectedSubcategoryId)
  const searchQuery = useTerminologyStore((s) => s.searchQuery)
  const isLoading = useTerminologyStore((s) => s.isLoading)
  const loadError = useTerminologyStore((s) => s.loadError)

  const hydrate = useTerminologyStore((s) => s.hydrate)
  const setIndustry = useTerminologyStore((s) => s.setIndustry)
  const setCategory = useTerminologyStore((s) => s.setCategory)
  const setSubcategory = useTerminologyStore((s) => s.setSubcategory)
  const setSearch = useTerminologyStore((s) => s.setSearch)
  const setTermPinned = useTerminologyStore((s) => s.setTermPinned)
  const filteredTerms = useTerminologyStore((s) => s.filteredTerms)

  const [drawerTerm, setDrawerTerm] = useState<Term | null>(null)
  const [drawerIsNew, setDrawerIsNew] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)

  const terms = filteredTerms()

  const currentIndustry = useMemo(
    () => industries.find((i) => i.id === selectedIndustryId),
    [industries, selectedIndustryId],
  )
  const currentCategory = useMemo(
    () => currentIndustry?.categories.find((category) => category.id === selectedCategoryId),
    [currentIndustry, selectedCategoryId],
  )
  const pinnedTermIdSet = useMemo(() => new Set(pinnedTermIds), [pinnedTermIds])

  useEffect(() => {
    void hydrate().catch(() => {
      return
    })
  }, [hydrate, t])

  const openNew = useCallback(() => {
    setDrawerTerm(null)
    setDrawerIsNew(true)
    setDrawerOpen(true)
  }, [])

  const openEdit = useCallback((term: Term) => {
    setDrawerTerm(term)
    setDrawerIsNew(false)
    setDrawerOpen(true)
  }, [])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const handleTogglePinned = useCallback(
    async (termId: string, nextValue: boolean) => {
      try {
        await setTermPinned(termId, nextValue)
      } catch (error) {
        toastTerminologyError(t, error, "terminology.toasts.pinFailed")
      }
    },
    [setTermPinned, t],
  )

  return {
    industries,
    pinnedTermIds,
    selectedIndustryId,
    selectedCategoryId,
    selectedSubcategoryId,
    searchQuery,
    isLoading,
    loadError,
    hydrate,
    setIndustry,
    setCategory,
    setSubcategory,
    setSearch,
    setTermPinned,
    terms,
    currentIndustry,
    currentCategory,
    pinnedTermIdSet,
    drawerTerm,
    drawerIsNew,
    drawerOpen,
    managerOpen,
    setDrawerOpen,
    setManagerOpen,
    openNew,
    openEdit,
    closeDrawer,
    handleTogglePinned,
  }
}

export type TerminologyController = ReturnType<typeof useTerminologyController>
