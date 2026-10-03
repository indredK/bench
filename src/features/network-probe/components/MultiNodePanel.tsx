/**
 * Feature UI / 功能界面: multi-node DNS compare + agent registry.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { VirtualizedResultList } from "@/features/network-probe/components/VirtualizedResultList"
import type { MultiNodeDnsResult, ProbeNode } from "@/lib/tauri/types/network-probe"

interface MultiNodePanelProps {
  loading: boolean
  loadingNodes: boolean
  agentAction: "add" | `remove:${string}` | null
  nodesLoadFailed: boolean
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
  agentAction,
  nodesLoadFailed,
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
    <ProbePanelShell
      toolbar={
        <>
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
            <Button
              type="button"
              variant="outline"
              disabled={loadingNodes}
              onClick={onRefreshNodes}
            >
              {loadingNodes
                ? t("networkProbe.nodes.refreshingAction")
                : t("networkProbe.nodes.refresh")}
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t("networkProbe.nodes.listTitle")}</p>
            {loadingNodes || nodesLoadFailed || nodes.length === 0 ? (
              <p className="text-muted-foreground text-xs" role="status" aria-live="polite">
                {loadingNodes
                  ? nodes.length > 0
                    ? t("networkProbe.nodes.refreshing")
                    : t("networkProbe.nodes.loading")
                  : nodesLoadFailed
                    ? t("networkProbe.nodes.loadFailed")
                    : t("networkProbe.nodes.empty")}
              </p>
            ) : null}
            <ul
              className="max-h-72 space-y-1 overflow-auto font-mono text-xs"
              aria-label={t("networkProbe.nodes.listTitle")}
              aria-busy={loadingNodes}
            >
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
                      disabled={loadingNodes}
                      onClick={() => onRemoveAgent(n.id)}
                    >
                      {agentAction === `remove:${n.id}`
                        ? t("networkProbe.nodes.working")
                        : t("networkProbe.nodes.removeAgent")}
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
                  disabled={loadingNodes || !label.trim() || !endpoint.trim()}
                  onClick={() => onAddAgent(label.trim(), endpoint.trim())}
                >
                  {agentAction === "add"
                    ? t("networkProbe.nodes.working")
                    : t("networkProbe.nodes.addAgent")}
                </Button>
              </CommandHint>
            </div>
          </div>
        </>
      }
    >
      {result ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs" role="status" aria-live="polite">
            {t("networkProbe.nodes.meta", {
              domain: result.domain,
              count: result.answers.length,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          <VirtualizedResultList
            items={result.answers}
            getKey={(answer) => answer.nodeId}
            ariaLabel={t("networkProbe.nodes.answersLabel")}
            className="space-y-2 text-sm"
            itemClassName="rounded-md border px-3 py-2"
            estimatedItemHeight={72}
            renderItem={(a) => (
              <>
                <div className="font-medium">
                  {a.nodeLabel}{" "}
                  <span
                    className={`font-mono text-xs ${a.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
                  >
                    {a.statusCodeName?.toUpperCase() === "NXDOMAIN"
                      ? t("networkProbe.nodes.answerNotFound")
                      : a.statusCodeName?.toUpperCase() === "NOERROR" && a.answers.length === 0
                        ? t("networkProbe.nodes.answerNoRecords")
                        : a.errorCode === "GLOBALPING_TIMEOUT"
                          ? t("networkProbe.nodes.answerTimedOut")
                          : a.ok
                            ? t("networkProbe.nodes.answerOk")
                            : t("networkProbe.nodes.answerFailed")}
                  </span>
                </div>
                {a.answers.length > 0 ? (
                  <pre className="text-muted-foreground mt-1 overflow-auto font-mono text-xs">
                    {a.answers.join("\n")}
                  </pre>
                ) : null}
                {a.detail ? (
                  <details className="text-muted-foreground mt-1 text-xs">
                    <summary className="cursor-pointer">
                      {t("networkProbe.nodes.technicalDetails")}
                    </summary>
                    <pre className="mt-1 overflow-auto font-mono">{a.detail}</pre>
                  </details>
                ) : null}
              </>
            )}
          />
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
