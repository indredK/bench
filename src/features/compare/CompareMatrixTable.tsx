import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StickyTable,
  StickyTableBody,
  StickyTableCell,
  StickyTableHead,
  StickyTableHeader,
  StickyTableRow,
  type StickyTableProps,
} from "@/components/ui/StickyTable";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SpecRow } from "@/features/compare/types";

interface CompareMatrixRowContext {
  rowId: string;
  rowIndex: number;
}

interface CompareMatrixColumnMeta<Row> {
  sticky?: boolean;
  width?: React.CSSProperties["width"];
  minWidth?: React.CSSProperties["minWidth"];
  maxWidth?: React.CSSProperties["maxWidth"];
  headerClassName?: string;
  cellClassName?: string | ((row: Row, context: CompareMatrixRowContext) => string | undefined);
}

interface CompareMatrixTableProps<T extends { id: string; model: string }>
  extends Omit<StickyTableProps, "children"> {
  specRows: SpecRow<T>[];
  selectedModels: T[];
  numericKeys: (keyof T)[];
  inverseKeys: (keyof T)[];
  i18nPrefix: string;
  bestValues: Map<keyof T, Set<string>>;
  rangeValues: Map<keyof T, { min: number; max: number }>;
  referenceUrl?: (model: T, key: keyof T) => string | undefined;
  onRemoveModel: (id: string) => void;
}

function getColumnMeta<Row>(columnDef: ColumnDef<Row, unknown>) {
  return (columnDef.meta ?? {}) as CompareMatrixColumnMeta<Row>;
}

function getStyleFromMeta<Row>(meta: CompareMatrixColumnMeta<Row>) {
  return {
    width: meta.width,
    minWidth: meta.minWidth,
    maxWidth: meta.maxWidth,
  };
}

function CompareMatrixValueCell<T extends { id: string; model: string }>({
  row,
  model,
  numericKeys,
  inverseKeys,
  bestValues,
  rangeValues,
  referenceUrl,
}: {
  row: SpecRow<T>;
  model: T;
  numericKeys: (keyof T)[];
  inverseKeys: (keyof T)[];
  bestValues: Map<keyof T, Set<string>>;
  rangeValues: Map<keyof T, { min: number; max: number }>;
  referenceUrl?: (model: T, key: keyof T) => string | undefined;
}) {
  const value = model[row.key];
  const displayValue = row.format
    ? row.format(value as T[keyof T], model)
    : String(value ?? "—");
  const isHighlighted = bestValues.get(row.key)?.has(model.id);
  const range = rangeValues.get(row.key);
  const isNumeric =
    numericKeys.includes(row.key) ||
    inverseKeys.includes(row.key);
  const reference = referenceUrl
    ? referenceUrl(model, row.key)
    : undefined;
  let barPercent = 0;

  if (
    range &&
    isNumeric &&
    value != null &&
    !Number.isNaN(Number(value))
  ) {
    const numericValue = Number(value);
    const diff = range.max - range.min;
    if (diff > 0) {
      barPercent = ((numericValue - range.min) / diff) * 100;
    } else {
      barPercent = 100;
    }
  }

  return (
    <>
      {barPercent > 0 && (
        <div
          className="absolute inset-y-1.5 left-0 rounded-r-full transition-all duration-300"
          style={{
            width: `${Math.max(barPercent, 4)}%`,
            background: isHighlighted
              ? "linear-gradient(90deg, rgba(5,150,105,0.20), rgba(5,150,105,0.06))"
              : "linear-gradient(90deg, rgba(107,114,128,0.10), rgba(107,114,128,0.02))",
          }}
        />
      )}
      <div className="relative z-10 flex items-center gap-1.5">
        <span
          className={cn(
            "text-sm tabular-nums",
            isHighlighted && "text-emerald-700 dark:text-emerald-300"
          )}
        >
          {displayValue}
        </span>
        {reference && (
          <Tooltip>
            <TooltipTrigger
              className="shrink-0 cursor-pointer text-muted-foreground/40 transition-colors hover:text-muted-foreground"
              onClick={(event) => {
                event.stopPropagation();
                window.open(reference, "_blank", "noopener,noreferrer");
              }}
              aria-label={reference}
            >
              <ExternalLink className="size-3" />
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="center"
              className="max-w-[400px] break-all"
            >
              <span className="font-mono text-[10px]">
                {reference}
              </span>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </>
  );
}

function CompareMatrixTable<T extends { id: string; model: string }>({
  specRows,
  selectedModels,
  numericKeys,
  inverseKeys,
  i18nPrefix,
  bestValues,
  rangeValues,
  referenceUrl,
  onRemoveModel,
  ...tableProps
}: CompareMatrixTableProps<T>) {
  const { t } = useTranslation();

  const columns = useMemo<ColumnDef<SpecRow<T>>[]>(() => [
    {
      id: "specification",
      header: t(`${i18nPrefix}.specification`),
      cell: ({ row }) => t(row.original.label),
      meta: {
        sticky: true,
        minWidth: "160px",
        cellClassName: "text-xs",
      },
    },
    ...selectedModels.map<ColumnDef<SpecRow<T>>>((model) => ({
      id: model.id,
      header: () => (
        <div className="flex items-center gap-2">
          <div className="size-2 shrink-0 rounded-full bg-primary/40" />
          <span className="truncate font-medium">
            {model.model}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto shrink-0 opacity-60 transition-opacity hover:opacity-100"
            onClick={() => onRemoveModel(model.id)}
            aria-label={`Remove ${model.model}`}
          >
            <X className="size-3" />
          </Button>
        </div>
      ),
      cell: ({ row }) => (
        <CompareMatrixValueCell
          row={row.original}
          model={model}
          numericKeys={numericKeys}
          inverseKeys={inverseKeys}
          bestValues={bestValues}
          rangeValues={rangeValues}
          referenceUrl={referenceUrl}
        />
      ),
      meta: {
        minWidth: "140px",
        cellClassName: (row, context) => {
          const isHighlighted = bestValues.get(row.key)?.has(model.id);

          return cn(
            "relative",
            context.rowIndex % 2 === 1 && "bg-muted/15",
            isHighlighted && "font-bold text-emerald-600 dark:text-emerald-400"
          );
        },
      },
    })),
  ], [
    bestValues,
    i18nPrefix,
    inverseKeys,
    numericKeys,
    onRemoveModel,
    rangeValues,
    referenceUrl,
    selectedModels,
    t,
  ]);

  const table = useReactTable({
    data: specRows,
    columns,
    getRowId: (row) => String(row.key),
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <StickyTable {...tableProps}>
      <StickyTableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <StickyTableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const meta = getColumnMeta(header.column.columnDef);

              return (
                <StickyTableHead
                  key={header.id}
                  isFirstColumn={meta.sticky}
                  isFirstRow
                  className={meta.headerClassName}
                  style={getStyleFromMeta(meta)}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </StickyTableHead>
              );
            })}
          </StickyTableRow>
        ))}
      </StickyTableHeader>
      <StickyTableBody>
        {table.getRowModel().rows.map((tableRow, rowIndex) => {
          const rowContext = {
            rowId: tableRow.id,
            rowIndex,
          };

          return (
            <StickyTableRow
              key={tableRow.id}
              className="transition-none"
            >
              {tableRow.getVisibleCells().map((cell) => {
                const meta = getColumnMeta(cell.column.columnDef);
                const cellClassName =
                  typeof meta.cellClassName === "function"
                    ? meta.cellClassName(tableRow.original, rowContext)
                    : meta.cellClassName;

                return (
                  <StickyTableCell
                    key={cell.id}
                    isFirstColumn={meta.sticky}
                    className={cellClassName}
                    style={getStyleFromMeta(meta)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </StickyTableCell>
                );
              })}
            </StickyTableRow>
          );
        })}
      </StickyTableBody>
    </StickyTable>
  );
}

export { CompareMatrixTable };
export type { CompareMatrixTableProps };
