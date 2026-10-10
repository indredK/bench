/**
 * Feature UI / 功能界面: multi-node DNS compare + agent registry.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { TechnicalDetails } from "@/features/network-probe/components/TechnicalDetails"
import type { NetworkProbeAgentAction } from "@/features/network-probe/store"
import { getProbeNodeDisplayLabel } from "@/features/network-probe/utils/probe-node-label"
import type { MultiNodeDnsResult, ProbeNode } from "@/lib/tauri/types/network-probe"

type AgentEndpointError = "invalid" | "scheme" | "credentials" | null

function getNodeKindKey(kind: string): "remoteProxy" | "remoteAgent" | "unknown" {
  switch (kind) {
    case "remote-proxy":
      return "remoteProxy"
    case "remote-agent":
      return "remoteAgent"
    default:
      return "unknown"
  }
}

function getAgentEndpointError(endpoint: string): AgentEndpointError {
  const value = endpoint.trim()
  if (!value) return null

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return "invalid"
  }

  if (url.protocol !== "https:" && url.protocol !== "wss:") return "scheme"
  if (url.username || url.password || value.includes("?") || value.includes("#")) {
    return "credentials"
  }
  return null
}

interface MultiNodePanelProps {
  loading: boolean
  loadingNodes: boolean
  agentAction: NetworkProbeAgentAction | null
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
  const [endpointTouched, setEndpointTouched] = useState(false)
  const endpointError = getAgentEndpointError(endpoint)
  const showEndpointError = endpointTouched && endpointError !== null
  const nodeKindsById = useMemo(() => new Map(nodes.map((node) => [node.id, node.kind])), [nodes])

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
              aria-label={t("networkProbe.nodes.domainPlaceholder")}
              disabled={loading}
            />
            <CommandHint hint={t("networkProbe.cmd.compareDns")}>
              <Button
                type="button"
                disabled={
                  loading || loadingNodes || agentAction !== null || !toolEnabled || !domain.trim()
                }
                onClick={() => onCompare(domain.trim())}
              >
                {loading ? t("networkProbe.nodes.running") : t("networkProbe.nodes.run")}
              </Button>
            </CommandHint>
            <Button
              type="button"
              variant="outline"
              disabled={loadingNodes || agentAction !== null}
              onClick={onRefreshNodes}
            >
              {loadingNodes ? t("networkProbe.nodes.refreshing") : t("networkProbe.nodes.refresh")}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{t("networkProbe.nodes.listTitle")}</p>
              {loadingNodes ? (
                <p role="status" className="text-muted-foreground text-xs">
                  {t("networkProbe.nodes.loading")}
                </p>
              ) : null}
            </div>
            <ul className="space-y-1 font-mono text-xs">
              {nodes.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {getProbeNodeDisplayLabel(n.kind, n.label, t("networkProbe.nodeSelect.local"))}
                    {n.kind === "local"
                      ? ""
                      : ` · ${t(`networkProbe.nodes.kind.${getNodeKindKey(n.kind)}`)}`}
                    {n.kind === "remote-agent" && n.endpoint ? ` · ${n.endpoint}` : ""}
                  </span>
                  {n.kind === "remote-agent" ? (
                    <span
                      role="status"
                      className={
                        n.reachable
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-muted-foreground"
                      }
                    >
                      {n.reachable
                        ? t("networkProbe.nodes.agentReachable")
                        : t("networkProbe.nodes.agentUnreachable")}
                    </span>
                  ) : null}
                  {n.kind === "remote-agent" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={loadingNodes || agentAction !== null}
                      onClick={() => onRemoveAgent(n.id)}
                    >
                      {agentAction?.kind === "remove" && agentAction.agentId === n.id
                        ? t("networkProbe.nodes.removingAgent")
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
                aria-label={t("networkProbe.nodes.labelPlaceholder")}
                maxLength={80}
              />
              <Input
                className="min-w-[16rem] flex-1"
                value={endpoint}
                onChange={(e) => {
                  setEndpointTouched(true)
                  setEndpoint(e.target.value)
                }}
                placeholder={t("networkProbe.nodes.endpointPlaceholder")}
                aria-label={t("networkProbe.nodes.endpointPlaceholder")}
                aria-invalid={showEndpointError}
                aria-describedby={
                  showEndpointError ? "network-probe-agent-endpoint-error" : undefined
                }
                maxLength={2048}
              />
              <CommandHint hint={t("networkProbe.cmd.addAgent")}>
                <Button
                  type="button"
                  disabled={
                    loadingNodes ||
                    agentAction !== null ||
                    !label.trim() ||
                    !endpoint.trim() ||
                    endpointError !== null
                  }
                  onClick={() => onAddAgent(label.trim(), endpoint.trim())}
                >
                  {agentAction?.kind === "add"
                    ? t("networkProbe.nodes.addingAgent")
                    : t("networkProbe.nodes.addAgent")}
                </Button>
              </CommandHint>
            </div>
            {showEndpointError ? (
              <p
                id="network-probe-agent-endpoint-error"
                role="alert"
                className="text-destructive text-xs"
              >
                {t(`networkProbe.nodes.endpointError.${endpointError}`)}
              </p>
            ) : null}
          </div>
        </>
      }
    >
      {result ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.nodes.meta", {
              domain: result.domain,
              count: result.answers.length,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          {result.answers.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {result.answers.map((a) => (
                <li key={a.nodeId} className="rounded-md border px-3 py-2">
                  <div className="font-medium">
                    {getProbeNodeDisplayLabel(
                      nodeKindsById.get(a.nodeId) ?? (a.nodeId === "local" ? "local" : undefined),
                      a.nodeLabel,
                      t("networkProbe.nodeSelect.local"),
                    )}{" "}
                    <span
                      className={
                        a.ok
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-amber-700 dark:text-amber-400"
                      }
                    >
                      {t(`networkProbe.nodes.status.${a.ok ? "success" : "failed"}`)}
                    </span>
                  </div>
                  {a.answers.length > 0 ? (
                    <pre className="text-muted-foreground mt-1 overflow-auto font-mono text-xs">
                      {a.answers.join("\n")}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t("networkProbe.nodes.noAnswers")}
                    </p>
                  )}
                  <TechnicalDetails
                    title={t("networkProbe.nodes.technicalDetails")}
                    items={[{ label: t("networkProbe.nodes.diagnostic"), value: a.detail }]}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="text-muted-foreground text-sm">
              {t("networkProbe.nodes.noResults")}
            </p>
          )}
          <TechnicalDetails
            title={t("networkProbe.nodes.technicalDetails")}
            items={[{ label: t("networkProbe.nodes.command"), value: result.commandHint }]}
          />
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
