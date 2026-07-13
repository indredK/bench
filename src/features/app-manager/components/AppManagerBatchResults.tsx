/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { BatchOperationResult } from "@/lib/tauri/types/app-manager"

interface AppManagerBatchResultsProps {
  batchResults: BatchOperationResult | null
  onClear: () => void
}

export function AppManagerBatchResults({ batchResults, onClear }: AppManagerBatchResultsProps) {
  const { t } = useTranslation()
  if (!batchResults) return null

  return (
    <div className="bg-background flex shrink-0 items-center justify-between rounded-lg border p-2">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-green-600">
          {t("appManager.batchSucceeded", { n: batchResults.succeeded })}
        </span>
        {batchResults.failed > 0 && (
          <span className="text-red-600">
            {t("appManager.batchFailed", { n: batchResults.failed })}
          </span>
        )}
        {batchResults.cancelled > 0 && (
          <span className="text-amber-600">
            {t("appManager.batchCancelled", { n: batchResults.cancelled })}
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
  )
}
