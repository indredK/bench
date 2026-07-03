# Port Manager 技术设计

> 视角：技术 / 实现。产品功能见 [features.md](./features.md)；迭代规划见 [roadmap.md](./roadmap.md)。

## 目录

1. [模块架构](#1-模块架构)
2. [状态管理](#2-状态管理)
3. [端口检查](#3-端口检查)
4. [虚拟化架构](#4-虚拟化架构)
5. [端口历史持久化](#5-端口历史持久化)
6. [占用告警 Hook](#6-占用告警-hook)
7. [通知插件](#7-通知插件)
8. [远程模式 UI 行为](#8-远程模式-ui-行为)
9. [后端模块结构](#9-后端模块结构)
10. [API 契约](#10-api-契约)

---

## 1. 模块架构

### 1.1 前端文件结构

```
src/features/port-manager/
├── feature.tsx                       路由元数据
├── page.tsx                          主页面
├── PortManagerPageContent.tsx        页面内容（含虚拟化、Bell 切换）
├── PortManagerControls.tsx           顶部控制栏（Local/Remote 切换、远程主机输入）
├── store.ts                          Zustand store
├── use-cases.ts                      业务用例
├── usePortManagerController.ts       控制器（含虚拟化 + scrollToIndex）
├── usePortHistory.ts                 端口历史 hook（localStorage）
├── usePortOccupationAlerts.ts        占用告警 hook（30s 轮询）
└── services/
    ├── port-manager.repository.ts
    └── port-manager.use-cases.ts

src/lib/tauri/commands/port-manager.ts     Tauri 命令契约
```

### 1.2 分层约定

- UI 组件 → `usePortManagerController.ts`（编排虚拟化与滚动）→ `use-cases.ts` → `repository.ts` → Tauri invoke → Rust `commands.rs`
- 阻塞 I/O 通过 `tokio::task::spawn_blocking` 隔离
- 错误在 IPC 边界归一为 `Result<T, String>`

---

## 2. 状态管理

实现在 `store.ts`，使用 Zustand。

### 2.1 关键字段

```typescript
interface PortManagerState {
  // 扫描模式
  scanMode: PortScanMode;              // "local" | "remote"
  remoteHost: string;                   // 远程主机地址

  // 端口数据
  port: number | null;
  scanResult: PortDetail[] | null;      // 扫描结果列表
  loading: boolean;
  error: string | null;

  // 端口历史（最近 10 个）
  history: number[];                    // 仅端口号，不含主机

  // 占用告警
  alertsEnabled: boolean;
  baseline: PortDetail[] | null;        // 启用告警时记录的基线
}

type PortScanMode = "local" | "remote";
```

### 2.2 状态流

```
UI 输入端口号 → setPort + scanMode
  ↓
use-cases.scan() → repository.scanPort(port, scanMode, remoteHost)
  ↓
setLoading(true) → invoke → setLoading(false) + setScanResult
  ↓
扫描成功 → pushHistory(port) → 持久化 localStorage
  ↓
若 alertsEnabled → usePortOccupationAlerts 比对 baseline
```

---

## 3. 端口检查

### 3.1 双模式抽象

```typescript
// repository.ts
async function scanPort(port: number, mode: PortScanMode, remoteHost?: string): Promise<PortDetail[]> {
  if (mode === "local") {
    return invoke("scan_local_port", { port });
  } else {
    return invoke("scan_remote_port", { port, host: remoteHost });
  }
}
```

### 3.2 mapPortCheckToDetail

后端返回的原始结构经 `mapPortCheckToDetail` 映射为前端统一 `PortDetail`：

```typescript
interface PortDetail {
  port: number;
  status: "occupied" | "free";
  process: {
    pid: number;
    name: string;
    command: string;        // 完整命令行
    user: string;
    startTime: string;
    memoryMb?: number;
  } | null;                 // status === "free" 时为 null
  children?: PortDetail[];  // 子进程（进程树）
}
```

### 3.3 Local 端口检查

Rust 端使用 `lsof` / `netstat` 等系统命令，通过 `tokio::process::Command` 执行：
- `lsof -i :<port> -P -n` 获取占用进程
- `ps -p <pid> -o pid,ppid,user,command,lstart,rss` 获取进程详情
- 解析输出为 `PortDetail` 列表

### 3.4 Remote 端口检查

远程模式下通过 TCP connect 探测：
- 使用 `tokio::net::TcpStream::connect((host, port))` 探测
- 连接成功 → 端口占用（但无法获取进程详情）
- 连接失败 → 端口空闲
- 设置超时（默认 3 秒）避免阻塞

**注意**：远程模式无法获取占用进程详情，UI 仅显示端口状态（占用 / 空闲），不显示进程信息。

---

## 4. 虚拟化架构

实现在 `usePortManagerController.ts`，使用 `@tanstack/react-virtual`。

### 4.1 useVirtualizer 配置

```typescript
import { useVirtualizer } from "@tanstack/react-virtual";

const rowVirtualizer = useVirtualizer({
  count: scanResult.length,
  getScrollElement: () => scrollContainerRef.current,
  estimateSize: () => 48,          // 默认行高 48px
  measureElement: (el) => el.getBoundingClientRect().height,  // 动态测量
  overscan: 5,                      // 上下缓冲 5 行
});
```

### 4.2 动态行高

- `estimateSize` 提供初始估计（48px）
- `measureElement` 在 DOM 渲染后实测行高
- 长命令行换行时行高自动调整
- 上下缓冲 `overscan: 5` 保证滚动时不出现空白

### 4.3 scrollToIndex

从端口历史点击时调用 `rowVirtualizer.scrollToIndex(index, { align: "start" })`，自动滚动到对应行。

### 4.4 性能指标

| 场景 | 行数 | 渲染行数 | 帧率 |
|------|------|---------|------|
| 单端口查询 | 1-10 | 全部 | 60fps |
| 端口范围查询 | 100-1000 | ~10-15（可视区域+缓冲） | 60fps |
| 大量 PID 列表 | 1000+ | ~10-15 | 60fps |

---

## 5. 端口历史持久化

实现在 `usePortHistory.ts`。

### 5.1 localStorage 存储

```typescript
const STORAGE_KEY = "bench.port-manager.history";
const MAX_HISTORY = 10;

function loadHistory(): number[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveHistory(history: number[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}
```

### 5.2 pushHistory 逻辑

```typescript
function pushHistory(port: number) {
  const current = loadHistory();
  // 去重：移除已存在的同端口号
  const filtered = current.filter(p => p !== port);
  // 头部插入
  const next = [port, ...filtered].slice(0, MAX_HISTORY);
  saveHistory(next);
}
```

### 5.3 集成点

- 扫描成功后调用 `pushHistory(port)`
- UI 历史按钮弹出列表，点击项触发 `setPort + scan`

---

## 6. 占用告警 Hook

实现在 `usePortOccupationAlerts.ts`。

### 6.1 接口

```typescript
interface UsePortOccupationAlertsOptions {
  port: number | null;
  scanMode: PortScanMode;
  remoteHost?: string;
  enabled: boolean;            // alertsEnabled
  baseline: PortDetail[] | null;
  onAlert: (alert: PortOccupationAlert) => void;
}

interface PortOccupationAlert {
  type: "occupied" | "freed";
  port: number;
  process?: { pid: number; name: string };
}
```

### 6.2 轮询逻辑

```typescript
useEffect(() => {
  if (!enabled || !port) return;

  const interval = setInterval(async () => {
    const current = await scanPort(port, scanMode, remoteHost);
    const diff = diffPortDetail(baseline, current);

    diff.forEach(alert => {
      onAlert(alert);
      sendNotification(alert);  // 调用通知插件
    });

    setBaseline(current);  // 更新基线
  }, 30_000);  // 30 秒

  return () => clearInterval(interval);
}, [enabled, port, scanMode, remoteHost, baseline]);
```

### 6.3 基线比对

```typescript
function diffPortDetail(baseline: PortDetail[], current: PortDetail[]): PortOccupationAlert[] {
  const alerts: PortOccupationAlert[] = [];

  // 端口从空闲 → 占用
  for (const c of current) {
    if (c.status === "occupied") {
      const b = baseline.find(b => b.port === c.port);
      if (!b || b.status === "free") {
        alerts.push({ type: "occupied", port: c.port, process: c.process });
      }
    }
  }

  // 端口从占用 → 空闲
  for (const b of baseline) {
    if (b.status === "occupied") {
      const c = current.find(c => c.port === b.port);
      if (!c || c.status === "free") {
        alerts.push({ type: "freed", port: b.port });
      }
    }
  }

  return alerts;
}
```

### 6.4 启用流程

1. 用户点击 Bell 图标 → `setAlertsEnabled(true)`
2. 立即触发一次扫描作为基线 → `setBaseline(current)`
3. 启动 30 秒轮询
4. 每次轮询结果与基线 diff → 推送通知 → 更新基线

### 6.5 禁用流程

1. 用户点击 BellOff 图标 → `setAlertsEnabled(false)`
2. `clearInterval` 停止轮询
3. `setBaseline(null)` 清空基线

---

## 7. 通知插件

### 7.1 依赖

```json
// package.json
"@tauri-apps/plugin-notification": "^2.3.3"
```

```toml
# src-tauri/Cargo.toml
tauri-plugin-notification = "2"
```

### 7.2 注册

```rust
// src-tauri/src/lib.rs
tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    // ...
```

```json
// src-tauri/capabilities/default.json
"permissions": [
  "notification:default",
  "notification:allow-notify"
]
```

### 7.3 前端调用

```typescript
import { sendNotification } from "@tauri-apps/plugin-notification";

function notifyOccupied(port: number, processName: string) {
  sendNotification({
    title: t("portManager.alert.occupiedTitle"),       // "端口已被占用"
    body: t("portManager.alert.occupiedBody", { port, processName }),  // "端口 8080 已被进程 node 占用"
  });
}

function notifyFreed(port: number) {
  sendNotification({
    title: t("portManager.alert.freedTitle"),          // "端口已释放"
    body: t("portManager.alert.freedBody", { port }),  // "端口 8080 已释放"
  });
}
```

---

## 8. 远程模式 UI 行为

### 8.1 PortManagerControls 切换

```tsx
<Tabs value={scanMode} onValueChange={setScanMode}>
  <TabsTrigger value="local">{t("portManager.mode.local")}</TabsTrigger>
  <TabsTrigger value="remote">{t("portManager.mode.remote")}</TabsTrigger>
</Tabs>

{scanMode === "remote" && (
  <Input
    value={remoteHost}
    onChange={e => setRemoteHost(e.target.value)}
    placeholder="example.com 或 1.2.3.4"
  />
)}
```

### 8.2 Kill 按钮显示控制

```tsx
// PortManagerPageContent.tsx
{scanMode === "local" && row.process && (
  <Button variant="destructive" onClick={() => handleKill(row.process.pid)}>
    {t("portManager.kill")}
  </Button>
)}
```

### 8.3 远程模式限制

| 能力 | Local | Remote |
|------|:-----:|:------:|
| 端口扫描 | ✅ | ✅ |
| 进程详情 | ✅ | ❌（仅状态） |
| Kill 进程 | ✅ | ❌ |
| 端口历史 | ✅ | ✅（共用） |
| 占用告警 | ✅ | ✅ |
| 进程树 | ✅ | ❌ |

---

## 9. 后端模块结构

```
src-tauri/src/port_manager/
├── mod.rs             模块入口
├── commands.rs        Tauri 命令实现
├── processes.rs       进程信息查询（lsof / ps 解析）
├── fingerprints.rs    端口指纹（识别服务类型）
├── types.rs           数据模型
└── lib.rs             模块导出
```

### 9.1 关键函数

| 函数 | 职责 |
|------|------|
| `scan_local_port(port: u16)` | 调用 `lsof` 获取本机端口占用 |
| `scan_remote_port(host: String, port: u16)` | TCP connect 探测远程端口 |
| `kill_process(pid: u32)` | 通过 `kill -TERM` 终止进程 |
| `get_process_tree(pid: u32)` | 通过 `ps` 解析父子关系 |
| `identify_fingerprint(port: u16, banner: Option<String>)` | 端口指纹识别（如 80=http, 443=https, 5432=postgresql） |

---

## 10. API 契约

### 10.1 Tauri 命令清单

| 命令 | 说明 |
|------|------|
| `scan_local_port(port)` | 扫描本机端口占用 |
| `scan_remote_port(host, port)` | 扫描远程端口状态 |
| `kill_process(pid)` | 终止进程（仅 local） |
| `get_process_tree(pid)` | 获取进程树 |

### 10.2 前端调用链

```
PortManagerPageContent
  ↓ usePortManagerController (虚拟化编排)
  ↓ use-cases.scan()
  ↓ repository.scanPort()
  ↓ invoke("scan_local_port" | "scan_remote_port")
  ↓ Rust commands.rs
```

---

## 11. 性能与可维护性

### 11.1 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐⚬ | 控制器模式清晰 |
| 功能完备度 | ⭐⭐⭐⭐⚬ | 扫描 / kill / 进程树 / 指纹 / 历史 / 告警完整 |
| 用户体验 | ⭐⭐⭐⭐⭐ | kill 二次确认 + 后果文案、状态指示 |
| 性能 | ⭐⭐⭐⚬⚬ | 大 PID 列表进程树计算可能退化（虚拟化已解决渲染） |
| 测试覆盖 | ⭐⭐⭐⭐⭐ | PortManager + ports + fingerprints |
| 可维护性 | ⭐⭐⭐⭐⚬ | Rust fingerprints 模块独立 |

### 11.2 已知瓶颈

- 进程树父子关系计算：大量 PID 时 `get_process_tree` 需多次调用 `ps`，未做批量优化
- 远程端口扫描超时：默认 3 秒，主机不可达时仍需等待

详见 [roadmap.md](./roadmap.md) v1.17 进程树性能优化。
