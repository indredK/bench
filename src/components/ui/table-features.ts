/**
 * Shared TanStack Table v9 feature registration / 共享 v9 特性注册.
 *
 * v9 将行模型工厂与 *Fns 注册表从 useReactTable 的 root options 移到了
 * `features` 对象（通过 tableFeatures() 注册）。核心行模型（core）默认自动注册，
 * 非核心模型（sorted）作为工厂插槽挂载。本模块集中维护一份共享 features，
 * 供所有表格组件与列定义复用，从而保证列定义 `ColumnDef<BenchTableFeatures, TData>`
 * 与 `useTable({ features })` 的 TFeatures 泛型始终保持一致。
 */
import {
  tableFeatures,
  rowSortingFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  sortFns,
} from "@tanstack/react-table"

export const benchTableFeatures = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
})

/** TFeatures-first 泛型，供 ColumnDef / Row / Column 等类型复用。 */
export type BenchTableFeatures = typeof benchTableFeatures
