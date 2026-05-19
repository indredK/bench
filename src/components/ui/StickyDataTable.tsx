import { useMemo } from "react";
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row as TanStackRow,
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

const naturalSortCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

type StickyDataTableActiveSortDirection = Exclude<StickyTableSortDirection, "none">;
type StickyDataTableSortValue = string | number | boolean | Date | null | undefined;
type StickyDataTableColumnAlign = "left" | "center" | "right";

interface StickyDataTableRowContext {
  rowId: string;
  rowIndex: number;
  isSelected: boolean;
}

interface StickyDataTableColumn<Row, ColumnId extends string = string> {
  id: ColumnId;
  header: React.ReactNode;
  renderCell: (row: Row, context: StickyDataTableRowContext) => React.ReactNode;
  align?: StickyDataTableColumnAlign;
  sticky?: boolean;
  width?: React.CSSProperties["width"];
  minWidth?: React.CSSProperties["minWidth"];
  maxWidth?: React.CSSProperties["maxWidth"];
  headerClassName?: string;
  cellClassName?: string | ((row: Row, context: StickyDataTableRowContext) => string | undefined);
  sortable?: boolean;
  sortDescFirst?: boolean;
  compareFn?: (a: Row, b: Row) => number;
  getSortValue?: (row: Row) => StickyDataTableSortValue;
}

interface StickyDataTableSortState<ColumnId extends string = string> {
  columnId: ColumnId;
  direction: StickyDataTableActiveSortDirection;
}

interface StickyDataTableSorting<ColumnId extends string = string> {
  state: StickyDataTableSortState<ColumnId>;
  onChange: (state: StickyDataTableSortState<ColumnId>) => void;
}

interface StickyDataTableSelection<Row> {
  selectedRowIds: ReadonlySet<string>;
  onChange: (nextSelectedRowIds: Set<string>) => void;
  getRowCheckboxLabel?: (row: Row, checked: boolean) => string;
  getSelectAllCheckboxLabel?: (allSelected: boolean) => string;
  selectOnRowClick?: boolean;
  columnWidth?: React.CSSProperties["width"];
  columnClassName?: string;
}

interface StickyDataTableProps<Row, ColumnId extends string = string>
  extends Omit<StickyTableProps, "children"> {
  data: Row[];
  columns: StickyDataTableColumn<Row, ColumnId>[];
  getRowId: (row: Row) => string;
  sorting?: StickyDataTableSorting<ColumnId>;
  selection?: StickyDataTableSelection<Row>;
  caption?: React.ReactNode;
  bodyClassName?: string;
  getRowClassName?: (row: Row, context: StickyDataTableRowContext) => string | undefined;
  onRowClick?: (row: Row, context: StickyDataTableRowContext) => void;
}

function getNextStickyDataTableSortState<ColumnId extends string>(
  current: StickyDataTableSortState<ColumnId>,
  columnId: ColumnId,
  sortDescFirst = false
): StickyDataTableSortState<ColumnId> {
  if (current.columnId === columnId) {
    return {
      columnId,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }

  return {
    columnId,
    direction: sortDescFirst ? "desc" : "asc",
  };
}

function getStickyDataTableSortDirection<ColumnId extends string>(
  state: StickyDataTableSortState<ColumnId>,
  columnId: ColumnId
): StickyTableSortDirection {
  return state.columnId === columnId ? state.direction : "none";
}

function compareStickyDataTableValues(
  left: StickyDataTableSortValue,
  right: StickyDataTableSortValue
) {
  if (left == null && right == null) {
    return 0;
  }

  if (left == null) {
    return 1;
  }

  if (right == null) {
    return -1;
  }

  if (left instanceof Date || right instanceof Date) {
    const leftTime = left instanceof Date ? left.getTime() : Date.parse(String(left));
    const rightTime = right instanceof Date ? right.getTime() : Date.parse(String(right));

    return leftTime - rightTime;
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  return naturalSortCollator.compare(String(left), String(right));
}

function getStickyDataTableAlignClass(align: StickyDataTableColumnAlign = "left") {
  if (align === "right") {
    return "text-right";
  }

  if (align === "center") {
    return "text-center";
  }

  return "text-left";
}

function toTanStackColumns<DataRow, ColumnId extends string>(
  columns: StickyDataTableColumn<DataRow, ColumnId>[]
): ColumnDef<DataRow>[] {
  return columns.map((column) => ({
    id: column.id,
    enableSorting: Boolean(column.sortable),
    accessorFn: column.getSortValue ?? (() => undefined),
    sortingFn: (left: TanStackRow<DataRow>, right: TanStackRow<DataRow>) => {
      if (column.compareFn) {
        return column.compareFn(left.original, right.original);
      }

      if (column.getSortValue) {
        return compareStickyDataTableValues(
          column.getSortValue(left.original),
          column.getSortValue(right.original)
        );
      }

      return 0;
    },
  }));
}

function StickyDataTable<Row, ColumnId extends string = string>({
  data,
  columns,
  getRowId,
  sorting,
  selection,
  caption,
  bodyClassName,
  getRowClassName,
  onRowClick,
  ...tableProps
}: StickyDataTableProps<Row, ColumnId>) {
  const tanstackColumns = useMemo<ColumnDef<Row>[]>(
    () => toTanStackColumns(columns),
    [columns]
  );

  const tanstackSorting = useMemo<SortingState>(() => {
    if (!sorting) {
      return [];
    }

    return [
      {
        id: sorting.state.columnId,
        desc: sorting.state.direction === "desc",
      },
    ];
  }, [sorting]);

  const rowSelection = useMemo<RowSelectionState>(() => {
    if (!selection) {
      return {};
    }

    return Object.fromEntries(
      Array.from(selection.selectedRowIds).map((rowId) => [rowId, true])
    );
  }, [selection]);

  const table = useReactTable({
    data,
    columns: tanstackColumns,
    getRowId,
    state: {
      sorting: tanstackSorting,
      rowSelection,
    },
    enableRowSelection: Boolean(selection),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableRows = table.getRowModel().rows;

  const visibleRowIds = useMemo(
    () => tableRows.map((row) => row.id),
    [tableRows]
  );

  const selectedVisibleCount = useMemo(() => {
    if (!selection) {
      return 0;
    }

    return visibleRowIds.filter((rowId) => selection.selectedRowIds.has(rowId)).length;
  }, [selection, visibleRowIds]);

  const allVisibleSelected =
    Boolean(selection) &&
    visibleRowIds.length > 0 &&
    selectedVisibleCount === visibleRowIds.length;
  const someVisibleSelected =
    Boolean(selection) &&
    selectedVisibleCount > 0 &&
    selectedVisibleCount < visibleRowIds.length;

  const handleToggleAll = () => {
    if (!selection) {
      return;
    }

    const nextSelectedRowIds = new Set(selection.selectedRowIds);

    if (allVisibleSelected) {
      for (const rowId of visibleRowIds) {
        nextSelectedRowIds.delete(rowId);
      }
    } else {
      for (const rowId of visibleRowIds) {
        nextSelectedRowIds.add(rowId);
      }
    }

    selection.onChange(nextSelectedRowIds);
  };

  const handleToggleRow = (row: Row) => {
    if (!selection) {
      return;
    }

    const rowId = getRowId(row);
    const nextSelectedRowIds = new Set(selection.selectedRowIds);

    if (nextSelectedRowIds.has(rowId)) {
      nextSelectedRowIds.delete(rowId);
    } else {
      nextSelectedRowIds.add(rowId);
    }

    selection.onChange(nextSelectedRowIds);
  };

  return (
    <StickyTable {...tableProps}>
      {caption ? <StickyTableCaption>{caption}</StickyTableCaption> : null}
      <StickyTableHeader>
        <StickyTableRow>
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
          {columns.map((column) => {
            const sortDirection = sorting
              ? getStickyDataTableSortDirection(sorting.state, column.id)
              : "none";
            const style = {
              width: column.width,
              minWidth: column.minWidth,
              maxWidth: column.maxWidth,
            };

            return (
              <StickyTableHead
                key={column.id}
                isFirstColumn={column.sticky}
                isFirstRow
                className={cn(
                  getStickyDataTableAlignClass(column.align),
                  column.headerClassName
                )}
                style={style}
              >
                {sorting && column.sortable ? (
                  <StickyTableSortButton
                    direction={sortDirection}
                    align={column.align}
                    onClick={() =>
                      sorting.onChange(
                        getNextStickyDataTableSortState(
                          sorting.state,
                          column.id,
                          column.sortDescFirst
                        )
                      )
                    }
                  >
                    {column.header}
                  </StickyTableSortButton>
                ) : (
                  column.header
                )}
              </StickyTableHead>
            );
          })}
        </StickyTableRow>
      </StickyTableHeader>
      <StickyTableBody className={bodyClassName}>
        {tableRows.map((tableRow, rowIndex) => {
          const row = tableRow.original;
          const rowId = tableRow.id;
          const isSelected = selection ? tableRow.getIsSelected() : false;
          const rowContext = {
            rowId,
            rowIndex,
            isSelected,
          };
          const isInteractive = Boolean(selection?.selectOnRowClick || onRowClick);

          return (
            <StickyTableRow
              key={rowId}
              data-state={isSelected ? "selected" : undefined}
              aria-selected={isSelected || undefined}
              className={cn(
                isInteractive && "cursor-pointer",
                getRowClassName?.(row, rowContext)
              )}
              onClick={
                isInteractive
                  ? () => {
                      if (selection?.selectOnRowClick) {
                        handleToggleRow(row);
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
                      handleToggleRow(row);
                    }}
                    aria-label={selection.getRowCheckboxLabel?.(row, isSelected)}
                  />
                </StickyTableCell>
              ) : null}
              {columns.map((column) => {
                const style = {
                  width: column.width,
                  minWidth: column.minWidth,
                  maxWidth: column.maxWidth,
                };

                return (
                  <StickyTableCell
                    key={column.id}
                    isFirstColumn={column.sticky}
                    className={cn(
                      getStickyDataTableAlignClass(column.align),
                      typeof column.cellClassName === "function"
                        ? column.cellClassName(row, rowContext)
                        : column.cellClassName
                    )}
                    style={style}
                  >
                    {column.renderCell(row, rowContext)}
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

export {
  StickyDataTable,
  getNextStickyDataTableSortState,
  getStickyDataTableSortDirection,
};

export type {
  StickyDataTableProps,
  StickyDataTableColumn,
  StickyDataTableRowContext,
  StickyDataTableSelection,
  StickyDataTableSortState,
  StickyDataTableSorting,
  StickyDataTableActiveSortDirection,
  StickyDataTableColumnAlign,
};
