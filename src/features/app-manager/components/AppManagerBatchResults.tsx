import type { TFunction } from "i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BatchOperationResult } from "@/lib/tauri/types/app-manager";

interface AppManagerBatchResultsProps {
  t: TFunction;
  batchResults: BatchOperationResult | null;
  onClear: () => void;
}

export function AppManagerBatchResults({
  t,
  batchResults,
  onClear,
}: AppManagerBatchResultsProps) {
  if (!batchResults) return null;

  return (
    <div className="shrink-0 rounded-lg border p-2 bg-background flex items-center justify-between">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-green-600">
          {t("appManager.batchSucceeded", { n: batchResults.succeeded })}
        </span>
        {batchResults.failed > 0 && (
          <span className="text-red-600">
            {t("appManager.batchFailed", { n: batchResults.failed })}
          </span>
        )}
        <span className="text-muted-foreground">
          {t("appManager.batchTotal", { n: batchResults.total })}
        </span>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClear}>
        <X size={12} />
      </Button>
    </div>
  );
}
