import { rmSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

const targets = [
  { path: "node_modules", label: "前端依赖 (node_modules)" },
  // D-021: Rust 构建目录已外迁至仓库外的 ../tauri-app-target；
  // 旧路径仅用于清理历史遗留产物。
  { path: "../tauri-app-target", label: "后端构建产物 (tauri-app-target)" },
  { path: "src-tauri/target", label: "后端构建产物旧目录 (src-tauri/target)" },
  { path: "dist", label: "前端构建产物 (dist)" },
]

console.log("==============================")
console.log("  清理项目依赖与构建产物")
console.log("==============================\n")

let cleaned = 0
let skipped = 0

for (const target of targets) {
  const fullPath = path.join(rootDir, target.path)
  process.stdout.write(`  ${target.label}... `)
  if (!existsSync(fullPath)) {
    console.log("跳过 (不存在)")
    skipped++
    continue
  }
  try {
    rmSync(fullPath, { recursive: true, force: true })
    console.log("已删除")
    cleaned++
  } catch (err) {
    console.log(`失败: ${err.message}`)
    process.exit(1)
  }
}

console.log(`\n==============================`)
console.log(`  清理完成: 删除 ${cleaned} 项, 跳过 ${skipped} 项`)
console.log(`==============================`)
console.log(`  重新安装: pnpm run setup`)
console.log(`==============================`)
