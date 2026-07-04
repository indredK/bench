import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const menu = [
  {
    group: "开发",
    items: [
      { key: "dev", label: "启动 Tauri 开发模式(前端+后端)", cmd: "pnpm", args: ["run", "dev"] },
      { key: "dev:fe", label: "仅启动前端 Vite 开发服务器", cmd: "pnpm", args: ["run", "dev:fe"] },
      { key: "build", label: "构建生产版本(Release)", cmd: "pnpm", args: ["run", "build"] },
      { key: "build:debug", label: "构建调试版本(Debug)", cmd: "pnpm", args: ["run", "build:debug"] },
      { key: "build:fe", label: "仅构建前端", cmd: "pnpm", args: ["run", "build:fe"] },
    ],
  },
  {
    group: "环境",
    items: [
      { key: "setup", label: "一键安装(前端+后端依赖)", cmd: "pnpm", args: ["run", "setup"] },
      { key: "clean", label: "清理所有依赖与构建产物", cmd: "pnpm", args: ["run", "clean"] },
      { key: "hooks:install", label: "重新配置 Git 钩子", cmd: "pnpm", args: ["run", "hooks:install"] },
    ],
  },
  {
    group: "检查与测试",
    items: [
      { key: "check:be", label: "后端 cargo check", cmd: "pnpm", args: ["run", "check:be"] },
      { key: "clippy:be", label: "后端 clippy(警告视为错误)", cmd: "pnpm", args: ["run", "clippy:be"] },
      { key: "lint:fe", label: "前端类型检查 + i18n 守卫", cmd: "pnpm", args: ["run", "lint:fe"] },
      { key: "test:fe", label: "前端单元测试", cmd: "pnpm", args: ["run", "test:fe"] },
      { key: "test:be", label: "后端 cargo test", cmd: "pnpm", args: ["run", "test:be"] },
      { key: "test", label: "前后端全部测试", cmd: "pnpm", args: ["run", "test"] },
      { key: "verify", label: "完整验证(测试+构建)", cmd: "pnpm", args: ["run", "verify"] },
      { key: "check:precommit", label: "手动运行 pre-commit 检查", cmd: "pnpm", args: ["run", "check:precommit"] },
    ],
  },
  {
    group: "清理(细粒度)",
    items: [{ key: "clean:be", label: "仅清理后端构建产物(target)", cmd: "pnpm", args: ["run", "clean:be"] }],
  },
];

const options = [
  ...menu.flatMap((g, gi) => {
    const header = {
      value: `__group_${gi}`,
      label: `── ${g.group} ──`,
      hint: "",
      disabled: true,
    };
    const items = g.items.map((item) => ({
      value: item,
      label: `  ${item.label}`,
      hint: `${item.cmd} ${item.args.join(" ")}`,
    }));
    return [header, ...items];
  }),
  { value: "__group_exit", label: "── 其他 ──", hint: "", disabled: true },
  { value: "exit", label: "  退出", hint: "Esc / Ctrl+C" },
];

const firstSelectable = options.find((o) => !o.disabled)?.value;

function runCommand(item) {
  console.log(`\n  执行: ${item.cmd} ${item.args.join(" ")}\n`);
  const result = spawnSync(item.cmd, item.args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });
  console.log("");
  if (result.error) {
    p.log.error(`启动失败: ${result.error.message}`);
  } else if (result.status !== 0) {
    p.log.warn(`退出码: ${result.status}`);
  } else {
    p.log.success("完成");
  }
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error("此脚本需要在交互式终端中运行");
    console.error("请直接运行: pnpm start");
    process.exit(1);
  }

  p.intro("Bench 项目控制台");

  // Loop: pick a command, run it, return to menu.
  while (true) {
    const action = await p.select({
      message: "选择要执行的操作",
      options,
      initialValue: firstSelectable,
    });

    if (p.isCancel(action) || action === "exit") {
      p.outro("再见");
      process.exit(0);
    }

    runCommand(action);

    // Pause so user can read output before clack redraws the menu.
    await waitForEnter();
  }
}

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question("\n按 Enter 返回菜单...", () => {
      rl.close();
      resolve();
    });
  });
}

main();
