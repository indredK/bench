import { type ReactNode } from "react";
import { X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DetailPanelProps<T> {
  item: T | null;
  onClose: () => void;
  renderDetail: (item: T) => ReactNode;
  title?: string;
  loading?: boolean;
  open: boolean;
}

export function DetailPanel<T>({
  item,
  onClose,
  renderDetail,
  title = "Details",
  loading = false,
  open,
}: DetailPanelProps<T>) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card flex flex-col overflow-hidden transition-opacity duration-200 w-full h-full",
        open ? "opacity-100" : "opacity-0"
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
          {title}
        </span>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
          <X size={14} />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="text-xs text-muted-foreground">Loading...</p>
          </div>
        ) : item ? (
          renderDetail(item)
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Info size={32} className="opacity-30 mb-3" />
            <p className="text-sm">Select an item to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Reusable detail sub-components ---

export function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className="font-medium text-right max-w-[60%] truncate"
        title={value || "—"}
      >
        {value || "—"}
      </span>
    </div>
  );
}

export function DetailSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </h4>
      {children}
    </div>
  );
}
