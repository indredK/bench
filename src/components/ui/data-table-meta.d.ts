/**
 * Primitive UI / 基础 UI: render primitives only; 只提供基础组件.
 */
import type { RowData } from "@tanstack/react-table";
import type { DataTableColumnMeta } from "@/components/ui/DataTable";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> extends DataTableColumnMeta<TData> {
    __valueType?: TValue;
  }
}
