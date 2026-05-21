/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OperationRecord } from "@/lib/tauri/types/app-manager";

interface AppManagerHistoryDrawerProps {
  t: TFunction;
  open: boolean;
  history: OperationRecord[];
  onClose: () => void;
}

export function AppManagerHistoryDrawer({
  t,
  open,
  history,
  onClose,
}: AppManagerHistoryDrawerProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 transition-opacity" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-[300px] border-l bg-card z-50 flex flex-col shadow-lg animate-slide-in-right">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <span className="text-sm font-semibold">{t("appManager.operationHistory")}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              {t("appManager.historyEmpty")}
            </p>
          ) : (
            <div className="space-y-1.5">
              {[...history].reverse().map((record, idx) => (
                <div key={`${record.timestamp}-${idx}`} className="rounded-md border bg-background p-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {record.success ? (
                        <CheckCircle2 className="size-3.5 text-green-500" />
                      ) : (
                        <AlertCircle className="size-3.5 text-red-500" />
                      )}
                      <span className="font-medium">{record.action}</span>
                      {record.errorCode && (
                        <Badge
                          variant={record.permissionIssue ? "destructive" : "outline"}
                          className="text-[9px] px-1 py-0"
                        >
                          {record.errorCode}
                        </Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground">
                      {new Date(record.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-muted-foreground truncate">{record.appName}</div>
                  {record.output && (
                    <p
                      className={`mt-1 truncate ${
                        record.success
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                      title={record.output}
                    >
                      {record.output}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
