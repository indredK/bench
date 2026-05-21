/**
 * Content UI / 内容 UI: own presentation patterns; 只负责内容展示模式.
 */
import { Table2, Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ViewToggleProps {
  viewMode: "table" | "grid";
  onChange: (mode: "table" | "grid") => void;
}

export function ViewToggle({ viewMode, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center border rounded-lg p-0.5 bg-muted/30">
      <Button
        variant={viewMode === "table" ? "default" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onChange("table")}
      >
        <Table2 size={14} />
      </Button>
      <Button
        variant={viewMode === "grid" ? "default" : "ghost"}
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onChange("grid")}
      >
        <Grid3x3 size={14} />
      </Button>
    </div>
  );
}
