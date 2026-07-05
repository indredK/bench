import { useState, useCallback, useEffect } from "react"
import {
  Copy,
  Check,
  Plus,
  Trash2,
  Globe,
  ExternalLink,
  Pin,
  Search,
  X,
  Pencil,
  Settings2,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { useTerminologyStore } from "./store"
import { UNCLASSIFIED_SUBCATEGORY_ID, isUnclassifiedSubcategoryId } from "./constants"
import type { Term, TermWebsite } from "./types"
import { useTerminologyController, toastTerminologyError } from "./hooks/useTerminologyController"
import { Button } from "@/components/ui/button"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { openExternal } from "@/platform/shell"
import { writeClipboardText } from "@/platform/clipboard"
import { FeatureLoadError } from "@/components/common/FeatureLoadError"

function copyText(text: string) {
  void writeClipboardText(text).catch(() => {})
}

// ─── Website chip ─────────────────────────────────────────────────────────────
// Globe icon by default; on hover shows Tooltip with full URL.
// Clicking icon = copy URL. Clicking URL inside Tooltip = open browser.

function WebsiteChip({ site }: { site: TermWebsite }) {
  const [copied, setCopied] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      copyText(site.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    },
    [site.url],
  )

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      openExternal(site.url)
    },
    [site.url],
  )

  // 确定显示哪个图标
  const Icon = copied ? Check : isHovered ? Copy : Globe

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-6 w-6 items-center justify-center rounded transition-colors"
            onClick={handleCopy}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <Icon size={12} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="flex max-w-64 items-center gap-1.5">
          <span className="truncate text-xs">{site.url}</span>
          <button
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={handleOpen}
          >
            <ExternalLink size={11} />
          </button>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─── Term Card ────────────────────────────────────────────────────────────────

function TermCard({
  term,
  isPinned,
  onClick,
  onTogglePinned,
}: {
  term: Term
  isPinned: boolean
  onClick: () => void
  onTogglePinned: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const actionVisibility = isPinned
    ? "opacity-100"
    : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      copyText(term.title)
      setCopied(true)
      toast.success(t("terminology.toasts.copied"))
      setTimeout(() => setCopied(false), 1500)
    },
    [t, term.title],
  )

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-all hover:shadow-md",
        isPinned ? "border-primary/45 shadow-primary/5 shadow-sm" : "hover:border-primary/35",
        "bg-card",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-foreground line-clamp-1 flex-1 text-sm leading-snug font-semibold">
          {term.title}
        </span>
        <div className={cn("flex shrink-0 items-center gap-0.5 transition-all", actionVisibility)}>
          <button
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded transition-colors",
              isPinned
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={(e) => {
              e.stopPropagation()
              onTogglePinned()
            }}
            title={t(isPinned ? "terminology.actions.unpin" : "terminology.actions.pin")}
            aria-label={t(isPinned ? "terminology.actions.unpin" : "terminology.actions.pin")}
          >
            <Pin size={12} className={isPinned ? "fill-current" : undefined} />
          </button>
          <button
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-6 w-6 items-center justify-center rounded transition-colors"
            onClick={handleCopy}
            title={t("terminology.actions.copyTitle")}
            aria-label={t("terminology.actions.copyTitle")}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      <p className="text-muted-foreground line-clamp-2 flex-1 text-xs leading-relaxed">
        {term.description}
      </p>

      {term.websites.length > 0 && (
        <div className="flex flex-wrap items-center gap-0.5">
          {term.websites.map((site, i) => (
            <WebsiteChip key={i} site={site} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Term editor dialog ───────────────────────────────────────────────────────

function TermEditor({
  term,
  isNew,
  industryId,
  categoryId,
  subcategoryId,
  onClose,
}: {
  term: Term | null
  isNew: boolean
  industryId: string
  categoryId: string
  subcategoryId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { industries, addTerm, updateTerm, deleteTerm } = useTerminologyStore()
  const currentIndustry = industries.find((industry) => industry.id === industryId)
  const currentCategory =
    currentIndustry?.categories.find((category) => category.id === categoryId) ??
    currentIndustry?.categories[0]
  const hasUnclassifiedSubcategory = currentCategory?.subcategories.some(
    (subcategory) => subcategory.id === UNCLASSIFIED_SUBCATEGORY_ID,
  )

  const [title, setTitle] = useState(term?.title ?? "")
  const [description, setDescription] = useState(term?.description ?? "")
  const initialSubcategoryId = term
    ? term.subcategoryId && term.subcategoryId.trim()
      ? term.subcategoryId
      : hasUnclassifiedSubcategory
        ? UNCLASSIFIED_SUBCATEGORY_ID
        : ""
    : subcategoryId || (hasUnclassifiedSubcategory ? UNCLASSIFIED_SUBCATEGORY_ID : "")
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState(initialSubcategoryId)
  const [websites, setWebsites] = useState<TermWebsite[]>(
    term?.websites?.length ? term.websites : [{ url: "", label: "" }],
  )
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const handleSave = useCallback(async () => {
    if (!title.trim()) return
    const cleanSites = websites.filter((w) => w.url.trim())
    const resolvedCat =
      categoryId || industries.find((i) => i.id === industryId)?.categories[0]?.id || ""
    const resolvedSubcategoryId = currentCategory?.subcategories.some(
      (subcategory) => subcategory.id === selectedSubcategoryId,
    )
      ? selectedSubcategoryId
      : hasUnclassifiedSubcategory
        ? UNCLASSIFIED_SUBCATEGORY_ID
        : ""
    try {
      if (isNew) {
        await addTerm({
          industryId,
          categoryId: resolvedCat,
          subcategoryId: resolvedSubcategoryId || null,
          title: title.trim(),
          description: description.trim(),
          websites: cleanSites,
        })
        toast.success(t("terminology.toasts.added"))
      } else if (term) {
        await updateTerm({
          ...term,
          subcategoryId: resolvedSubcategoryId || null,
          title: title.trim(),
          description: description.trim(),
          websites: cleanSites,
        })
        toast.success(t("terminology.toasts.saved"))
      }
      onClose()
    } catch (error) {
      toastTerminologyError(t, error, "terminology.toasts.saveFailed")
    }
  }, [
    title,
    description,
    websites,
    isNew,
    industryId,
    categoryId,
    selectedSubcategoryId,
    currentCategory,
    industries,
    addTerm,
    updateTerm,
    term,
    onClose,
    hasUnclassifiedSubcategory,
    t,
  ])

  const handleDelete = useCallback(async () => {
    if (!term) return
    try {
      await deleteTerm(term.id)
      toast.success(t("terminology.toasts.deleted"))
      onClose()
    } catch (error) {
      toastTerminologyError(t, error, "terminology.toasts.deleteFailed")
    }
  }, [term, deleteTerm, onClose, t])

  const setWebsite = (idx: number, field: keyof TermWebsite, val: string) =>
    setWebsites((p) => p.map((w, i) => (i === idx ? { ...w, [field]: val } : w)))

  // Ctrl/Cmd + S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        if (title.trim()) {
          void handleSave()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSave, title])

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex flex-col gap-1.5">
        <label className="text-muted-foreground text-xs font-medium">
          {t("terminology.title")}
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("terminology.termName")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-muted-foreground text-xs font-medium">
          {t("terminology.description")}
        </label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("terminology.termDescription")}
          className="resize-none text-sm"
          rows={4}
        />
      </div>

      {currentCategory?.subcategories.length ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-muted-foreground text-xs font-medium">
            {t("terminology.subcategoryLabel")}
          </label>
          <Select
            value={
              selectedSubcategoryId ||
              (hasUnclassifiedSubcategory ? UNCLASSIFIED_SUBCATEGORY_ID : "__none__")
            }
            onValueChange={(value) => setSelectedSubcategoryId(value === "__none__" ? "" : value)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue
                placeholder={t(
                  hasUnclassifiedSubcategory
                    ? "terminology.selectSubcategory"
                    : "terminology.unsetSubcategory",
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {!hasUnclassifiedSubcategory ? (
                <SelectItem value="__none__">{t("terminology.unsetSubcategory")}</SelectItem>
              ) : null}
              {currentCategory.subcategories.map((subcategory) => (
                <SelectItem key={subcategory.id} value={subcategory.id}>
                  {subcategory.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-muted-foreground text-xs font-medium">
            {t("terminology.websites")}
          </label>
          <button
            className="text-primary text-xs hover:underline"
            onClick={() => setWebsites((p) => [...p, { url: "", label: "" }])}
          >
            {t("terminology.addWebsite")}
          </button>
        </div>
        {websites.map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={w.url}
              onChange={(e) => setWebsite(i, "url", e.target.value)}
              placeholder={t("terminology.urlPlaceholder")}
              className="flex-1 text-xs"
            />
            <Input
              value={w.label ?? ""}
              onChange={(e) => setWebsite(i, "label", e.target.value)}
              placeholder={t("terminology.labelOptional")}
              className="w-28 text-xs"
            />
            <button
              className="text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => setWebsites((p) => p.filter((_, j) => j !== i))}
              aria-label={t("common.delete")}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-1 flex justify-between gap-2 border-t pt-3">
        {!isNew && (
          <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 size={13} className="mr-1" /> {t("common.delete")}
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!title.trim()}>
            {isNew ? t("common.add") : t("common.save")}
          </Button>
        </div>
      </div>

      {!isNew && term && (
        <DestructiveConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title={t("terminology.deleteTermConfirmTitle")}
          description={t("terminology.deleteTermConfirmDescription", { name: term.title })}
          consequence={t("terminology.deleteTermConsequence")}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

// ─── Industry / Category manager dialog ──────────────────────────────────────

function IndustryManager({ onClose: _onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const {
    industries,
    selectedIndustryId,
    setIndustry,
    addIndustry,
    updateIndustry,
    deleteIndustry,
    addCategory,
    updateCategory,
    deleteCategory,
    addSubcategory,
    updateSubcategory,
    deleteSubcategory,
  } = useTerminologyStore()

  const [activeId, setActiveId] = useState(selectedIndustryId || industries[0]?.id || "")
  const activeIndustry = industries.find((i) => i.id === activeId)
  const [activeCategoryId, setActiveCategoryId] = useState(activeIndustry?.categories[0]?.id ?? "")
  const activeCategory = activeIndustry?.categories.find(
    (category) => category.id === activeCategoryId,
  )

  useEffect(() => {
    if (!selectedIndustryId) return
    setActiveId(selectedIndustryId)
  }, [selectedIndustryId])

  useEffect(() => {
    if (!activeIndustry) {
      setActiveCategoryId("")
      return
    }
    if (activeIndustry.categories.some((category) => category.id === activeCategoryId)) return
    setActiveCategoryId(activeIndustry.categories[0]?.id ?? "")
  }, [activeIndustry, activeCategoryId])

  // industry edit state
  const [editingIndId, setEditingIndId] = useState<string | null>(null)
  const [editingIndLabel, setEditingIndLabel] = useState("")
  const [newIndLabel, setNewIndLabel] = useState("")

  // category edit state
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatLabel, setEditingCatLabel] = useState("")
  const [newCatLabel, setNewCatLabel] = useState("")

  const [editingSubcatId, setEditingSubcatId] = useState<string | null>(null)
  const [editingSubcatLabel, setEditingSubcatLabel] = useState("")
  const [newSubcatLabel, setNewSubcatLabel] = useState("")

  // Delete confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<{
    type: "industry" | "category" | "subcategory"
    id: string
    label: string
    parentId?: string
  } | null>(null)

  const startEditInd = (id: string, label: string) => {
    setEditingIndId(id)
    setEditingIndLabel(label)
  }
  const saveEditInd = async () => {
    if (editingIndId && editingIndLabel.trim()) {
      try {
        await updateIndustry(editingIndId, editingIndLabel.trim())
      } catch (error) {
        toastTerminologyError(t, error, "terminology.toasts.saveFailed")
      }
    }
    setEditingIndId(null)
  }
  const handleAddInd = async () => {
    if (!newIndLabel.trim()) return
    try {
      const id = await addIndustry(newIndLabel.trim())
      setNewIndLabel("")
      setActiveId(id)
      setIndustry(id)
    } catch (error) {
      toastTerminologyError(t, error, "terminology.toasts.addFailed")
    }
  }

  const startEditCat = (id: string, label: string) => {
    setEditingCatId(id)
    setEditingCatLabel(label)
  }
  const saveEditCat = async () => {
    if (editingCatId && editingCatLabel.trim()) {
      try {
        await updateCategory(activeId, editingCatId, editingCatLabel.trim())
      } catch (error) {
        toastTerminologyError(t, error, "terminology.toasts.saveFailed")
      }
    }
    setEditingCatId(null)
  }
  const handleAddCat = async () => {
    if (!newCatLabel.trim() || !activeId) return
    try {
      const categoryId = await addCategory(activeId, newCatLabel.trim())
      setNewCatLabel("")
      setActiveCategoryId(categoryId)
    } catch (error) {
      toastTerminologyError(t, error, "terminology.toasts.addFailed")
    }
  }

  const startEditSubcat = (id: string, label: string) => {
    setEditingSubcatId(id)
    setEditingSubcatLabel(label)
  }
  const saveEditSubcat = async () => {
    if (editingSubcatId && editingSubcatLabel.trim() && activeId && activeCategoryId) {
      try {
        await updateSubcategory(
          activeId,
          activeCategoryId,
          editingSubcatId,
          editingSubcatLabel.trim(),
        )
      } catch (error) {
        toastTerminologyError(t, error, "terminology.toasts.saveFailed")
      }
    }
    setEditingSubcatId(null)
  }
  const handleAddSubcat = async () => {
    if (!newSubcatLabel.trim() || !activeId || !activeCategoryId) return
    try {
      await addSubcategory(activeId, activeCategoryId, newSubcatLabel.trim())
      setNewSubcatLabel("")
    } catch (error) {
      toastTerminologyError(t, error, "terminology.toasts.addFailed")
    }
  }

  // Delete confirmation handlers
  const confirmDelete = (
    type: "industry" | "category" | "subcategory",
    id: string,
    label: string,
    parentId?: string,
  ) => {
    setItemToDelete({ type, id, label, parentId })
    setDeleteConfirmOpen(true)
  }

  const executeDelete = async () => {
    if (!itemToDelete) return
    try {
      switch (itemToDelete.type) {
        case "industry":
          await deleteIndustry(itemToDelete.id)
          if (activeId === itemToDelete.id) {
            setActiveId(industries.find((i) => i.id !== itemToDelete.id)?.id ?? "")
          }
          break
        case "category":
          if (itemToDelete.parentId) {
            await deleteCategory(itemToDelete.parentId, itemToDelete.id)
            if (activeCategoryId === itemToDelete.id) {
              setActiveCategoryId(
                activeIndustry?.categories.find((item) => item.id !== itemToDelete.id)?.id ?? "",
              )
            }
          }
          break
        case "subcategory":
          if (itemToDelete.parentId && activeCategoryId) {
            await deleteSubcategory(itemToDelete.parentId, activeCategoryId, itemToDelete.id)
          }
          break
      }
      toast.success(t("terminology.deleteSuccess"))
    } catch (error) {
      toastTerminologyError(t, error, "terminology.deleteFailed")
    } finally {
      setDeleteConfirmOpen(false)
      setItemToDelete(null)
    }
  }

  // Get delete confirmation message
  const getDeleteMessage = () => {
    if (!itemToDelete) return ""
    switch (itemToDelete.type) {
      case "industry":
        return t("terminology.deleteIndustryConfirm", { name: itemToDelete.label })
      case "category":
        return t("terminology.deleteCategoryConfirm", { name: itemToDelete.label })
      case "subcategory":
        return t("terminology.deleteSubcategoryConfirm", { name: itemToDelete.label })
      default:
        return ""
    }
  }

  return (
    <>
      <div className="grid h-full min-h-0 w-full grid-cols-[12rem_1px_12rem_1px_minmax(20rem,1fr)] gap-2 overflow-hidden">
        {/* Left: industry list */}
        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <span className="text-muted-foreground/75 text-xs font-semibold tracking-wider uppercase">
            {t("terminology.industryList")}
          </span>
          <div className="flex min-h-0 flex-1 scrollbar-thin flex-col gap-0.5 overflow-y-auto pr-1">
            {industries.map((ind) => (
              <div
                key={ind.id}
                className={cn(
                  "group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors",
                  activeId === ind.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setActiveId(ind.id)}
              >
                {editingIndId === ind.id ? (
                  <Input
                    autoFocus
                    value={editingIndLabel}
                    onChange={(e) => setEditingIndLabel(e.target.value)}
                    onBlur={saveEditInd}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEditInd()
                      if (e.key === "Escape") setEditingIndId(null)
                    }}
                    className="h-6 px-1 py-0 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="flex-1 truncate text-xs">{ind.label}</span>
                )}
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    className="hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      startEditInd(ind.id, ind.label)
                    }}
                  >
                    <Pencil size={10} />
                  </button>
                  <button
                    className="hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      confirmDelete("industry", ind.id, ind.label)
                    }}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-1 pt-0.5">
            <Input
              value={newIndLabel}
              onChange={(e) => setNewIndLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddInd()
              }}
              placeholder={t("terminology.newIndustryPlaceholder")}
              className="h-7 flex-1 text-xs"
            />
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleAddInd}>
              <Plus size={12} />
            </Button>
          </div>
        </div>

        {/* Divider */}
        <div className="bg-border w-px shrink-0" />

        {/* Right: category list */}
        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <span className="text-muted-foreground/75 text-xs font-semibold tracking-wider uppercase">
            {activeIndustry
              ? t("terminology.categoryOf", { name: activeIndustry.label })
              : t("terminology.selectIndustryFirst")}
          </span>
          {activeIndustry ? (
            <>
              <div className="flex min-h-0 flex-1 scrollbar-thin flex-col gap-0.5 overflow-y-auto pr-1">
                {activeIndustry.categories.length === 0 && (
                  <p className="text-muted-foreground py-2 text-xs">
                    {t("terminology.noCategories")}
                  </p>
                )}
                {activeIndustry.categories.map((cat) => (
                  <div
                    key={cat.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-md px-2 py-1 text-sm",
                      activeCategoryId === cat.id ? "bg-primary/10" : "hover:bg-muted",
                    )}
                    onClick={() => setActiveCategoryId(cat.id)}
                  >
                    {editingCatId === cat.id ? (
                      <Input
                        autoFocus
                        value={editingCatLabel}
                        onChange={(e) => setEditingCatLabel(e.target.value)}
                        onBlur={saveEditCat}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEditCat()
                          if (e.key === "Escape") setEditingCatId(null)
                        }}
                        className="h-6 min-w-0 flex-1 px-1 py-0 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="text-foreground min-w-0 flex-1 truncate text-xs">
                        {cat.label}
                      </span>
                    )}
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => startEditCat(cat.id, cat.label)}
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          confirmDelete("category", cat.id, cat.label, activeId)
                        }}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-1">
                <Input
                  value={newCatLabel}
                  onChange={(e) => setNewCatLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddCat()
                  }}
                  placeholder={t("terminology.newCategoryPlaceholder")}
                  className="h-7 flex-1 text-xs"
                />
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleAddCat}>
                  <Plus size={12} />
                </Button>
              </div>
            </>
          ) : null}
        </div>

        <div className="bg-border w-px shrink-0" />

        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <span className="text-muted-foreground/75 text-xs font-semibold tracking-wider uppercase">
            {activeCategory
              ? t("terminology.subcategoryOf", { name: activeCategory.label })
              : t("terminology.selectCategoryFirst")}
          </span>
          {activeCategory ? (
            <>
              <div className="flex min-h-0 flex-1 scrollbar-thin flex-col gap-0.5 overflow-y-auto pr-1">
                {activeCategory.subcategories.length === 0 && (
                  <p className="text-muted-foreground py-2 text-xs">
                    {t("terminology.noSubcategories")}
                  </p>
                )}
                {activeCategory.subcategories.map((subcategory) => {
                  const isReserved = isUnclassifiedSubcategoryId(subcategory.id)
                  return (
                    <div
                      key={subcategory.id}
                      className={cn(
                        "group flex items-center gap-1 rounded-md px-2 py-1 text-sm",
                        isReserved ? "bg-muted/40" : "hover:bg-muted",
                      )}
                    >
                      {editingSubcatId === subcategory.id ? (
                        <Input
                          autoFocus
                          value={editingSubcatLabel}
                          onChange={(e) => setEditingSubcatLabel(e.target.value)}
                          onBlur={saveEditSubcat}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveEditSubcat()
                            if (e.key === "Escape") setEditingSubcatId(null)
                          }}
                          className="h-6 min-w-0 flex-1 px-1 py-0 text-xs"
                        />
                      ) : (
                        <span className="text-foreground min-w-0 flex-1 truncate text-xs">
                          {subcategory.label}
                        </span>
                      )}
                      {!isReserved && (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <button
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => startEditSubcat(subcategory.id, subcategory.label)}
                          >
                            <Pencil size={10} />
                          </button>
                          <button
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              confirmDelete(
                                "subcategory",
                                subcategory.id,
                                subcategory.label,
                                activeCategoryId,
                              )
                            }}
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-1 pt-0.5">
                <Input
                  value={newSubcatLabel}
                  onChange={(e) => setNewSubcatLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAddSubcat()
                  }}
                  placeholder={t("terminology.newSubcategoryPlaceholder")}
                  className="h-7 flex-1 text-xs"
                />
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleAddSubcat}>
                  <Plus size={12} />
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("terminology.confirmDelete")}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground text-sm">{getDeleteMessage()}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" size="sm" onClick={executeDelete}>
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TerminologyPage() {
  const { t } = useTranslation()
  const {
    industries,
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
  } = useTerminologyController()

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {t("common.loading")}
      </div>
    )
  }

  if (loadError) {
    return (
      <FeatureLoadError
        title={t("terminology.loadFailedTitle")}
        description={t(loadError)}
        onRetry={() => void hydrate().catch(() => undefined)}
      />
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: industry list ── */}
      <aside className="bg-sidebar flex w-40 shrink-0 flex-col border-r">
        {/* header */}
        <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
          <span className="text-muted-foreground/70 text-[11px] font-semibold tracking-widest uppercase">
            {t("terminology.industryList")}
          </span>
          <button
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-0.5 transition-colors"
            title={t("terminology.manageIndustries")}
            aria-label={t("terminology.manageIndustries")}
            onClick={() => setManagerOpen(true)}
          >
            <Settings2 size={13} />
          </button>
        </div>

        {/* scrollable nav */}
        <nav className="min-h-0 flex-1 scrollbar-thin overflow-y-auto px-2 pb-4">
          <div className="flex flex-col gap-0.5">
            {industries.map((industry) => {
              const active = selectedIndustryId === industry.id
              return (
                <button
                  key={industry.id}
                  className={cn(
                    "relative w-full truncate rounded-lg px-3 py-2 text-left text-[13px] transition-all",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                  onClick={() => setIndustry(industry.id)}
                >
                  {active && (
                    <span className="bg-primary absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full" />
                  )}
                  {industry.label}
                </button>
              )
            })}
          </div>
        </nav>
      </aside>

      {/* ── Right: filter + cards ── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top toolbar */}
        <div className="grid gap-3 border-b px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,20vw)] lg:items-start">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition-colors",
                  !selectedCategoryId
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setCategory("")}
              >
                {t("terminology.all")}
              </button>
              {currentIndustry?.categories.map((cat) => (
                <button
                  key={cat.id}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs transition-colors",
                    selectedCategoryId === cat.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {currentCategory?.subcategories.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs transition-colors",
                    !selectedSubcategoryId
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setSubcategory("")}
                >
                  {t("terminology.allSubcategories")}
                </button>
                {currentCategory.subcategories.map((subcategory) => (
                  <button
                    key={subcategory.id}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs transition-colors",
                      selectedSubcategoryId === subcategory.id
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setSubcategory(subcategory.id)}
                  >
                    {subcategory.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-[22rem] lg:justify-self-end">
            <div className="relative min-w-0 flex-1">
              <Search
                size={13}
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("terminology.searchPlaceholder")}
                className="h-8 w-full pl-7 text-xs"
              />
              {searchQuery && (
                <button
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                  onClick={() => setSearch("")}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <Button
              size="sm"
              variant="outline"
              className="h-8 w-full shrink-0 gap-1 sm:w-auto"
              onClick={openNew}
            >
              <Plus size={13} /> {t("terminology.add")}
            </Button>
          </div>
        </div>

        {/* Cards grid */}
        <div className="flex-1 scrollbar-thin overflow-y-auto p-4">
          {terms.length === 0 ? (
            <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
              {t("terminology.noTerms")}
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
            >
              {terms.map((term) => (
                <TermCard
                  key={term.id}
                  term={term}
                  isPinned={pinnedTermIdSet.has(term.id)}
                  onClick={() => openEdit(term)}
                  onTogglePinned={() =>
                    void handleTogglePinned(term.id, !pinnedTermIdSet.has(term.id))
                  }
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Term editor dialog ── */}
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent className="max-w-md overflow-y-auto" style={{ maxHeight: "90vh" }}>
          <DialogHeader>
            <DialogTitle>
              {t(drawerIsNew ? "terminology.addTerm" : "terminology.editTerm")}
            </DialogTitle>
          </DialogHeader>
          <TermEditor
            term={drawerTerm}
            isNew={drawerIsNew}
            industryId={selectedIndustryId}
            categoryId={selectedCategoryId}
            subcategoryId={selectedSubcategoryId}
            onClose={closeDrawer}
          />
        </DialogContent>
      </Dialog>

      {/* ── Industry / Category manager dialog ── */}
      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent
          size="xl"
          className="grid h-[min(82vh,46rem)] w-[min(96vw,96rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-4"
        >
          <DialogHeader>
            <DialogTitle>{t("terminology.manageIndustries")}</DialogTitle>
          </DialogHeader>
          <IndustryManager onClose={() => setManagerOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
