# UX 设计规范

> 从实际开发中沉淀的用户体验规范。AI 在开发新功能前**必须**阅读本文，确保 UX 一致性。

规则级别：**强制** = 必须遵守 / **建议** = 有收益但不硬门槛。

---

## 1. 页面布局

### 1.1 一屏式布局（左导航 + 右内容）

- **强制**: 含多个子功能页面的 feature 采用左导航栏 + 右内容区布局，不使用顶部大卡片 + 按钮网格的纵向堆叠。
- **强制**: 外层容器 `flex h-full overflow-hidden`，只有内容区内部滚动（`overflow-y-auto`），整体页面不滚动。
- **强制**: 侧边栏固定宽度（`w-44` ~ `w-48`），使用 `shrink-0`；内容区 `flex-1 min-w-0`。

```tsx
<div className="flex h-full overflow-hidden">
  <nav className="flex w-44 shrink-0 flex-col border-r">
    {/* 导航项 */}
  </nav>
  <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {/* 内容 */}
    </div>
  </div>
</div>
```

### 1.2 垂直空间控制

- **强制**: 页面头部/工具栏压缩到单行（标题 + 操作按钮），不使用大卡片包裹标题 + 副标题。
- **建议**: Card 的 `CardHeader` 使用 `py-2` ~ `py-2.5`，标题 `text-sm`。
- **建议**: 子功能页面（如清理记录、自定义文件夹）移除 Card 包裹，直接渲染内容——侧边栏已表明当前功能。

---

## 2. 加载状态与渐进展示

### 2.1 首次加载骨架屏

- **强制**: 需要异步获取数据才能展示的页面，首次加载时显示骨架屏（skeleton），不留空白。
- **强制**: 骨架屏使用 `animate-pulse` + `bg-muted` 占位块，形状与实际内容一致（摘要条、色块条、图例网格等）。

```tsx
{isScanning && !data && (
  <div className="flex flex-col gap-3 animate-pulse">
    <div className="bg-muted h-5 w-28 rounded" />
    <div className="bg-muted h-4 w-full rounded-full" />
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-muted h-10 rounded-lg" />
      ))}
    </div>
  </div>
)}
```

### 2.2 自动首次加载

- **强制**: 组件挂载时如果没有数据且未加载中，自动触发加载（`useEffect` + 条件检查），不需要用户手动点击。

```tsx
useEffect(() => {
  if (!data && !isLoading && canUsePlatform) {
    loadData()
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

### 2.3 重新加载态（已有旧数据，正在刷新）

- **强制**: 重新加载时旧数据保持可见但半透明（`opacity-50`），顶部显示进度指示条。
- **强制**: 不使用全屏 loading 遮罩覆盖已有数据。

```tsx
{isScanning && data && (
  <div className="bg-primary/30 h-0.5 w-full animate-pulse rounded-full" />
)}
<div className={cn("transition-opacity", isScanning && "opacity-50")}>
  {/* 正常数据渲染 */}
</div>
```

---

## 3. 异步非阻塞

- **强制**: Rust 后端的耗时操作（磁盘扫描、文件遍历等）必须通过 `async fn` + `tauri::async_runtime::spawn_blocking` 执行，不得阻塞 UI。
- **强制**: 同一模块内有多个独立耗时子任务时，使用 `std::thread::scope` 并行执行，总耗时 ≈ 最慢单个任务。
- **强制**: 前端异步按钮必须有 loading 态（spinner + disabled），防止重复点击。

---

## 4. 多语言文本溢出处理

### 4.1 文本截断

- **强制**: 所有可能因多语言而超长的文本使用 `truncate` + `title` 属性，确保省略号显示且 hover 可见完整内容。

```tsx
<span className="truncate" title={fullText}>{fullText}</span>
```

- **强制**: 在 flex 容器中使用 `truncate` 时，元素必须有 `min-w-0` 或 `overflow-hidden`，否则 `truncate` 不生效。

### 4.2 长文案按钮

- **强制**: "在系统设置中打开"等长文案按钮改为 icon-only + Tooltip，避免按钮过宽。

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon-sm" onClick={handler}>
      <ExternalLink size={14} />
    </Button>
  </TooltipTrigger>
  <TooltipContent>{t("longActionLabel")}</TooltipContent>
</Tooltip>
```

### 4.3 侧边栏导航

- **强制**: 侧边栏导航项文本使用 `truncate`，图标使用 `shrink-0`，防止长语言文本撑破布局。

---

## 5. 紧凑化设计

### 5.1 内联列表替代独立卡片

- **建议**: 辅助信息（如优化建议、统计摘要）不使用独立 Card 包裹，改为紧凑内联列表，减少垂直高度。
- **建议**: 列表项使用 `text-xs` + `py-0.5`，图标缩小到 `size={11}` ~ `size={12}`。

### 5.2 图例/标签网格

- **建议**: 分类图例使用 `grid-cols-2 sm:grid-cols-3 gap-1.5`，每项 `p-1.5`，文本 `text-[11px]`。
- **建议**: 色块缩小到 `h-2.5 w-2.5`，间距紧凑。

### 5.3 操作按钮

- **建议**: 扫描/刷新等操作按钮使用 `size="xs"` 或 `size="sm"`，配合小图标 `size={12}`。
- **建议**: 刷新按钮可简化为 icon-only ghost button（`<RefreshCw size={14} />`）。

---

## 6. 滚动行为

- **强制**: 整体页面不滚动（`overflow-hidden` 外层），只有内容区或列表内部滚动（`overflow-y-auto`）。
- **强制**: 列表容器使用 `min-h-0 flex-1 overflow-y-auto`，确保在有限空间内滚动。
- **建议**: 工具栏/筛选栏使用 `shrink-0` 固定不被压缩。

---

## 7. 空状态与错误状态

- **强制**: 数据为空时显示明确的空状态提示（图标 + 文案），不留空白区域。
- **强制**: 加载失败时显示错误信息 + 重试按钮。
- **建议**: 空状态居中显示，`text-muted-foreground text-sm`，配适当 `padding`。

---

## 8. Checklist（开发新功能前对照）

在开发新的 feature 页面之前，逐项检查：

- [ ] 布局：是否采用左导航 + 右内容一屏式？整体页面不滚动？
- [ ] 加载：首次加载有骨架屏？自动触发加载？重新加载时旧数据半透明 + 进度条？
- [ ] 异步：Rust 耗时操作走 `spawn_blocking`？前端按钮有 loading 态？
- [ ] 文本：所有可能超长的文本有 `truncate` + `title`？长文案按钮改为 icon + Tooltip？
- [ ] 紧凑：头部/工具栏压缩到单行？辅助信息不用大 Card？
- [ ] 滚动：列表容器 `overflow-y-auto`？工具栏 `shrink-0`？
- [ ] 状态：有空状态、错误状态、加载状态的 UI？
