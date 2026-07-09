/**
 * Priority Scoring / 优先级评分: pure functions only; 纯函数.
 * 移植原型算法：score = 归一化空间×0.5 + (1−风险权重)×0.3 + 用户标记×0.2
 */
import type { RiskLevel } from "@/lib/tauri/types/dev-cleaner"
import type { PriorityTier, StorageItem } from "@/lib/tauri/types/clean-space"

const RISK_WEIGHT: Record<RiskLevel, number> = {
  safe: 0,
  low: 0.33,
  medium: 0.66,
  high: 1,
}

/**
 * 计算单项得分（0~1）。
 */
export function scoreItem(
  sizeBytes: number,
  risk: RiskLevel,
  maxSize: number,
  marked = 0,
): number {
  const norm = maxSize > 0 ? sizeBytes / maxSize : 0
  return norm * 0.5 + (1 - RISK_WEIGHT[risk]) * 0.3 + marked * 0.2
}

/**
 * 按得分降序三等分 → P1 / P2 / P3（原地修改 score 和 priority 字段）。
 */
export function assignPriority(all: StorageItem[]): void {
  if (all.length === 0) return

  const maxSize = Math.max(...all.map((i) => i.size_bytes), 1)

  // 计算 score（原数组直接修改）
  for (const item of all) {
    item.score = scoreItem(item.size_bytes, item.risk_level, maxSize)
  }

  // 按 score 降序排序（引用同一对象，避免 O(n²) 查找）
  const sorted = [...all].sort((a, b) => b.score - a.score)
  const third = Math.ceil(sorted.length / 3)

  for (let i = 0; i < sorted.length; i++) {
    let tier: PriorityTier
    if (i < third) tier = "P1"
    else if (i < third * 2) tier = "P2"
    else tier = "P3"
    sorted[i].priority = tier
  }
}
