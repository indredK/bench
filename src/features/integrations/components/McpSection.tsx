/**
 * MCP Section / AI 客户端（MCP）: 只做渲染.
 *
 * 探测本机 MCP 客户端，勾选后一键写入 bench-host 配置（保留既有配置，写入前自动备份）。
 */
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { McpTargetStatus } from "@/lib/tauri/types/browser-ext"

export function McpSection({
  targets,
  selected,
  installing,
  onToggle,
  onWrite,
}: {
  targets: McpTargetStatus[]
  selected: string[]
  installing: boolean
  onToggle: (id: string, checked: boolean) => void
  onWrite: () => void
}) {
  const { t } = useTranslation()
  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("integrations.mcp.title")}</h2>
        <Button size="sm" disabled={installing || selected.length === 0} onClick={onWrite}>
          {installing ? <Loader2 size={14} className="animate-spin" /> : null}
          {installing ? t("integrations.mcp.writing") : t("integrations.mcp.write")}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{t("integrations.mcp.hint")}</p>
      {targets.length === 0 ? (
        <p className="text-muted-foreground rounded border border-dashed p-3 text-xs">
          {t("integrations.mcp.empty")}
        </p>
      ) : (
        <div className="grid gap-0.5">
          {targets.map((c) => (
            <label
              key={c.id}
              className="hover:bg-muted/50 flex min-w-0 cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs"
            >
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) => onToggle(c.id, e.target.checked)}
              />
              <span className="shrink-0 font-medium">{c.name}</span>
              {c.benchConfigured ? (
                <Badge
                  variant="outline"
                  className="border-green-300 text-green-700 dark:text-green-300"
                >
                  {t("integrations.mcp.configured")}
                </Badge>
              ) : null}
              <code
                className="text-muted-foreground min-w-0 flex-1 truncate font-mono"
                title={c.configPath}
              >
                {c.configPath}
              </code>
            </label>
          ))}
        </div>
      )}
    </section>
  )
}
