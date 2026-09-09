#!/usr/bin/env node
/**
 * Node 构建/维护脚本的跨平台执行封装（供 `scripts/**` 复用）。
 *
 * 为什么需要它（三个实测结论，Windows 11 + Node 24）：
 * - `spawnSync("pnpm.cmd", args, { shell: false })` → EINVAL：Windows 上
 *   `.cmd`/`.bat` 不是可执行文件，脱离终端无法启动。
 * - `spawnSync("pnpm", args, { shell: false })` → ENOENT：Windows 不做
 *   PATHEXT 解析，无扩展名找不到 `.cmd` 包装脚本。
 * - `spawnSync(cmd, args, { shell: true })` 且 args 非空 → DEP0190 runtime
 *   弃用警告（Node 24 起）：shell 模式只把参数做空格拼接、不做转义。
 *
 * 因此统一走 `cmd.exe /d /s /c "<cmd> <args...>"`：参数数组不交给 shell 解析，
 * 保持 `shell: false` 的语义，同时让 Windows 能启动 `.cmd` 包装脚本。
 * 注意取舍：命令串由本模块拼接，调用方**不得**把未校验的外部输入当参数传入。
 */

import { spawn, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

/** 平台常量。判断"是不是 Windows"用这个，不要各脚本各写一遍。 */
export const IS_WINDOWS = process.platform === "win32"

const CMD_SCRIPT = /\.(cmd|bat)$/i

/**
 * 该目标是否需要 cmd.exe 包装。
 * 判据是**目标本身**（扩展名），不是平台——这是能力检测，不是平台检测。
 */
export function needsCmdShell(cmd) {
  return IS_WINDOWS && CMD_SCRIPT.test(cmd)
}

/** 参数含空格时加引号（cmd.exe 拼接命令串的必需处理）。 */
function quoteIfNeeded(arg) {
  return typeof arg === "string" && /\s/.test(arg) ? `"${arg}"` : arg
}

/**
 * 把 (cmd, args) 归一为可直接交给 child_process 的 (file, args)。
 * 非 Windows、或目标是真实可执行文件时原样返回。
 */
export function toSpawnArgs(cmd, args = []) {
  if (!needsCmdShell(cmd)) return { file: cmd, args }
  return {
    file: "cmd.exe",
    args: ["/d", "/s", "/c", [cmd, ...args.map(quoteIfNeeded)].join(" ")],
  }
}

/** 同步执行，返回 spawnSync 结果。 */
export function runCommand(cmd, args = [], options = {}) {
  const { file, args: finalArgs } = toSpawnArgs(cmd, args)
  return spawnSync(file, finalArgs, { shell: false, ...options })
}

/** 异步执行，返回 ChildProcess。 */
export function spawnCommand(cmd, args = [], options = {}) {
  const { file, args: finalArgs } = toSpawnArgs(cmd, args)
  return spawn(file, finalArgs, { shell: false, ...options })
}

/**
 * 解析包管理器在 `node_modules/.bin/` 下的 bin 路径。
 *
 * pnpm 在同一目录生成三种形态：`vite`（sh 脚本，POSIX）、`vite.CMD`、
 * `vite.ps1`。Windows 下无扩展名的 sh 脚本无法被 CreateProcess 启动，必须
 * 解析到 `.cmd` 形态（交给 runCommand 的 cmd.exe 包装执行）；POSIX 用无扩
 * 展名形态。文件名在 NTFS 上不区分大小写，`.cmd` 与实际产物 `.CMD` 等价。
 */
export function resolveBinPath(binDir, name) {
  if (!IS_WINDOWS) return path.join(binDir, name)
  return path.join(binDir, `${name}.cmd`)
}

/**
 * 命令是否可用。用 `--version` 实探测，不依赖 `where`/`which` 这类外部命令
 * （Windows 的 `where` 是 cmd 内建，macOS/Linux 才有 `which`）。
 *
 * 判定必须分两层：`cmd.exe` 包装路径下 `error` 恒为 null（cmd.exe 本身总能
 * 启动），目标不存在只会表现为 `status !== 0` + "not recognized"，所以包装
 * 结果要看退出码；直接 spawn 路径下才用 `error.code === "ENOENT"` 判断。
 */
export function commandExists(cmd) {
  const result = runCommand(cmd, ["--version"], { stdio: "ignore" })
  if (result.error) return result.error.code !== "ENOENT"
  return result.status === 0
}

/**
 * 从 package.json 的 `packageManager` 字段解析包管理器命令名。
 * Windows 上 npm/pnpm/yarn 只有 `.cmd` 包装脚本，必须带扩展名才能被 spawn 解析。
 */
export function resolvePackageManager(rootDir = process.cwd(), options = {}) {
  let name = "npm"
  try {
    const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"))
    const match = /^(@[\w-]+\/)?(?<name>[\w-]+)@\d/.exec(pkg.packageManager ?? "")
    if (match?.groups?.name) name = match.groups.name
  } catch {
    // package.json 缺失或字段非法：回退 npm
  }
  // 供调用方展示/拼接时去掉 .cmd（如探测命令是否存在）
  if (options.bare) return name
  return IS_WINDOWS ? `${name}.cmd` : name
}
