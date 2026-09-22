/**
 * Env snapshot export / 环境清单导出（脱敏）.
 *
 * 纯函数、无副作用、无 UI 文案：把用户主目录（`/Users/<u>`、`/home/<u>`、`C:\Users\<u>`）
 * 统一替换为 `<HOME>` 占位符，抹掉用户名这一身份标识，只保留工具相对子路径。产物里不含
 * 任何凭据字段（EnvTool 本就不携带密钥），路径是这里唯一会泄露身份的向量。
 */
import type { EnvTool } from "@/lib/tauri/types"

/** 跨平台常见主目录前缀（含用户名段），大小写不敏感、全局匹配。 */
const HOME_PATTERN = /(?:[a-z]:[\\/]users[\\/]|\/(?:users|home)[\\/])[^\\/]+/gi

/** 把输入里所有形如 `/Users/alice`、`C:\Users\Bob`、`/home/carol` 的前缀替换为 `<HOME>`。 */
export function redactUserPaths(input: string): string {
  return input.replace(HOME_PATTERN, "<HOME>")
}

/**
 * 生成脱敏后的环境清单文本。每行 `[x] name | version | path`（`[ ]` 表示未安装）。
 * 空输入返回空串，交由上层决定如何提示。
 */
export function buildEnvSnapshot(tools: EnvTool[]): string {
  if (!tools || tools.length === 0) return ""
  return tools
    .map((tool) => {
      const mark = tool.available ? "[x]" : "[ ]"
      const version = tool.version || "-"
      const path = tool.path ? redactUserPaths(tool.path) : "-"
      return `${mark} ${tool.name} | ${version} | ${path}`
    })
    .join("\n")
}
