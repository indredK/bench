# 项目审计报告

基于 [docs/coding-standards.md](/Users/apple/Documents/github/tauri-app/docs/coding-standards.md) 对当前仓库进行静态审计后的问题清单。

## 审计结论

- 当前问题已完成修复并重新验证。
- 前端 `build:fe` 通过。
- 前端测试 `test:fe` 通过，`14` 个文件 / `67` 个用例全部通过。
- 后端 `check:be` 通过。
- 后端测试 `test:be` 通过，`214` 个用例全部通过。

本报告保留原始风险分析，同时补充修复结果，便于后续追踪。

## 修复状态

- `BUG-01` 已修复：`api_billing` 已统一收敛到“构造快照 -> 持久化成功 -> 发布内存态”的提交模型，消除了“先改 live state 再 save”带来的状态撕裂风险。
- `BUG-02` 已修复：`app-manager` 后端已增加批次级互斥，前端已基于 `batchProgress.running` 阻止重复触发，并联动禁用批量按钮。
- `BUG-03` 已修复：共享 UI 层已移除硬编码英文，改为统一消费 locale key。
- `BUG-04` 已修复：`terminology` / `token-calculator` 模块级文案已接入 i18n 单一来源，同时补齐缺失词条。

---

## BUG-01

### 1. 风险点 (Risk)

**[后端]** `api_billing` 命令层存在“先修改内存态，再执行持久化”的写法，持久化失败时会把进程内状态和磁盘状态打裂，多个 key 分步保存时还会产生部分提交。

- `src-tauri/src/api_billing/commands.rs:128-148`
- `src-tauri/src/api_billing/commands.rs:151-180`
- `src-tauri/src/api_billing/commands.rs:183-220`
- `src-tauri/src/api_billing/commands.rs:529-606`
- `src-tauri/src/api_billing/storage.rs:109-139`

具体表现：

- `create_station` / `update_station` 先改 `state.stations`，再 `save_stations(...)`。
- `delete_station` 先同步删内存里的 `stations/accounts/secrets`，再分 3 次保存。
- `import_relay_data` 先把导入结果 `extend` 到内存，再依次保存 `stations/accounts/secrets`。

一旦 `store.save()` 在任一环节失败，命令会返回错误，但内存已被改写，后续 `list_*` 读到的是“未持久化成功”的新状态；更糟的是，多 key 顺序保存时，磁盘上可能只写成功一部分。

### 2. 严重性 (Severity)

**High**

### 3. 深度重构 (Refactor)

这个仓库里其实已经有正确范式，`terminology/storage.rs:261-279` 和 `token_calculator/storage.rs:82-112` 都采用了“复制 -> 修改副本 -> 先保存 -> 再发布到内存”的模式。`api_billing` 应该收敛到同一模式：

```rust
struct ApiBillingSnapshot {
    stations: Vec<RelayStation>,
    accounts: Vec<StationAccount>,
    secrets: HashMap<String, EncryptedBlob>,
}

fn save_snapshot<R: Runtime>(
    app: &AppHandle<R>,
    snapshot: &ApiBillingSnapshot,
) -> ApiBillingResult<()> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| ApiBillingError::store_fail(format!("open store: {e}")))?;

    store.set(KEY_STATIONS, serde_json::json!(&snapshot.stations));
    store.set(KEY_ACCOUNTS, serde_json::json!(&snapshot.accounts));
    store.set(KEY_SECRETS, serde_json::json!(&snapshot.secrets));
    store.save()
        .map_err(|e| ApiBillingError::store_fail(format!("save snapshot: {e}")))?;

    Ok(())
}

fn with_state_mut<R: Runtime, F, T>(
    app: &AppHandle<R>,
    state: &ApiBillingState,
    f: F,
) -> ApiBillingResult<T>
where
    F: FnOnce(&mut ApiBillingSnapshot) -> ApiBillingResult<T>,
{
    let mut stations = state.stations.lock().unwrap();
    let mut accounts = state.accounts.lock().unwrap();
    let mut secrets = state.secrets.lock().unwrap();

    let mut next = ApiBillingSnapshot {
        stations: stations.clone(),
        accounts: accounts.clone(),
        secrets: secrets.clone(),
    };

    let result = f(&mut next)?;
    save_snapshot(app, &next)?;

    *stations = next.stations;
    *accounts = next.accounts;
    *secrets = next.secrets;

    Ok(result)
}
```

然后让 `create_station`、`delete_station`、`import_relay_data`、`set_password` 等写命令全部走 `with_state_mut(...)`，彻底移除“先改 live state，再 save”的路径。

### 4. 设计理念 (Philosophy)

这是典型的**原子性**和**容错性**问题。桌面本地应用没有数据库事务兜底时，命令层就必须自己提供“提交前快照 + 成功后发布”的一致性边界。否则一旦落盘失败，用户会同时遇到两种幻觉：

- UI 明明提示失败，但列表已经变了。
- 当前进程里的数据和重启后的数据不是同一个世界。

这类问题不会靠“多写几个 catch”解决，只能靠提交模型重构。

---

## BUG-02

### 1. 风险点 (Risk)

**[后端] / [前端]** `app-manager` 的批量升级/卸载缺少“批次级互斥”，第二个批次可以覆盖第一个批次的取消标记和进度状态。

- 后端：
  - `src-tauri/src/app_manager/state.rs:108-130`
- 前端：
  - `src/features/app-manager/hooks/useAppManagerController.ts:544-555`
  - `src/features/app-manager/page.tsx:437-443`

核心问题有两层：

1. `start_batch_operation()` 无论当前是否已有批次在跑，都会直接覆盖 `batch_cancel`。
2. 前端启动批处理时，只写入了 `batchProgress`，但没有基于 `batchProgress.running` 阻止再次发起批处理；页面上的批量按钮也只是按选中数量禁用，不按“当前批次是否在运行”禁用。

结果就是：

- 第二个批次会把第一个批次的取消句柄顶掉。
- “取消当前批次”只能取消最新一次启动的批次，前一个批次可能继续跑。
- 前端只有一份 `batchProgress` / `batchResults`，两个批次会相互覆盖结果。

对于升级/卸载这种破坏性操作，这不是视觉瑕疵，而是实打实的状态冲突。

### 2. 严重性 (Severity)

**High**

### 3. 深度重构 (Refactor)

后端先收口为单批次互斥：

```rust
pub enum BatchStartError {
    Busy,
}

pub fn start_batch_operation(&self) -> Result<Arc<AtomicBool>, BatchStartError> {
    let mut guard = self.batch_cancel.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_some() {
        return Err(BatchStartError::Busy);
    }

    let flag = Arc::new(AtomicBool::new(false));
    *guard = Some(flag.clone());
    Ok(flag)
}
```

命令层显式返回批次占用错误：

```rust
let cancel_flag = state
    .start_batch_operation()
    .map_err(|_| "BATCH_RUNNING".to_string())?;
```

前端再补 UI 侧互斥：

```ts
const batchRunning = useAppManagerStore((s) => Boolean(s.batchProgress?.running));

const runBatchOperation = useCallback(async (kind: "upgrade" | "uninstall", ids: string[]) => {
  if (ids.length === 0 || useAppManagerStore.getState().batchProgress?.running) return;

  useAppManagerStore.setState({
    batchProgress: createBatchProgress(ids.length),
    batchResults: null,
  });

  const outcome = await appManagerUseCases.runBatchOperation(kind, ids);
  if (!outcome) return;

  useAppManagerStore.setState(
    outcome.result ? createBatchSuccessPatch(outcome.result) : createBatchErrorPatch(outcome.error)
  );
}, []);
```

页面按钮也应联动禁用：

```tsx
<ToolbarButton
  icon={<Trash2 size={15} />}
  tooltip={`${t("appManager.batchUninstall")} (${selectedUninstallable})`}
  disabled={selectedUninstallable === 0 || batchRunning}
  onClick={handleBatchUninstall}
/>
```

### 4. 设计理念 (Philosophy)

这条本质上是**并发冲突**问题。批量升级/卸载属于“单写者”场景，允许并发进入就会同时破坏：

- 取消语义
- 进度语义
- 结果归属

真正可靠的设计不是“希望用户别点太快”，而是前后端同时承认：同一时间只能存在一个批次写操作。

---

## BUG-03

### 1. 风险点 (Risk)

**[前端]** 共享 UI 层仍然存在大量硬编码英文文案，切换到中文后会直接混入英文，破坏当前项目宣称的双语能力。

代表性位置：

- `src/components/content/ContentView.tsx:83-98`
- `src/components/content/VirtualGridView.tsx:81-85`
- `src/components/content/VirtualDataTable.tsx:102-105`
- `src/components/layout/DetailPanel.tsx:22,45,52,74-76`
- `src/components/ui/dialog.tsx:81-90`
- `src/components/common/AboutDialog.tsx:39,45,69`
- `src/components/layout/CustomTitlebar.tsx:123,136,149`

这些位置的问题不完全相同，但后果一致：

- 有些是直接硬编码英文：`Loading...`、`No items to display`、`Select an item to view details`、`Close`。
- 有些是 `t("key", "English fallback")`，而 locale 文件里并没有对应 key，等价于把英文内联到了渲染层。

因为这些文件都位于共享层和壳层，它们不是“一个页面没翻译”，而是会把所有依赖它们的 feature 都拖入混合语言状态。

### 2. 严重性 (Severity)

**Medium**

### 3. 深度重构 (Refactor)

共享组件应该要么消费统一 i18n key，要么把文案通过 props 注入，而不是就地写死英文。

以 `ContentView` 为例：

```tsx
import { useTranslation } from "react-i18next";

export function ContentView<T>({
  emptyText,
  loading = false,
  ...props
}: ContentViewProps<T>) {
  const { t } = useTranslation();

  if (loading && data.length === 0) {
    return (
      <div className="...">
        <RefreshCw size={28} className="animate-spin text-primary" />
        <p className="text-sm">{t("common.loading")}</p>
      </div>
    );
  }

  if (!loading && data.length === 0) {
    return (
      <div className="...">
        {emptyIcon ?? <Search size={32} className="opacity-30" />}
        <p>{emptyText ?? t("common.empty.noData")}</p>
      </div>
    );
  }
}
```

`Dialog` 和 `DetailPanel` 也同理：

```tsx
const { t } = useTranslation();
<span className="sr-only">{t("common.actions.close")}</span>
<p className="text-xs text-muted-foreground">{t("common.loading")}</p>
<p className="text-sm">{t("common.empty.selectItem")}</p>
```

对于 `AboutDialog` / `CustomTitlebar`，需要先把缺失 key 补进 locale 文件，再移除内联 fallback：

```tsx
title={t("titlebar.minimize")}
{t("about.close")}
```

### 4. 设计理念 (Philosophy)

国际化最怕的不是“漏了一个页面”，而是**共享层失守**。一旦公共组件把英文写死，所有上层 feature 都会无条件继承这个漏洞，最后审计和翻译维护都失真。

“文案唯一来源”不是形式主义，它是为了防止：

- locale 文件和渲染层双份拷贝漂移
- 中文界面里夹英文
- 无障碍文本和视觉文本出现不同语言

---

## BUG-04

### 1. 风险点 (Risk)

**[前端]** `terminology` 和 `token-calculator` 仍有模块级文案直接写死在页面中，没有走 locale 文件单一来源。

代表性位置：

- `src/features/terminology/page.tsx:58-76`
- `src/features/terminology/page.tsx:153-159`
- `src/features/terminology/page.tsx:186-194`
- `src/features/terminology/page.tsx:899-901`
- `src/features/token-calculator/page.tsx:198-205`

具体表现：

- `toastTerminologyError(...)` 里直接写死 `"输入不合法"`、`"目标不存在"`、默认 `"名称已存在"`。
- 卡片交互里直接写死 `"已复制"`、`"取消置顶"`、`"置顶"`、`"复制标题"`。
- `TokenCalculatorPage` 载入失败时直接 `toast.error("Failed to load pricing standards")`。

这会导致：

- 中文和英文环境都无法保证完整翻译。
- 同类文案无法统一复用，后续审计时也无法确认哪一份才是权威版本。

### 2. 严重性 (Severity)

**Medium**

### 3. 深度重构 (Refactor)

把错误分类与文案 key 分离，而不是把自然语言写在 helper 里：

```tsx
function toastTerminologyError(
  t: TFunction,
  error: unknown,
  fallbackKey: string,
) {
  const code = getTauriErrorCode(error);

  const key =
    code === "DUPLICATE_NAME"
      ? "terminology.toasts.duplicateName"
      : code === "INVALID_INPUT"
        ? "terminology.toasts.invalidInput"
        : code === "NOT_FOUND"
          ? "terminology.toasts.targetNotFound"
          : fallbackKey;

  toast.error(t(key));
}
```

调用点统一改为：

```tsx
toast.success(t("terminology.toasts.copied"));

<button title={t(isPinned ? "terminology.actions.unpin" : "terminology.actions.pin")}>
  ...
</button>

toast.error(t("tokenCalculator.toasts.loadFailed"));
```

### 4. 设计理念 (Philosophy)

模块级 i18n 之所以也要收口，是因为**国际化缺失**不只是“有没有翻译文件”，而是“业务文案是否只有一个可信来源”。

一旦 helper、toast、title 属性里都各自写一份自然语言：

- 翻译无法统一维护
- 评审无法判断哪些文案是死代码
- 同一语义在不同 feature 里会越长越散

这类问题短期不崩，但会持续拉低整个前端层的可维护性。

---

## 备注

- 本轮未把“纯样式建议”或“理论上可以更优雅”的点写入报告。
- 当前报告优先收录会影响**状态一致性、并发安全、国际化完整性**的真实问题。
