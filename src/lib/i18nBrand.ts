/**
 * Utility / 通用工具: keep helpers pure; 保持纯工具函数.
 */
import i18n from "@/i18n/config";

/**
 * 将品牌名转为当前语言的显示名称。
 * 查找 i18n 键 `brands.<key>`，找不到时返回原始值。
 */
export function brandName(value: unknown): string {
  const raw = String(value);
  const key = raw
    .toLowerCase()
    .replace(/[\s.!/-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return i18n.exists(`brands.${key}`) ? i18n.t(`brands.${key}`) : raw;
}
