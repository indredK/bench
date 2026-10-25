/**
 * Feature UI / 功能界面: multi-node DNS compare + agent registry.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { GlobalpingMeasurementPanel } from "@/features/network-probe/components/GlobalpingMeasurementPanel"
import type { AgentMutation } from "@/features/network-probe/store"
import type {
  GlobalpingMeasurementKind,
  GlobalpingMeasurementResult,
  MultiNodeDnsResult,
  ProbeNode,
} from "@/lib/tauri/types/network-probe"
import { toast } from "sonner"

interface MultiNodePanelProps {
  loading: boolean
  loadingNodes: boolean
  nodesLoadError: string | null
  result: MultiNodeDnsResult | null
  globalpingResult: GlobalpingMeasurementResult | null
  loadingGlobalping: boolean
  tokenConfigured: boolean | null
  loadingToken: boolean
  savingToken: boolean
  nodes: ProbeNode[]
  agentMutation: AgentMutation | null
  toolEnabled: boolean
  toolStatus?: string
  onCompare: (domain: string) => void
  onRunGlobalping: (
    kind: GlobalpingMeasurementKind,
    target: string,
    method?: string,
  ) => Promise<void>
  onRefreshTokenStatus: () => Promise<boolean | null>
  onSaveToken: (token: string) => Promise<boolean>
  onRemoveToken: () => Promise<boolean>
  onRefreshNodes: () => void
  onAddAgent: (label: string, endpoint: string) => Promise<ProbeNode | null>
  onRemoveAgent: (agentId: string) => Promise<boolean>
}

export function MultiNodePanel({
  loading,
  loadingNodes,
  nodesLoadError,
  result,
  globalpingResult,
  loadingGlobalping,
  tokenConfigured,
  loadingToken,
  savingToken,
  nodes,
  agentMutation,
  toolEnabled,
  toolStatus,
  onCompare,
  onRunGlobalping,
  onRefreshTokenStatus,
  onSaveToken,
  onRemoveToken,
  onRefreshNodes,
  onAddAgent,
  onRemoveAgent,
}: MultiNodePanelProps) {
  const { t } = useTranslation()
  const [domain, setDomain] = useState("example.com")
  const [label, setLabel] = useState("")
  const [endpoint, setEndpoint] = useState("https://")
  const registryBusy = agentMutation !== null
  const nodeListBusy = registryBusy || loadingNodes

  const addAgent = async () => {
    const node = await onAddAgent(label.trim(), endpoint.trim())
    if (!node) return
    setLabel("")
    if (node.reachable) toast.success(t("networkProbe.nodes.agentAdded"))
    else toast.info(t("networkProbe.nodes.agentAddedUnreachable"))
  }

  const removeAgent = async (agentId: string) => {
    if (await onRemoveAgent(agentId)) toast.success(t("networkProbe.nodes.agentRemoved"))
  }

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
            <CommandHint hint={t("networkProbe.cmd.refreshNodes")}>
              <Button
                type="button"
                variant="outline"
                disabled={nodeListBusy}
                onClick={onRefreshNodes}
              >
                {loadingNodes
                  ? t("networkProbe.nodes.refreshing")
                  : nodesLoadError
                    ? t("networkProbe.nodes.retryRefresh")
                    : t("networkProbe.nodes.refresh")}
              </Button>
            </CommandHint>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t("networkProbe.nodes.listTitle")}</p>
            <ul className="space-y-1 font-mono text-xs" aria-busy={nodeListBusy}>
              {loadingNodes ? (
                <li role="status" className="text-muted-foreground">
                  {t("networkProbe.nodes.checking")}
                </li>
              ) : null}
              {!loadingNodes && nodesLoadError ? (
                <li role="alert" className="text-destructive text-xs">
                  {t("networkProbe.nodes.loadFailed")}
                </li>
              ) : null}
              {!loadingNodes && !nodesLoadError && nodes.length === 0 ? (
                <li role="status" className="text-muted-foreground">
                  {t("networkProbe.nodes.empty")}
                </li>
              ) : null}
              {nodes.map((n) => {
                const kindLabel =
                  n.kind === "local"
                    ? t("networkProbe.nodes.kindLocal")
                    : n.kind === "remote-proxy"
                      ? t("networkProbe.nodes.kindRemoteProxy")
                      : n.kind === "remote-agent"
                        ? t("networkProbe.nodes.kindRemoteAgent")
                        : t("networkProbe.nodes.kindUnknown")
                const statusLabel = n.reachable
                  ? t("networkProbe.nodes.reachable")
                  : t("networkProbe.nodes.unreachable")
                const nodeLabel = n.kind === "local" ? t("networkProbe.nodes.kindLocal") : n.label

                return (
                  <li key={n.id} className="flex w-full flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 break-all" title={n.endpoint ?? nodeLabel}>
                      {nodeLabel}
                      {n.kind === "local" ? "" : ` · ${kindLabel}`}
                      {n.endpoint ? ` · ${n.endpoint}` : ""}
                    </span>
                    <span
                      className={
                        n.reachable
                          ? "text-xs text-emerald-700 dark:text-emerald-400"
                          : "text-destructive text-xs"
                      }
                      role="status"
                      aria-label={statusLabel}
                    >
                      {statusLabel}
                    </span>
                    {n.kind === "remote-agent" ? (
                      <CommandHint hint={t("networkProbe.cmd.removeAgent")}>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={registryBusy}
                          onClick={() => void removeAgent(n.id)}
                        >
                          {agentMutation?.kind === "remove" && agentMutation.agentId === n.id
                            ? t("networkProbe.nodes.removingAgent")
                            : t("networkProbe.nodes.removeAgent")}
                        </Button>
                      </CommandHint>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">{t("networkProbe.nodes.addTitle")}</p>
            <p id="network-probe-agent-endpoint-hint" className="text-muted-foreground text-xs">
              {t("networkProbe.nodes.addHint")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-[10rem]"
                value={label}
                disabled={registryBusy}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("networkProbe.nodes.labelPlaceholder")}
                aria-label={t("networkProbe.nodes.labelPlaceholder")}
              />
              <Input
                className="min-w-[16rem] flex-1"
                value={endpoint}
                disabled={registryBusy}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={t("networkProbe.nodes.endpointPlaceholder")}
                aria-label={t("networkProbe.nodes.endpointPlaceholder")}
                aria-describedby="network-probe-agent-endpoint-hint"
              />
              <CommandHint hint={t("networkProbe.cmd.addAgent")}>
                <Button
                  type="button"
                  disabled={!label.trim() || !endpoint.trim() || registryBusy}
                  onClick={() => void addAgent()}
                >
                  {agentMutation?.kind === "add"
                    ? t("networkProbe.nodes.addingAgent")
                    : t("networkProbe.nodes.addAgent")}
                </Button>
              </CommandHint>
            </div>
          </div>
        </>
      }
    >
      <GlobalpingMeasurementPanel
        result={globalpingResult}
        loading={loadingGlobalping}
        tokenConfigured={tokenConfigured}
        loadingToken={loadingToken}
        savingToken={savingToken}
        onRun={onRunGlobalping}
        onRefreshTokenStatus={onRefreshTokenStatus}
        onSaveToken={onSaveToken}
        onRemoveToken={onRemoveToken}
      />
      {result ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs" role="status" aria-live="polite">
            {t("networkProbe.nodes.meta", {
              domain: result.domain,
              count: result.answers.length,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          <ul aria-label={t("networkProbe.nodes.answersLabel")} className="space-y-2 text-sm">
            {result.answers.map((answer) => {
              const responseCode = answer.statusCodeName?.toUpperCase()
              const statusLabel =
                responseCode === "NXDOMAIN"
                  ? t("networkProbe.nodes.answerNotFound")
                  : responseCode === "NOERROR" && answer.answers.length === 0
                    ? t("networkProbe.nodes.answerNoRecords")
                    : answer.errorCode === "timed_out"
                      ? t("networkProbe.nodes.answerTimedOut")
                      : t(
                          answer.ok
                            ? "networkProbe.nodes.answerOk"
                            : "networkProbe.nodes.answerFail",
                        )

              return (
                <li key={answer.nodeId} className="rounded-md border px-3 py-2">
                  <div className="font-medium">
                    {answer.nodeId === "local"
                      ? t("networkProbe.nodes.kindLocal")
                      : answer.nodeLabel}{" "}
                    <span
                      className={
                        answer.ok
                          ? "font-mono text-xs text-emerald-700 dark:text-emerald-400"
                          : "text-destructive font-mono text-xs"
                      }
                      role="status"
                    >
                      {statusLabel}
                    </span>
                  </div>
                  {answer.answers.length > 0 ? (
                    <pre className="text-muted-foreground mt-1 overflow-auto font-mono text-xs">
                      {answer.answers.join("\n")}
                    </pre>
                  ) : null}
                  {answer.detail ? (
                    <details className="text-muted-foreground mt-1 text-xs">
                      <summary className="cursor-pointer">
                        {t("networkProbe.nodes.technicalDetails")}
                      </summary>
                      <pre className="mt-1 overflow-auto font-mono">{answer.detail}</pre>
                    </details>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {loading ? t("networkProbe.nodes.resultsLoading") : t("networkProbe.nodes.resultsEmpty")}
        </p>
      )}
    </ProbePanelShell>
  )
}
