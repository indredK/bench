import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export interface SpecRow<T> {
  key: keyof T;
  label: string;
  format?: (val: T[keyof T], model: T) => string;
}

export interface CompareDataModule<T extends { id: string; model: string }> {
  data: T[];
  specRows: SpecRow<T>[];
  numericKeys: (keyof T)[];
  inverseKeys: (keyof T)[];
  i18nPrefix: string;
}

interface HardwareCompareProps<T extends { id: string; model: string }> {
  module: CompareDataModule<T>;
  title: string;
  icon: ReactNode;
}

function HardwareCompare<T extends { id: string; model: string }>({
  module,
  title,
  icon,
}: HardwareCompareProps<T>) {
  const { t } = useTranslation();
  const { data, specRows, numericKeys, inverseKeys, i18nPrefix } = module;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleModel = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectedModels = data.filter((m) => selectedIds.includes(m.id));
  const availableModels = data.filter((m) => !selectedIds.includes(m.id));

  const bestValues = new Map<keyof T, Set<string>>();
  specRows.forEach((row) => {
    if (selectedModels.length < 2) return;
    const key = row.key;
    if (numericKeys.includes(key)) {
      const nums = selectedModels.map((m) => m[key] as number);
      if (nums.some((n) => n !== undefined && n !== null)) {
        const maxVal = Math.max(...nums);
        bestValues.set(
          key,
          new Set(
            selectedModels
              .filter((m) => (m[key] as number) === maxVal)
              .map((m) => m.id)
          )
        );
      }
    } else if (inverseKeys.includes(key)) {
      const nums = selectedModels.map((m) => m[key] as number);
      if (nums.some((n) => n !== undefined && n !== null)) {
        const minVal = Math.min(...nums);
        bestValues.set(
          key,
          new Set(
            selectedModels
              .filter((m) => (m[key] as number) === minVal)
              .map((m) => m.id)
          )
        );
      }
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">
            {t(`${i18nPrefix}.selectModels`)}
          </p>
          <div className="flex flex-wrap gap-2">
            {availableModels.map((model) => (
              <Button
                key={model.id}
                variant="outline"
                size="sm"
                onClick={() => toggleModel(model.id)}
              >
                <Plus className="mr-1 size-3" />
                {model.model}
              </Button>
            ))}
          </div>
          {availableModels.length === 0 && selectedModels.length > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {t(`${i18nPrefix}.allSelected`)}
            </p>
          )}
        </div>

        {selectedModels.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">
              {t(`${i18nPrefix}.comparingTitle`, { count: selectedModels.length })}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-muted/60">
                    <th className="px-4 py-2 text-left font-semibold">
                      {t(`${i18nPrefix}.specification`)}
                    </th>
                    {selectedModels.map((model) => (
                      <th key={model.id} className="px-4 py-2 text-left font-semibold">
                        <div className="flex items-center gap-2">
                          <span>{model.model}</span>
                          <button
                            onClick={() => toggleModel(model.id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {specRows.map((row, idx) => {
                    const isBest = bestValues.has(row.key);
                    return (
                      <tr
                        key={String(row.key)}
                        className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}
                      >
                        <td className="px-4 py-2 font-medium text-muted-foreground">
                          {t(row.label)}
                        </td>
                        {selectedModels.map((model) => {
                          const val = model[row.key];
                          const displayVal = row.format
                            ? row.format(val as never, model)
                            : String(val ?? "—");
                          const isHighlighted =
                            isBest && bestValues.get(row.key)?.has(model.id);
                          return (
                            <td
                              key={model.id}
                              className={`px-4 py-2 ${
                                isHighlighted
                                  ? "font-bold text-emerald-600 dark:text-emerald-400"
                                  : ""
                              }`}
                            >
                              {displayVal}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default HardwareCompare;