/**
 * UI 层级语义常量 — z-index 单一事实来源.
 *
 * 使用方式：
 * - className 中用 Tailwind 工具类 `z-sticky-corner` / `z-drawer-panel` 等
 *   （由 tokens.css 的 `--z-index-*` 变量生成）
 * - JS 中需要读取时 import { UI_LAYERS }
 *
 * 禁止在 className 中直接写 `z-[N]` 魔法数字。
 * shadcn/ui 组件内置的 `z-10` / `z-50` 等 Tailwind 标准档位不受此限制。
 */
export const UI_LAYERS = {
  /** 表头 + 首列交叉单元格（StickyTable 最高层） */
  stickyTableCorner: 60,
  /** 表头行（StickyTable，仅 sticky top） */
  stickyTableHeader: 50,
  /** 首列表头单元格（StickyTable，非首行，仅 sticky left） */
  stickyTableColumnHeader: 40,
  /** 首列主体单元格（StickyTable，仅 sticky left） */
  stickyTableColumn: 30,
  /** 右侧抽屉面板（ThreeColumnLayout） */
  drawerPanel: 80,
  /** 抽屉遮罩（ThreeColumnLayout） */
  drawerOverlay: 70,
} as const

export type UILayer = keyof typeof UI_LAYERS
