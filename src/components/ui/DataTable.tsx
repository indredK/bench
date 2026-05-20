import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import {
  StickyTable,
  StickyTableBody,
  StickyTableCaption,
  StickyTableCell,
  StickyTableCheckbox,
  StickyTableHead,
  StickyTableHeader,
  StickyTableRow,
  StickyTableSortButton,
  type StickyTableProps,
  type StickyTableSortDirection,
} from "@/components/ui/StickyTable";

type DataTableColumnAlign = "left" | "center" | "right";

interface DataTableColumnMeta<TData> {
  align?: DataTableColumnAlign;
  sticky?: boolean;
  width?: React.CSSProperties["width"];
  minWidth?: React.CSSProperties["minWidth"];
  maxWidth?: React.CSSProperties["maxWidth"];
  headerClassName?: string;
  cellClassName?: string | ((row: TData, context: DataTableRowContext) => string | undefined);
}

interface DataTableRowContext {
  rowId: string;
  rowIndex: number;
  isSelected: boolean;
}

interface DataTableSelection<TData> {
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  getRowCheckboxLabel?: (row: TData, checked: boolean) => string;
  getSelectAllCheckboxLabel?: (allSelected: boolean) => string;
  selectOnRowClick?: boolean;
  columnWidth?: React.CSSProperties["width"];
  columnClassName?: string;
}

interface DataTableSorting {
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
}

interface DataTableProps<TData> extends Omit<StickyTableProps, "children"> {
  data: TData[];
  columns: ColumnDef<TData>[];
  getRowId: (row: TData) => string;
  sorting?: DataTableSorting;
  selection?: DataTableSelection<TData>;
  caption?: React.ReactNode;
  bodyClassName?: string;
  getRowClassName?: (row: TData, context: DataTableRowContext) => string | undefined;
  onRowClick?: (row: TData, context: DataTableRowContext) => void;
  /** Returns data attributes to attach to each row for context menu delegation */
  getRowAttributes?: (row: TData) => Record<string, string>;
}

function getNextDataTableSorting(
  current: SortingState,
  columnId: string,
  sortDescFirst = false
): SortingState {
  const activeSort = current[0];

  if (activeSort?.id === columnId) {
    return [{ id: columnId, desc: !activeSort.desc }];
  }

  return [{ id: columnId, desc: sortDescFirst }];
}

function getDataTableSortDirection(
  sorting: SortingState,
  columnId: string
): StickyTableSortDirection {
  const activeSort = sorting[0];

  if (activeSort?.id !== columnId) {
    return "none";
  }

  return activeSort.desc ? "desc" : "asc";
}

function getDataTableAlignClass(align: DataTableColumnAlign = "left") {
  if (align === "right") {
    return "text-right";
  }

  if (align === "center") {
    return "text-center";
  }

  return "text-left";
}

function getColumnMeta<TData>(column: Column<TData, unknown>) {
  return (column.columnDef.meta ?? {}) as DataTableColumnMeta<TData>;
}

function getHeaderMeta<TData>(columnDef: ColumnDef<TData, unknown>) {
  return (columnDef.meta ?? {}) as DataTableColumnMeta<TData>;
}

function getStyleFromMeta<TData>(meta: DataTableColumnMeta<TData>) {
  return {
    width: meta.width,
    minWidth: meta.minWidth,
    maxWidth: meta.maxWidth,
  };
}

function DataTable<TData>({
  data,
  columns,
  getRowId,
  sorting,
  selection,
  caption,
  bodyClassName,
  getRowClassName,
  onRowClick,
  getRowAttributes,
  ...tableProps
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      sorting: sorting?.sorting ?? [],
      rowSelection: selection?.rowSelection ?? {},
    },
    onSortingChange: sorting?.onSortingChange,
    onRowSelectionChange: selection?.onRowSelectionChange,
    enableSortingRemoval: false,
    enableRowSelection: Boolean(selection),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableRows = table.getRowModel().rows;
  const allVisibleSelected =
    Boolean(selection) &&
    tableRows.length > 0 &&
    tableRows.every((row) => row.getIsSelected());
  const someVisibleSelected =
    Boolean(selection) &&
    tableRows.some((row) => row.getIsSelected()) &&
    !allVisibleSelected;

  const handleToggleAll = () => {
    if (!selection) {
      return;
    }

    const nextSelection = { ...selection.rowSelection };

    for (const row of tableRows) {
      if (allVisibleSelected) {
        delete nextSelection[row.id];
      } else {
        nextSelection[row.id] = true;
      }
    }

    selection.onRowSelectionChange(nextSelection);
  };

  return (
    <StickyTable {...tableProps}>
      {caption ? <StickyTableCaption>{caption}</StickyTableCaption> : null}
      <StickyTableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <StickyTableRow key={headerGroup.id}>
            {selection ? (
              <StickyTableHead
                isFirstColumn
                isFirstRow
                className={cn("w-12", selection.columnClassName)}
                style={{ width: selection.columnWidth }}
              >
                <StickyTableCheckbox
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected}
                  readOnly
                  onClick={(event) => {
                    event.stopPropagation();
                    handleToggleAll();
                  }}
                  aria-label={selection.getSelectAllCheckboxLabel?.(allVisibleSelected)}
                />
              </StickyTableHead>
            ) : null}
            {headerGroup.headers.map((header) => {
              const meta = getHeaderMeta(header.column.columnDef);
              const sortDirection = header.column.getCanSort()
                ? getDataTableSortDirection(sorting?.sorting ?? [], header.column.id)
                : "none";

              return (
                <StickyTableHead
                  key={header.id}
                  isFirstColumn={meta.sticky}
                  isFirstRow
                  className={cn(
                    getDataTableAlignClass(meta.align),
                    meta.headerClassName
                  )}
                  style={getStyleFromMeta(meta)}
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <StickyTableSortButton
                      direction={sortDirection}
                      align={meta.align}
                      onClick={(event) => header.column.getToggleSortingHandler()?.(event)}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </StickyTableSortButton>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </StickyTableHead>
              );
            })}
          </StickyTableRow>
        ))}
      </StickyTableHeader>
      <StickyTableBody className={bodyClassName}>
        {tableRows.map((tableRow, rowIndex) => {
          const row = tableRow.original;
          const isSelected = tableRow.getIsSelected();
          const rowContext = {
            rowId: tableRow.id,
            rowIndex,
            isSelected,
          };
          const isInteractive = Boolean(selection?.selectOnRowClick || onRowClick);

          const rowAttrs = getRowAttributes?.(row);

          const rowElement = (
            <StickyTableRow
              data-state={isSelected ? "selected" : undefined}
              aria-selected={isSelected || undefined}
              {...rowAttrs}
              className={cn(
                isInteractive && "cursor-pointer",
                getRowClassName?.(row, rowContext)
              )}
              onClick={
                isInteractive
                  ? () => {
                      if (selection?.selectOnRowClick) {
                        tableRow.toggleSelected();
                      }

                      onRowClick?.(row, rowContext);
                    }
                  : undefined
              }
            >
              {selection ? (
                <StickyTableCell
                  isFirstColumn
                  className={cn("w-12", selection.columnClassName)}
                  style={{ width: selection.columnWidth }}
                >
                  <StickyTableCheckbox
                    checked={isSelected}
                    readOnly
                    onClick={(event) => {
                      event.stopPropagation();
                      tableRow.toggleSelected();
                    }}
                    aria-label={selection.getRowCheckboxLabel?.(row, isSelected)}
                  />
                </StickyTableCell>
              ) : null}
              {tableRow.getVisibleCells().map((cell) => {
                const meta = getColumnMeta<TData>(cell.column);
                const cellClassName =
                  typeof meta.cellClassName === "function"
                    ? meta.cellClassName(row, rowContext)
                    : meta.cellClassName;

                return (
                  <StickyTableCell
                    key={cell.id}
                    isFirstColumn={meta.sticky}
                    className={cn(
                      getDataTableAlignClass(meta.align),
                      cellClassName
                    )}
                    style={getStyleFromMeta(meta)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </StickyTableCell>
                );
              })}
            </StickyTableRow>
          );

          return <div key={tableRow.id}>{rowElement}</div>;
        })}
      </StickyTableBody>
    </StickyTable>
  );
}

export {
  DataTable,
  getDataTableSortDirection,
  getNextDataTableSorting,
};

export type {
  DataTableColumnAlign,
  DataTableColumnMeta,
  DataTableProps,
  DataTableRowContext,
  DataTableSelection,
  DataTableSorting,
};
