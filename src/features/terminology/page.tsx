import { useState, useCallback, useMemo, useEffect } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { useTerminologyStore } from "./store";
import {
  UNCLASSIFIED_SUBCATEGORY_ID,
  isUnclassifiedSubcategoryId,
} from "./constants";
import type { Term, TermWebsite } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { openExternal } from "@/platform/shell";
import { FeatureLoadError } from "@/components/common/FeatureLoadError";

function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function getTauriErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function toastTerminologyError(
  t: (key: string, opts?: Record<string, unknown>) => string,
  error: unknown,
  fallbackKey: string
) {
  const code = getTauriErrorCode(error);
  const key =
    code === "DUPLICATE_NAME"
      ? "terminology.toasts.duplicateName"
      : code === "INVALID_INPUT"
        ? "terminology.toasts.invalidInput"
        : code === "NOT_FOUND"
          ? "terminology.toasts.targetNotFound"
          : fallbackKey;
  toast.error(t(key));
}

// ─── Website chip ─────────────────────────────────────────────────────────────
// Globe icon by default; on hover shows Tooltip with full URL.
// Clicking icon = copy URL. Clicking URL inside Tooltip = open browser.

function WebsiteChip({ site }: { site: TermWebsite }) {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      copyText(site.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    [site.url]
  );

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openExternal(site.url);
    },
    [site.url]
  );

  // 确定显示哪个图标
  const Icon = copied ? Check : isHovered ? Copy : Globe;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={handleCopy}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <Icon size={12} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="flex items-center gap-1.5 max-w-64">
          <span className="truncate text-xs">{site.url}</span>
          <button
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleOpen}
          >
            <ExternalLink size={11} />
          </button>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Term Card ────────────────────────────────────────────────────────────────

function TermCard({
  term,
  isPinned,
  onClick,
  onTogglePinned,
}: {
  term: Term;
  isPinned: boolean;
  onClick: () => void;
  onTogglePinned: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const actionVisibility = isPinned
    ? "opacity-100"
    : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100";

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      copyText(term.title);
      setCopied(true);
      toast.success(t("terminology.toasts.copied"));
      setTimeout(() => setCopied(false), 1500);
    },
    [t, term.title]
  );

  return (
    <div
      className={`group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-all hover:shadow-md ${
        isPinned ? "border-primary/45 shadow-sm shadow-primary/5" : "hover:border-primary/35"
      } bg-card`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-sm text-foreground leading-snug line-clamp-1 flex-1">
          {term.title}
        </span>
        <div className={`flex shrink-0 items-center gap-0.5 transition-all ${actionVisibility}`}>
          <button
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
              isPinned
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePinned();
            }}
            title={t(isPinned ? "terminology.actions.unpin" : "terminology.actions.pin")}
            aria-label={t(isPinned ? "terminology.actions.unpin" : "terminology.actions.pin")}
          >
            <Pin size={12} className={isPinned ? "fill-current" : undefined} />
          </button>
          <button
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={handleCopy}
            title={t("terminology.actions.copyTitle")}
            aria-label={t("terminology.actions.copyTitle")}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 flex-1">
        {term.description}
      </p>

      {term.websites.length > 0 && (
        <div className="flex items-center gap-0.5 flex-wrap">
          {term.websites.map((site, i) => (
            <WebsiteChip key={i} site={site} />
          ))}
        </div>
      )}
    </div>
  );
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
  term: Term | null;
  isNew: boolean;
  industryId: string;
  categoryId: string;
  subcategoryId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { industries, addTerm, updateTerm, deleteTerm } = useTerminologyStore();
  const currentIndustry = industries.find((industry) => industry.id === industryId);
  const currentCategory =
    currentIndustry?.categories.find((category) => category.id === categoryId) ??
    currentIndustry?.categories[0];
  const hasUnclassifiedSubcategory = currentCategory?.subcategories.some(
    (subcategory) => subcategory.id === UNCLASSIFIED_SUBCATEGORY_ID
  );

  const [title, setTitle] = useState(term?.title ?? "");
  const [description, setDescription] = useState(term?.description ?? "");
  const initialSubcategoryId = term
    ? term.subcategoryId && term.subcategoryId.trim()
      ? term.subcategoryId
      : hasUnclassifiedSubcategory
        ? UNCLASSIFIED_SUBCATEGORY_ID
        : ""
    : subcategoryId || (hasUnclassifiedSubcategory ? UNCLASSIFIED_SUBCATEGORY_ID : "");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState(
    initialSubcategoryId
  );
  const [websites, setWebsites] = useState<TermWebsite[]>(
    term?.websites?.length ? term.websites : [{ url: "", label: "" }]
  );

  const handleSave = useCallback(async () => {
    if (!title.trim()) return;
    const cleanSites = websites.filter((w) => w.url.trim());
    const resolvedCat =
      categoryId ||
      industries.find((i) => i.id === industryId)?.categories[0]?.id ||
      "";
    const resolvedSubcategoryId = currentCategory?.subcategories.some(
      (subcategory) => subcategory.id === selectedSubcategoryId
    )
      ? selectedSubcategoryId
      : hasUnclassifiedSubcategory
        ? UNCLASSIFIED_SUBCATEGORY_ID
        : "";
    try {
      if (isNew) {
        await addTerm({
          industryId,
          categoryId: resolvedCat,
          subcategoryId: resolvedSubcategoryId || null,
          title: title.trim(),
          description: description.trim(),
          websites: cleanSites,
        });
        toast.success(t("terminology.toasts.added"));
      } else if (term) {
        await updateTerm({
          ...term,
          subcategoryId: resolvedSubcategoryId || null,
          title: title.trim(),
          description: description.trim(),
          websites: cleanSites,
        });
        toast.success(t("terminology.toasts.saved"));
      }
      onClose();
    } catch (error) {
      toastTerminologyError(t, error, "terminology.toasts.saveFailed");
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
  ]);

  const handleDelete = useCallback(async () => {
    if (!term) return;
    try {
      await deleteTerm(term.id);
      toast.success(t("terminology.toasts.deleted"));
      onClose();
    } catch (error) {
      toastTerminologyError(t, error, "terminology.toasts.deleteFailed");
    }
  }, [term, deleteTerm, onClose, t]);

  const setWebsite = (idx: number, field: keyof TermWebsite, val: string) =>
    setWebsites((p) => p.map((w, i) => (i === idx ? { ...w, [field]: val } : w)));

  // Ctrl/Cmd + S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (title.trim()) {
          void handleSave();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, title]);

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">{t("terminology.title")}</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("terminology.termName")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">{t("terminology.description")}</label>
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
          <label className="text-xs font-medium text-muted-foreground">{t("terminology.subcategoryLabel")}</label>
          <Select
            value={
              selectedSubcategoryId || (hasUnclassifiedSubcategory ? UNCLASSIFIED_SUBCATEGORY_ID : "__none__")
            }
            onValueChange={(value) => setSelectedSubcategoryId(value === "__none__" ? "" : value)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue
                placeholder={t(
                  hasUnclassifiedSubcategory
                    ? "terminology.selectSubcategory"
                    : "terminology.unsetSubcategory"
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
          <label className="text-xs font-medium text-muted-foreground">{t("terminology.websites")}</label>
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => setWebsites((p) => [...p, { url: "", label: "" }])}
          >
            {t("terminology.addWebsite")}
          </button>
        </div>
        {websites.map((w, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input value={w.url} onChange={(e) => setWebsite(i, "url", e.target.value)} placeholder={t("terminology.urlPlaceholder")} className="text-xs flex-1" />
            <Input value={w.label ?? ""} onChange={(e) => setWebsite(i, "label", e.target.value)} placeholder={t("terminology.labelOptional")} className="text-xs w-28" />
            <button
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => setWebsites((p) => p.filter((_, j) => j !== i))}
              aria-label={t("common.delete")}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-between gap-2 pt-3 border-t mt-1">
        {!isNew && (
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 size={13} className="mr-1" /> {t("common.delete")}
          </Button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={onClose}>{t("common.cancel")}</Button>
          <Button size="sm" onClick={handleSave} disabled={!title.trim()}>
            {isNew ? t("common.add") : t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Industry / Category manager dialog ──────────────────────────────────────

function IndustryManager({ onClose: _onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
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
  } = useTerminologyStore();

  const [activeId, setActiveId] = useState(selectedIndustryId || industries[0]?.id || "");
  const activeIndustry = industries.find((i) => i.id === activeId);
  const [activeCategoryId, setActiveCategoryId] = useState(
    activeIndustry?.categories[0]?.id ?? ""
  );
  const activeCategory = activeIndustry?.categories.find((category) => category.id === activeCategoryId);

  useEffect(() => {
    if (!selectedIndustryId) return;
    setActiveId(selectedIndustryId);
  }, [selectedIndustryId]);

  useEffect(() => {
    if (!activeIndustry) {
      setActiveCategoryId("");
      return;
    }
    if (activeIndustry.categories.some((category) => category.id === activeCategoryId)) return;
    setActiveCategoryId(activeIndustry.categories[0]?.id ?? "");
  }, [activeIndustry, activeCategoryId]);

  // industry edit state
  const [editingIndId, setEditingIndId] = useState<string | null>(null);
  const [editingIndLabel, setEditingIndLabel] = useState("");
  const [newIndLabel, setNewIndLabel] = useState("");

  // category edit state
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatLabel, setEditingCatLabel] = useState("");
  const [newCatLabel, setNewCatLabel] = useState("");

  const [editingSubcatId, setEditingSubcatId] = useState<string | null>(null);
  const [editingSubcatLabel, setEditingSubcatLabel] = useState("");
  const [newSubcatLabel, setNewSubcatLabel] = useState("");

  // Delete confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{
    type: "industry" | "category" | "subcategory";
    id: string;
    label: string;
    parentId?: string;
  } | null>(null);

  const startEditInd = (id: string, label: string) => { setEditingIndId(id); setEditingIndLabel(label); };
  const saveEditInd = async () => {
    if (editingIndId && editingIndLabel.trim()) {
      try {
        await updateIndustry(editingIndId, editingIndLabel.trim());
      } catch (error) {
        toastTerminologyError(t, error, "terminology.toasts.saveFailed");
      }
    }
    setEditingIndId(null);
  };
  const handleAddInd = async () => {
    if (!newIndLabel.trim()) return;
    try {
      const id = await addIndustry(newIndLabel.trim());
      setNewIndLabel("");
      setActiveId(id);
      setIndustry(id);
    } catch (error) {
      toastTerminologyError(t, error, "terminology.toasts.addFailed");
    }
  };

  const startEditCat = (id: string, label: string) => { setEditingCatId(id); setEditingCatLabel(label); };
  const saveEditCat = async () => {
    if (editingCatId && editingCatLabel.trim()) {
      try {
        await updateCategory(activeId, editingCatId, editingCatLabel.trim());
      } catch (error) {
        toastTerminologyError(t, error, "terminology.toasts.saveFailed");
      }
    }
    setEditingCatId(null);
  };
  const handleAddCat = async () => {
    if (!newCatLabel.trim() || !activeId) return;
    try {
      const categoryId = await addCategory(activeId, newCatLabel.trim());
      setNewCatLabel("");
      setActiveCategoryId(categoryId);
    } catch (error) {
      toastTerminologyError(t, error, "terminology.toasts.addFailed");
    }
  };

  const startEditSubcat = (id: string, label: string) => {
    setEditingSubcatId(id);
    setEditingSubcatLabel(label);
  };
  const saveEditSubcat = async () => {
    if (editingSubcatId && editingSubcatLabel.trim() && activeId && activeCategoryId) {
      try {
        await updateSubcategory(
          activeId,
          activeCategoryId,
          editingSubcatId,
          editingSubcatLabel.trim()
        );
      } catch (error) {
        toastTerminologyError(t, error, "terminology.toasts.saveFailed");
      }
    }
    setEditingSubcatId(null);
  };
  const handleAddSubcat = async () => {
    if (!newSubcatLabel.trim() || !activeId || !activeCategoryId) return;
    try {
      await addSubcategory(activeId, activeCategoryId, newSubcatLabel.trim());
      setNewSubcatLabel("");
    } catch (error) {
      toastTerminologyError(t, error, "terminology.toasts.addFailed");
    }
  };

  // Delete confirmation handlers
  const confirmDelete = (type: "industry" | "category" | "subcategory", id: string, label: string, parentId?: string) => {
    setItemToDelete({ type, id, label, parentId });
    setDeleteConfirmOpen(true);
  };

  const executeDelete = async () => {
    if (!itemToDelete) return;
    try {
      switch (itemToDelete.type) {
        case "industry":
          await deleteIndustry(itemToDelete.id);
          if (activeId === itemToDelete.id) {
            setActiveId(industries.find((i) => i.id !== itemToDelete.id)?.id ?? "");
          }
          break;
        case "category":
          if (itemToDelete.parentId) {
            await deleteCategory(itemToDelete.parentId, itemToDelete.id);
            if (activeCategoryId === itemToDelete.id) {
              setActiveCategoryId(
                activeIndustry?.categories.find((item) => item.id !== itemToDelete.id)?.id ?? ""
              );
            }
          }
          break;
        case "subcategory":
          if (itemToDelete.parentId && activeCategoryId) {
            await deleteSubcategory(itemToDelete.parentId, activeCategoryId, itemToDelete.id);
          }
          break;
      }
      toast.success(t("terminology.deleteSuccess"));
    } catch (error) {
      toastTerminologyError(t, error, "terminology.deleteFailed");
    } finally {
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    }
  };

  // Get delete confirmation message
  const getDeleteMessage = () => {
    if (!itemToDelete) return "";
    switch (itemToDelete.type) {
      case "industry":
        return t("terminology.deleteIndustryConfirm", { name: itemToDelete.label });
      case "category":
        return t("terminology.deleteCategoryConfirm", { name: itemToDelete.label });
      case "subcategory":
        return t("terminology.deleteSubcategoryConfirm", { name: itemToDelete.label });
      default:
        return "";
    }
  };

  return (
    <>
      <div className="grid h-full min-h-0 w-full grid-cols-[12rem_1px_12rem_1px_minmax(20rem,1fr)] gap-2 overflow-hidden">
      {/* Left: industry list */}
      <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground/75 uppercase tracking-wider">
            {t("terminology.industryList")}
          </span>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin pr-1">
          {industries.map((ind) => (
            <div
              key={ind.id}
              className={`group flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer transition-colors text-sm ${
                activeId === ind.id ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveId(ind.id)}
            >
              {editingIndId === ind.id ? (
                <Input
                  autoFocus
                  value={editingIndLabel}
                  onChange={(e) => setEditingIndLabel(e.target.value)}
                  onBlur={saveEditInd}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEditInd(); if (e.key === "Escape") setEditingIndId(null); }}
                  className="h-6 text-xs px-1 py-0"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 text-xs truncate">{ind.label}</span>
              )}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                <button
                  className="hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); startEditInd(ind.id, ind.label); }}
                >
                  <Pencil size={10} />
                </button>
                <button
                  className="hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmDelete("industry", ind.id, ind.label);
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
            onKeyDown={(e) => { if (e.key === "Enter") handleAddInd(); }}
            placeholder={t("terminology.newIndustryPlaceholder")}
            className="h-7 flex-1 text-xs"
          />
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleAddInd}>
            <Plus size={12} />
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-border shrink-0" />

      {/* Right: category list */}
      <div className="flex min-h-0 min-w-0 flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground/75 uppercase tracking-wider">
          {activeIndustry ? t("terminology.categoryOf", { name: activeIndustry.label }) : t("terminology.selectIndustryFirst")}
        </span>
        {activeIndustry ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin pr-1">
              {activeIndustry.categories.length === 0 && (
                <p className="py-2 text-xs text-muted-foreground">{t("terminology.noCategories")}</p>
              )}
              {activeIndustry.categories.map((cat) => (
                <div
                  key={cat.id}
                  className={`group flex items-center gap-1 rounded-md px-2 py-1 text-sm ${
                    activeCategoryId === cat.id ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                  onClick={() => setActiveCategoryId(cat.id)}
                >
                  {editingCatId === cat.id ? (
                    <Input
                      autoFocus
                      value={editingCatLabel}
                      onChange={(e) => setEditingCatLabel(e.target.value)}
                      onBlur={saveEditCat}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEditCat(); if (e.key === "Escape") setEditingCatId(null); }}
                      className="h-6 text-xs px-1 py-0 flex-1 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 min-w-0 truncate text-xs text-foreground">{cat.label}</span>
                  )}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => startEditCat(cat.id, cat.label)}
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        confirmDelete("category", cat.id, cat.label, activeId);
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
                onKeyDown={(e) => { if (e.key === "Enter") handleAddCat(); }}
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

      <div className="w-px bg-border shrink-0" />

      <div className="flex min-h-0 min-w-0 flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground/75 uppercase tracking-wider">
          {activeCategory ? t("terminology.subcategoryOf", { name: activeCategory.label }) : t("terminology.selectCategoryFirst")}
        </span>
        {activeCategory ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin pr-1">
              {activeCategory.subcategories.length === 0 && (
                <p className="py-2 text-xs text-muted-foreground">{t("terminology.noSubcategories")}</p>
              )}
              {activeCategory.subcategories.map((subcategory) => {
                const isReserved = isUnclassifiedSubcategoryId(subcategory.id);
                return (
                  <div
                    key={subcategory.id}
                    className={`group flex items-center gap-1 rounded-md px-2 py-1 text-sm ${
                      isReserved ? "bg-muted/40" : "hover:bg-muted"
                    }`}
                  >
                    {editingSubcatId === subcategory.id ? (
                      <Input
                        autoFocus
                        value={editingSubcatLabel}
                        onChange={(e) => setEditingSubcatLabel(e.target.value)}
                        onBlur={saveEditSubcat}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveEditSubcat();
                          if (e.key === "Escape") setEditingSubcatId(null);
                        }}
                        className="h-6 flex-1 min-w-0 px-1 py-0 text-xs"
                      />
                    ) : (
                      <span className="flex-1 min-w-0 truncate text-xs text-foreground">
                        {subcategory.label}
                      </span>
                    )}
                    {!isReserved && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => startEditSubcat(subcategory.id, subcategory.label)}
                        >
                          <Pencil size={10} />
                        </button>
                        <button
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            confirmDelete("subcategory", subcategory.id, subcategory.label, activeCategoryId);
                          }}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1 pt-0.5">
              <Input
                value={newSubcatLabel}
                onChange={(e) => setNewSubcatLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddSubcat();
                }}
                placeholder={t("terminology.newSubcategoryPlaceholder")}
                className="h-7 flex-1 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={handleAddSubcat}
              >
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
          <p className="text-sm text-muted-foreground">{getDeleteMessage()}</p>
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
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TerminologyPage() {
  const { t } = useTranslation();
  const {
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
    filteredTerms,
  } = useTerminologyStore();

  const [drawerTerm, setDrawerTerm] = useState<Term | null>(null);
  const [drawerIsNew, setDrawerIsNew] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);

  const terms = filteredTerms();

  const currentIndustry = useMemo(
    () => industries.find((i) => i.id === selectedIndustryId),
    [industries, selectedIndustryId]
  );
  const currentCategory = useMemo(
    () => currentIndustry?.categories.find((category) => category.id === selectedCategoryId),
    [currentIndustry, selectedCategoryId]
  );
  const pinnedTermIdSet = useMemo(() => new Set(pinnedTermIds), [pinnedTermIds]);

  useEffect(() => {
    void hydrate().catch(() => {
      return;
    });
  }, [hydrate, t]);

  const openNew = useCallback(() => { setDrawerTerm(null); setDrawerIsNew(true); setDrawerOpen(true); }, []);
  const openEdit = useCallback((term: Term) => { setDrawerTerm(term); setDrawerIsNew(false); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const handleTogglePinned = useCallback(
    async (termId: string, nextValue: boolean) => {
      try {
        await setTermPinned(termId, nextValue);
      } catch (error) {
        toastTerminologyError(t, error, "terminology.toasts.pinFailed");
      }
    },
    [setTermPinned, t]
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (loadError) {
    return (
      <FeatureLoadError
        title={t("terminology.loadFailedTitle")}
        description={loadError}
        onRetry={() => void hydrate().catch(() => undefined)}
      />
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: industry list ── */}
      <aside className="w-40 shrink-0 border-r flex flex-col bg-sidebar">
        {/* header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
            {t("terminology.industryList")}
          </span>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors rounded p-0.5 hover:bg-muted"
            title={t("terminology.manageIndustries")}
            aria-label={t("terminology.manageIndustries")}
            onClick={() => setManagerOpen(true)}
          >
            <Settings2 size={13} />
          </button>
        </div>

        {/* scrollable nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-4 scrollbar-thin">
          <div className="flex flex-col gap-0.5">
            {industries.map((industry) => {
              const active = selectedIndustryId === industry.id;
              return (
                <button
                  key={industry.id}
                  className={`relative w-full text-left px-3 py-2 rounded-lg text-[13px] transition-all truncate ${
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                  onClick={() => setIndustry(industry.id)}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-primary" />
                  )}
                  {industry.label}
                </button>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* ── Right: filter + cards ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top toolbar */}
        <div className="grid gap-3 border-b px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,20vw)] lg:items-start">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                  !selectedCategoryId
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setCategory("")}
              >
                {t("terminology.all")}
              </button>
              {currentIndustry?.categories.map((cat) => (
                <button
                  key={cat.id}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                    selectedCategoryId === cat.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {currentCategory?.subcategories.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                    !selectedSubcategoryId
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setSubcategory("")}
                >
                  {t("terminology.allSubcategories")}
                </button>
                {currentCategory.subcategories.map((subcategory) => (
                  <button
                    key={subcategory.id}
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                      selectedSubcategoryId === subcategory.id
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
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
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("terminology.searchPlaceholder")}
                className="h-8 w-full pl-7 text-xs"
              />
              {searchQuery && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearch("")}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1 sm:w-auto w-full" onClick={openNew}>
              <Plus size={13} /> {t("terminology.add")}
            </Button>
          </div>
        </div>

        {/* Cards grid */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          {terms.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              {t("terminology.noTerms")}
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {terms.map((term) => (
                <TermCard
                  key={term.id}
                  term={term}
                  isPinned={pinnedTermIdSet.has(term.id)}
                  onClick={() => openEdit(term)}
                  onTogglePinned={() => void handleTogglePinned(term.id, !pinnedTermIdSet.has(term.id))}
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
            <DialogTitle>{t(drawerIsNew ? "terminology.addTerm" : "terminology.editTerm")}</DialogTitle>
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
  );
}
