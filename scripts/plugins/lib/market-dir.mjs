/**
 * 插件源目录解析（P5 真相源反转后的共用输入约定）。
 *
 * 插件源码真源在 `kindred-plugin-market/plugin-market/extensions/`；宿主仓的
 * `extensions/` 只在 CI release 流程（先拷贝再 pack）或用户手动放置时存在。
 * 本解析器让 build/sync/stage 三个脚本不必依赖 cwd/extensions，避免
 * 「真源反转后脚本静默 no-op」的陷阱（2026-09-18 诊断，D-037 序列）。
 *
 * 解析优先级：
 * 1. `--market <dir>`（显式 CLI）
 * 2. `BENCH_MARKET_DIR` 环境变量（与 test-extensions.mjs 同名同义，D-036）
 * 3. 标准工作区布局的兄弟目录：`<cwd>/../kindred-plugin-market/plugin-market/extensions`
 * 4. 兼容旧行为的 `cwd/extensions`（CI release 流程与 bench-poc 依赖）
 * 5. 都不存在 → `{ dir: null }`，由调用方按自身容错语义处理
 *    （build/stage 在 beforeBuildCommand 链上必须保持 exit 0 的空容错）。
 *
 * 显式输入（1/2）指向不存在的目录时返回 `{ dir, missing: true }`，
 * 调用方应 fail-closed（用户明确给了输入却无效 = 配置错误，不能当空集）。
 */

import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

/**
 * @param {string[]} argv 传入 process.argv（含 node 与脚本路径两个前导项）。
 * @param {string} cwd 脚本的工作目录（决定兄弟目录与 legacy 相对路径的基准）。
 * @returns {{ dir: string | null, source: "flag" | "env" | "sibling" | "legacy" | null, missing: boolean }}
 */
export function resolveMarketDir(argv = process.argv, cwd = process.cwd()) {
  const flagIndex = argv.indexOf("--market")
  const hasFlag = flagIndex >= 0
  const flag = hasFlag ? argv[flagIndex + 1] : undefined
  const env = process.env.BENCH_MARKET_DIR || undefined

  if (hasFlag) {
    // 显式给了 --market：无值/值是另一个 flag 都算配置错误（fail-closed）。
    if (!flag || flag.startsWith("--")) {
      return { dir: null, source: "flag", missing: true }
    }
    const dir = resolve(cwd, flag)
    return { dir: existsSync(dir) ? dir : null, source: "flag", missing: !existsSync(dir) }
  }
  if (env) {
    const dir = resolve(cwd, env)
    return { dir: existsSync(dir) ? dir : null, source: "env", missing: !existsSync(dir) }
  }

  const sibling = resolve(cwd, "..", "kindred-plugin-market", "plugin-market", "extensions")
  if (existsSync(sibling)) {
    return { dir: sibling, source: "sibling", missing: false }
  }
  const legacy = join(cwd, "extensions")
  if (existsSync(legacy)) {
    return { dir: legacy, source: "legacy", missing: false }
  }
  return { dir: null, source: null, missing: false }
}
