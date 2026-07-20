/**
 * Card Kind Detection / 卡片类型识别: pure heuristic; 只做类型推断.
 *
 * 根据用户粘贴/输入的命令文本推断最合适的动作类型：
 * - open：URL、file://、纯路径（无空格或以 ~ / . / 盘符开头，不含 shell 语法）
 * - shellAdmin：包含 sudo 或 osascript ... administrator privileges
 * - shell：识别到常见命令行特征（git、docker、npm、管道、重定向等）
 * - copy：无明显可执行特征的纯文本片段
 *
 * 识别不出明确特征时返回 null，由调用方回退到默认 shell 建议。
 */
import type { CardKind } from "@/lib/tauri/types/command-center"

const URL_RE = /^(https?|ftp|file):\/\//i
const WINDOWS_PATH_RE = /^[a-z]:[\\/]/i
const PATH_PREFIX_RE = /^(~\/|\.\/|\.\.\/|\/)/
const SHELL_SYNTAX_RE = /[|&;><$`(){}]|\s--?\w/
const ADMIN_RE = /(^|\s)sudo\s|administrator privileges/i

const COMMON_COMMANDS = new Set([
  "git",
  "docker",
  "docker-compose",
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "node",
  "python",
  "python3",
  "pip",
  "pip3",
  "cargo",
  "go",
  "brew",
  "kubectl",
  "make",
  "cd",
  "ls",
  "rm",
  "cp",
  "mv",
  "mkdir",
  "cat",
  "echo",
  "curl",
  "wget",
  "ssh",
  "scp",
  "chmod",
  "chown",
  "kill",
  "killall",
  "osascript",
  "defaults",
  "launchctl",
  "tar",
  "zip",
  "unzip",
  "ffmpeg",
  "grep",
  "sed",
  "awk",
  "find",
])

/** 推断类型；无法确定时返回 null。 */
export function detectCardKind(rawCommand: string): CardKind | null {
  const command = rawCommand.trim()
  if (command.length === 0) return null

  const singleLine = !command.includes("\n")
  const firstToken = command.split(/\s+/)[0]?.toLowerCase() ?? ""

  if (ADMIN_RE.test(command)) return "shellAdmin"

  if (singleLine && URL_RE.test(command)) return "open"

  if (
    singleLine &&
    !SHELL_SYNTAX_RE.test(command) &&
    (WINDOWS_PATH_RE.test(command) || PATH_PREFIX_RE.test(command)) &&
    !COMMON_COMMANDS.has(firstToken)
  ) {
    return "open"
  }

  if (COMMON_COMMANDS.has(firstToken)) return "shell"

  if (SHELL_SYNTAX_RE.test(command)) return "shell"

  return null
}

/** 带回退的建议：识别不出明确特征时建议 shell。 */
export function suggestCardKind(rawCommand: string): CardKind {
  return detectCardKind(rawCommand) ?? "shell"
}
