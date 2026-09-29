import { existsSync, lstatSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import trash from "trash"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

const targets = [
  // D-021: Rust 构建目录位于仓库外，并由多个 worktree 共用；这里只处理旧位置残留。
  { path: "src-tauri/target", label: "后端构建产物旧目录 (src-tauri/target)" },
  { path: "dist", label: "前端构建产物 (dist)" },
]

async function main() {
  console.log("==============================")
  console.log("  整理项目构建产物")
  console.log("==============================\n")

  let trashed = 0
  let skipped = 0
  let failed = 0

  for (const target of targets) {
    const fullPath = path.join(rootDir, target.path)
    process.stdout.write(`  ${target.label}... `)
    if (!existsSync(fullPath)) {
      console.log("跳过 (不存在)")
      skipped++
      continue
    }
    const metadata = lstatSync(fullPath)
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      console.log("跳过 (目标不是普通目录，源路径保留)")
      skipped++
      continue
    }
    try {
      await trash(fullPath, { glob: false })
      console.log("已移入系统废纸篓/回收站")
      trashed++
    } catch (err) {
      console.log(`失败，源文件保留: ${err.message}`)
      failed++
    }
  }

  console.log(`\n==============================`)
  console.log(`  整理完成: 移入废纸篓 ${trashed} 项, 跳过 ${skipped} 项, 失败 ${failed} 项`)
  console.log(`==============================`)
  if (trashed) console.log("  移入废纸篓/回收站不会立即释放磁盘空间；清空后才会释放。")
  console.log("  共享 target 请使用 pnpm run clean:rust-cache --sweep 做细粒度整理。")
  if (failed) process.exitCode = 1
}

main().catch((err) => {
  console.error(`[clean] 整理失败，未执行永久删除：${err.message}`)
  process.exitCode = 1
})
