import * as p from "@clack/prompts"
import { createInterface } from "node:readline"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolvePackageManager, runCommand as spawnViaPlatform } from "../lib/platform.mjs"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

// Windows 上解析为 `pnpm.cmd`（无扩展名 pnpm 无法被 spawn 解析，ENOENT），
// macOS/CI 保持无扩展名。
const PKG = resolvePackageManager(rootDir)

const menu = [
  {
    group: "开发",
    items: [
      { key: "dev", label: "启动 Tauri 开发模式(前端+后端)", cmd: PKG, args: ["run", "dev"] },
      { key: "dev:fe", label: "仅启动前端 Vite 开发服务器", cmd: PKG, args: ["run", "dev:fe"] },
      { key: "build", label: "构建生产版本(Release)", cmd: PKG, args: ["run", "build"] },
      {
        key: "build:debug",
        label: "构建调试版本(Debug)",
        cmd: PKG,
        args: ["run", "build:debug"],
      },
      { key: "build:fe", label: "仅构建前端", cmd: PKG, args: ["run", "build:fe"] },
      {
        key: "diagrams",
        label: "启动架构图集文档服务(:3200)",
        cmd: PKG,
        args: ["run", "diagrams"],
      },
    ],
  },
  {
    group: "环境",
    items: [
      { key: "setup", label: "一键安装(前端+后端依赖)", cmd: PKG, args: ["run", "setup"] },
      { key: "clean", label: "清理所有依赖与构建产物", cmd: PKG, args: ["run", "clean"] },
      {
        key: "hooks:install",
        label: "重新配置 Git 钩子",
        cmd: PKG,
        args: ["run", "hooks:install"],
      },
    ],
  },
  {
    group: "检查与测试",
    items: [
      { key: "check:be", label: "后端 cargo check", cmd: PKG, args: ["run", "check:be"] },
      {
        key: "clippy:be",
        label: "后端 clippy(警告视为错误)",
        cmd: PKG,
        args: ["run", "clippy:be"],
      },
      { key: "lint:fe", label: "前端类型检查 + i18n 守卫", cmd: PKG, args: ["run", "lint:fe"] },
      { key: "test:fe", label: "前端单元测试", cmd: PKG, args: ["run", "test:fe"] },
      { key: "test:be", label: "后端 cargo test", cmd: PKG, args: ["run", "test:be"] },
      { key: "test", label: "前后端全部测试", cmd: PKG, args: ["run", "test"] },
      { key: "verify", label: "完整验证(测试+构建)", cmd: PKG, args: ["run", "verify"] },
      {
        key: "check:precommit",
        label: "手动运行 pre-commit 检查",
        cmd: PKG,
        args: ["run", "check:precommit"],
      },
    ],
  },
  {
    group: "清理(细粒度)",
    items: [
      {
        key: "clean:be",
        label: "仅清理后端构建产物(target)",
        cmd: PKG,
        args: ["run", "clean:be"],
      },
    ],
  },
  {
    group: "维护",
    items: [
      {
        key: "upgrade:dry",
        label: "安全升级预演(全部, dry-run 不改动)",
        cmd: PKG,
        args: ["run", "upgrade:safe", "all", "--dry-run"],
      },
      {
        key: "upgrade:be",
        label: "安全升级(后端, 仅范围内 + 护栏校验)",
        cmd: PKG,
        args: ["run", "upgrade:safe", "be"],
      },
      {
        key: "upgrade:fe",
        label: "安全升级(前端, 仅范围内)",
        cmd: PKG,
        args: ["run", "upgrade:safe", "fe"],
      },
      {
        key: "upgrade:all",
        label: "安全升级(前后端, 仅范围内)",
        cmd: PKG,
        args: ["run", "upgrade:safe", "all"],
      },
    ],
  },
]

function buildGroupOptions() {
  return [
    ...menu.map((g, gi) => ({
      value: gi,
      label: `${g.group}  ·  ${g.items.length} 项`,
    })),
    { value: "exit", label: "退出", hint: "Esc / Ctrl+C" },
  ]
}

function buildItemOptions(groupIndex) {
  const g = menu[groupIndex]
  return [
    ...g.items.map((item) => ({
      value: item,
      label: item.label,
      hint: `${item.cmd} ${item.args.join(" ")}`,
    })),
    { value: "__back", label: "← 返回分组", hint: "Esc" },
  ]
}

function runMenuItem(item) {
  console.log(`\n  执行: ${item.cmd} ${item.args.join(" ")}\n`)
  const result = spawnViaPlatform(item.cmd, item.args, {
    cwd: rootDir,
    stdio: "inherit",
  })
  console.log("")
  if (result.error) {
    p.log.error(`启动失败: ${result.error.message}`)
  } else if (result.status !== 0) {
    p.log.warn(`退出码: ${result.status}`)
  } else {
    p.log.success("完成")
  }
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error("此脚本需要在交互式终端中运行")
    console.error("请直接运行: pnpm start")
    process.exit(1)
  }

  p.intro("Bench 项目控制台")

  // 第一级：选择分组；回车进入下一级。
  while (true) {
    const groupAction = await p.select({
      message: "选择分组(回车进入下一级)",
      options: buildGroupOptions(),
    })

    if (p.isCancel(groupAction) || groupAction === "exit") {
      p.outro("再见")
      process.exit(0)
    }

    const groupIndex = groupAction

    // 第二级：在该分组下选择命令；Esc / 「返回分组」回到第一级。
    while (true) {
      const itemAction = await p.select({
        message: `「${menu[groupIndex].group}」中选择操作`,
        options: buildItemOptions(groupIndex),
      })

      if (p.isCancel(itemAction) || itemAction === "__back") break

      runMenuItem(itemAction)

      // Pause so user can read output before clack redraws the menu.
      await waitForEnter()
    }
  }
}

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question("\n按 Enter 返回菜单...", () => {
      rl.close()
      resolve()
    })
  })
}

main()
