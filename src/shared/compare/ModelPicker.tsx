/**
 * Shared Compare / 共享对比: own generic compare tools; 只负责通用对比能力.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ModelPickerProps<T extends { id: string; model: string }> {
  models: T[];
  selectedIds: string[];
  onToggleModel: (id: string) => void;
  onClearSelected: () => void;
  hasActiveFilters: boolean;
  resultCount: number;
  filteredCountKey: string;
  i18nPrefix?: string;
  uid?: string;
  selectModelsTitleKey?: string;
  clearSelectedKey: string;
}

function ModelPicker<T extends { id: string; model: string }>({
  models,
  selectedIds,
  onToggleModel,
  onClearSelected,
  hasActiveFilters,
  resultCount,
  filteredCountKey,
  i18nPrefix,
  uid,
  selectModelsTitleKey,
  clearSelectedKey,
}: ModelPickerProps<T>) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Collapsible
      open={!collapsed}
      onOpenChange={(open) => setCollapsed(!open)}
    >
      <CollapsibleTrigger className="flex items-center justify-between w-full cursor-pointer select-none group">
        <div className="flex items-center gap-2 px-4 py-2.5 flex-1 min-w-0">
          <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
            {t(selectModelsTitleKey ?? `${i18nPrefix ?? "hardwareCompare"}.selectModels`)}
          </span>
          {hasActiveFilters && (
            <span className="text-xs text-muted-foreground font-normal tabular-nums">
              {t(filteredCountKey, { count: resultCount })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 pr-4">
          <span
            className={cn(
              "inline-flex items-center gap-1 h-6 px-2 text-xs rounded-full transition-all duration-200",
              selectedIds.length > 0
                ? "cursor-pointer select-none text-muted-foreground hover:text-foreground hover:bg-muted/80"
                : "text-muted-foreground/30 cursor-default"
            )}
            onClick={(event) => {
              if (selectedIds.length === 0) return;
              event.stopPropagation();
              onClearSelected();
            }}
          >
            <X className="size-2.5 shrink-0" />
            {t(clearSelectedKey)}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 text-muted-foreground/50 transition-all duration-200 group-hover:text-muted-foreground",
              collapsed && "-rotate-90"
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        {models.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {models.map((model) => {
              const isSelected = selectedIds.includes(model.id);

              return (
                <Button
                  key={`${uid}-model-${model.id}`}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "gap-1.5 transition-all active:scale-95",
                    isSelected
                      ? "shadow-sm"
                      : "hover:bg-accent hover:text-accent-foreground"
                  )}
                  onClick={() => onToggleModel(model.id)}
                >
                  {isSelected ? (
                    <X className="size-3 shrink-0" />
                  ) : (
                    <Plus className="size-3 shrink-0" />
                  )}
                  <span className="max-w-[160px] truncate">{model.model}</span>
                </Button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">
            {t("hardwareCompare.noModelsSelected")}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default ModelPicker;

