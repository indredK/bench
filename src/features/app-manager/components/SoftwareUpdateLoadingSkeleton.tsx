/**
 * 更新列表加载骨架 / loading skeleton for the update list.
 * 独立小模块: 供 page.tsx 的 Suspense fallback 与 SoftwareUpdateView 复用,
 * 静态引入骨架不会破坏 SoftwareUpdateView 的代码分割 (A2-9)。
 */

export function SoftwareUpdateLoadingSkeleton() {
  return (
    <div
      className="bg-card flex min-h-0 flex-1 flex-col gap-3 rounded-lg border p-4"
      aria-busy="true"
    >
      <div className="bg-muted h-1 w-full animate-pulse rounded-full" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex h-14 items-center gap-3 border-b">
          <div className="bg-muted size-9 animate-pulse rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
            <div className="bg-muted h-2.5 w-1/2 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
