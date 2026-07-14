# System Settings 技术设计

> 本文记录平台边界和新增设置规则；实际键位与命令以 Rust adapter 和 IPC 契约为准。

## 1. 模块职责

System Settings 提供受控的系统开关、快捷入口、设置搜索和应用授权，不直接复制 macOS 系统设置。

| 层                  | 位置                                                        |
| ------------------- | ----------------------------------------------------------- |
| 页面/组件           | `src/features/system-settings/`                             |
| use-case/repository | `services/`                                                 |
| 操作 hook           | `hooks/useSettingAction.ts`                                 |
| 后端 adapter        | `src-tauri/src/system_settings/`                            |
| IPC                 | `src/lib/tauri/commands/system-settings.ts`、`contracts.ts` |

后端按领域拆分为 finder、dock、display、keyboard、network、privacy、screenshot、login items、quick actions 和 system toggles。平台差异不得散落到 JSX。

## 2. UI 与状态

- `page.tsx` 负责组合搜索、分区和平台 capability。
- `SettingToggle` 是统一二值设置组件；复杂设置使用对应 section。
- `search-index.ts` 保存语言无关 canonical 条目，渲染时通过 i18n 获取文案。
- `useSettingAction` 统一 loading、成功/失败反馈和 read-after-write。
- store 只保存共享 UI 状态和已读取设置，不承担命令编排。

设置读取失败必须保留 unknown/error 状态，禁止回退为 `false` 误导用户。

## 3. 平台与权限边界

- 桌面能力通过 capability 层判断，组件不检查 `window.__TAURI__`。
- macOS TCC、辅助功能、自动化权限不足时返回稳定错误并提供系统设置入口。
- 需要 System Events/AppleScript 的操作必须设置 timeout，并在失败时提示用户手动处理。
- 涉及 Gatekeeper、登录项、隐私授权等高影响操作必须二次确认。
- 不支持的平台显示 unsupported，不显示为当前设置关闭。

## 4. 写入可靠性

系统设置写入按以下流程执行：

```text
读取当前值 -> 执行受控 adapter -> 重新读取 -> 比较目标值 -> 更新 UI/报告失败
```

- 命令参数必须结构化传递，禁止 renderer 提交 shell 字符串。
- `defaults` 仅用于已验证的 domain/key；不能根据 UI 名称猜键位。
- Tahoe 等系统版本中失效的 defaults key 应改用受控 AppleScript/System Events adapter，或标记 unsupported。
- 写入后读取不一致必须视为失败，不能乐观显示成功。

## 5. 搜索与国际化

- 搜索索引使用 canonical id、section 和关键词 key；中文/英文文案在渲染期生成。
- 浏览器、系统面板和枚举值不得以中文作为 canonical value。
- 长设置名称使用 `min-w-0 + truncate + title`；长动作使用图标按钮和 Tooltip。
- 新增 key 必须同步 zh/en，并覆盖语言切换行为。

## 6. 设置分区

- Display/Dock：显示、Dock、菜单栏和低电量相关设置。
- Keyboard：键盘与快捷操作。
- Lock/Sleep：锁屏、睡眠和唤醒行为。
- Quick Actions：常用系统面板和动作。
- App Authorization：Gatekeeper/quarantine 等应用授权流程。

具体分区由 `components/sections/` 维护；不要在 `page.tsx` 堆叠单项实现。

## 7. 新增设置流程

1. 在目标 macOS/Windows 版本上确认真实控制接口。
2. 在对应 Rust 领域 adapter 增加 read/write，返回结构化错误。
3. 同步 IPC 双边契约和类型化 wrapper。
4. 在 repository/use-case 接线，再接入 section。
5. 增加 i18n、权限/unsupported/失败态和行为测试。
6. 更新 `roadmap.md`，只保留仍未完成的候选。

## 8. 键位映射与排查规则

- 映射的真理源是 `src-tauri/src/system_settings/`，文档不复制易过时的 key 表。
- 新键位必须在目标系统上通过“读取基线 -> 手动切换 -> 再读取 -> diff”确认。
- `defaults read` 看到的值不等于可写；必须验证写入后系统 UI 和再次读取均变化。
- cfprefsd 缓存、ByHost domain、容器化 plist 和布尔/枚举类型差异必须纳入排查。
- 无法稳定控制时保留只读状态或系统设置跳转，不实现虚假开关。

## 9. 验证

- [ ] `pnpm run lint:fe` 和 `pnpm run test:critical` 通过。
- [ ] 目标系统版本完成 read/write/read smoke。
- [ ] 权限拒绝、unsupported、timeout 和读取失败均有 UI。
- [ ] IPC 命令在 TS/Rust 两侧同步，生产路径无 unwrap/expect。
