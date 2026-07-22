/**
 * Feature UI / 功能界面: multi-node DNS compare + agent registry.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { MultiNodeDnsResult, ProbeNode } from "@/lib/tauri/types/network-probe"

interface MultiNodePanelProps {
  loading: boolean
  loadingNodes: boolean
  result: MultiNodeDnsResult | null
  nodes: ProbeNode[]
  toolEnabled: boolean
  toolStatus?: string
  onCompare: (domain: string) => void
  onRefreshNodes: () => void
  onAddAgent: (label: string, endpoint: string) => void
  onRemoveAgent: (agentId: string) => void
}

export function MultiNodePanel({
  loading,
  loadingNodes,
  result,
  nodes,
  toolEnabled,
  toolStatus,
  onCompare,
  onRefreshNodes,
  onAddAgent,
  onRemoveAgent,
}: MultiNodePanelProps) {
  const { t } = useTranslation()
  const [domain, setDomain] = useState("example.com")
  const [label, setLabel] = useState("")
  const [endpoint, setEndpoint] = useState("https://")

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("networkProbe.nodes.hint")}</p>
      {!toolEnabled ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("networkProbe.caps.toolDisabled", {
            tool: "multiNode",
            status: toolStatus ?? "unsupported",
          })}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder={t("networkProbe.nodes.domainPlaceholder")}
        />
        <CommandHint hint={t("networkProbe.cmd.compareDns")}>
          <Button
            type="button"
            disabled={loading || !toolEnabled || !domain.trim()}
            onClick={() => onCompare(domain.trim())}
          >
            {loading ? t("networkProbe.nodes.running") : t("networkProbe.nodes.run")}
          </Button>
        </CommandHint>
        <Button type="button" variant="outline" disabled={loadingNodes} onClick={onRefreshNodes}>
          {t("networkProbe.nodes.refresh")}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("networkProbe.nodes.listTitle")}</p>
        <ul className="max-h-40 space-y-1 overflow-auto font-mono text-xs">
          {nodes.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-2">
              <span>
                {n.label} · {n.kind}
                {n.endpoint ? ` · ${n.endpoint}` : ""}
              </span>
              {n.kind === "remote-agent" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onRemoveAgent(n.id)}
                >
                  {t("networkProbe.nodes.removeAgent")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">{t("networkProbe.nodes.addTitle")}</p>
        <p className="text-muted-foreground text-xs">{t("networkProbe.nodes.addHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-[10rem]"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("networkProbe.nodes.labelPlaceholder")}
          />
          <Input
            className="min-w-[16rem] flex-1"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder={t("networkProbe.nodes.endpointPlaceholder")}
          />
          <CommandHint hint={t("networkProbe.cmd.addAgent")}>
            <Button
              type="button"
              disabled={!label.trim() || !endpoint.trim()}
              onClick={() => onAddAgent(label.trim(), endpoint.trim())}
            >
              {t("networkProbe.nodes.addAgent")}
            </Button>
          </CommandHint>
        </div>
      </div>

      {result ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.nodes.meta", {
              domain: result.domain,
              count: result.answers.length,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          <ul className="max-h-72 space-y-2 overflow-auto text-sm">
            {result.answers.map((a) => (
              <li key={a.nodeId} className="rounded-md border px-3 py-2">
                <div className="font-medium">
                  {a.nodeLabel} <span className="font-mono text-xs">{a.ok ? "OK" : "FAIL"}</span>
                </div>
                {a.answers.length > 0 ? (
                  <pre className="text-muted-foreground mt-1 overflow-auto font-mono text-xs">
                    {a.answers.join("\n")}
                  </pre>
                ) : null}
                {a.detail ? <p className="text-muted-foreground mt-1 text-xs">{a.detail}</p> : null}
              </li>
            ))}
          </ul>
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </div>
  )
}
