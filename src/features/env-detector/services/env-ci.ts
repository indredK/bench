import type { EnvTool } from "@/lib/tauri/types"

/**
 * renderCiEnvManifest / 生成 CI 版本清单（asdf `.tool-versions` 风格）.
 *
 * 纯函数、无 UI 文案：把本次扫描「已安装且有版本号」的工具，按名字去重后输出
 * `name version` 行，版本号去掉前导 v/V 以便 asdf / setup-* 直接引用。供 CI 固定
 * 复现开发环境用。目标平台与人类可读标题由上层用 i18n 前置，这里不掺文案。
 */
function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^[vV]/, "")
}

export function renderCiEnvManifest(tools: EnvTool[]): string {
  const byName = new Map<string, string>()
  for (const tool of tools) {
    if (!tool.available) continue
    const version = normalizeVersion(tool.version || "")
    if (!version) continue
    if (!byName.has(tool.name)) byName.set(tool.name, version)
  }
  return [...byName.entries()].map(([name, version]) => `${name} ${version}`).join("\n")
}
