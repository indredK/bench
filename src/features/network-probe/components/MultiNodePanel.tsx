/**
 * Feature UI / 功能界面: Globalping DNS/ping/HTTP comparison + agent registry.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { NetworkProbeAgentMutation } from "@/features/network-probe/store"
import type {
  GlobalpingTokenStatus,
  MultiNodeMeasurementType,
  MultiNodeProbeResult,
  ProbeNode,
} from "@/lib/tauri/types/network-probe"

const LOCATION_PRESETS = ["world", "US", "Europe", "Asia"] as const
type LocationPreset = (typeof LOCATION_PRESETS)[number]

function isValidHttpTarget(target: string): boolean {
  if (!target || target.length > 2048) return false
  try {
    const url = new URL(target)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.hash
    )
  } catch {
    return false
  }
}

interface MultiNodePanelProps {
  loading: boolean
  loadingNodes: boolean
  loadingToken: boolean
  agentMutation: NetworkProbeAgentMutation
  result: MultiNodeProbeResult | null
  tokenStatus: GlobalpingTokenStatus
  nodes: ProbeNode[]
  toolEnabled: boolean
  toolStatus?: string
  onMeasure: (target: string, type: MultiNodeMeasurementType, locations: string[]) => void
  onRefreshNodes: () => void
  onSaveToken: (token: string) => Promise<boolean>
  onClearToken: () => void
  onAddAgent: (label: string, endpoint: string) => void
  onRemoveAgent: (agentId: string) => void
}

export function MultiNodePanel({
  loading,
  loadingNodes,
  loadingToken,
  agentMutation,
  result,
  tokenStatus,
  nodes,
  toolEnabled,
  toolStatus,
  onMeasure,
  onRefreshNodes,
  onSaveToken,
  onClearToken,
  onAddAgent,
  onRemoveAgent,
}: MultiNodePanelProps) {
  const { t } = useTranslation()
  const [measurementType, setMeasurementType] = useState<MultiNodeMeasurementType>("dns")
  const [target, setTarget] = useState("example.com")
  const [locations, setLocations] = useState<LocationPreset[]>(["world", "US", "Europe"])
  const [tokenDraft, setTokenDraft] = useState("")
  const [label, setLabel] = useState("")
  const [endpoint, setEndpoint] = useState("https://")

  const targetPlaceholder =
    measurementType === "http"
      ? t("networkProbe.nodes.httpPlaceholder")
      : t("networkProbe.nodes.domainPlaceholder")
  const canAddLocation = locations.length < 3

  function toggleLocation(location: LocationPreset) {
    setLocations((selected) =>
      selected.includes(location)
        ? selected.filter((value) => value !== location)
        : selected.length < 3
          ? [...selected, location]
          : selected,
    )
  }

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.nodes.hint")}</p>
          <p className="text-muted-foreground text-xs">{t("networkProbe.nodes.remotePrivacy")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "multiNode",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-32 flex-col gap-1 text-xs">
              <span>{t("networkProbe.nodes.measurementLabel")}</span>
              <select
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                aria-label={t("networkProbe.nodes.measurementLabel")}
                value={measurementType}
                onChange={(event) => {
                  const next = event.target.value as MultiNodeMeasurementType
                  setMeasurementType(next)
                  if (next === "http" && target.trim() === "example.com") {
                    setTarget("https://example.com")
                  }
                }}
                disabled={loading}
              >
                <option value="dns">{t("networkProbe.nodes.types.dns")}</option>
                <option value="ping">{t("networkProbe.nodes.types.ping")}</option>
                <option value="http">{t("networkProbe.nodes.types.http")}</option>
              </select>
            </label>
            <Input
              className="max-w-sm flex-1"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder={targetPlaceholder}
              aria-label={t("networkProbe.nodes.targetLabel")}
              disabled={loading}
            />
            <CommandHint hint={t("networkProbe.cmd.compareDns")}>
              <Button
                type="button"
                disabled={
                  loading ||
                  loadingToken ||
                  !toolEnabled ||
                  !target.trim() ||
                  locations.length === 0 ||
                  (measurementType === "http" && !isValidHttpTarget(target.trim()))
                }
                onClick={() => onMeasure(target.trim(), measurementType, locations)}
              >
                {loading ? t("networkProbe.nodes.running") : t("networkProbe.nodes.run")}
              </Button>
            </CommandHint>
            <Button
              type="button"
              variant="outline"
              disabled={loadingNodes || agentMutation !== null}
              onClick={onRefreshNodes}
            >
              {t(loadingNodes ? "networkProbe.nodes.refreshing" : "networkProbe.nodes.refresh")}
            </Button>
          </div>

          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-xs font-medium">
              {t("networkProbe.nodes.locationsLabel")}
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {LOCATION_PRESETS.map((location) => {
                const checked = locations.includes(location)
                return (
                  <label key={location} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={loading || (!checked && !canAddLocation)}
                      onChange={() => toggleLocation(location)}
                    />
                    {t(`networkProbe.nodes.locations.${location.toLowerCase()}`)}
                  </label>
                )
              })}
            </div>
            <p className="text-muted-foreground text-xs">{t("networkProbe.nodes.locationsHint")}</p>
          </fieldset>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">{t("networkProbe.nodes.tokenTitle")}</p>
            <p className="text-muted-foreground text-xs">
              {t(
                tokenStatus.configured
                  ? "networkProbe.nodes.tokenConfigured"
                  : "networkProbe.nodes.tokenHint",
              )}
            </p>
            {!tokenStatus.available ? (
              <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
                {t("networkProbe.nodes.tokenUnavailable")}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="min-w-[16rem] flex-1"
                  type="password"
                  autoComplete="new-password"
                  value={tokenDraft}
                  onChange={(event) => setTokenDraft(event.target.value)}
                  placeholder={t("networkProbe.nodes.tokenPlaceholder")}
                  aria-label={t("networkProbe.nodes.tokenTitle")}
                  disabled={loadingToken}
                />
                <Button
                  type="button"
                  disabled={loadingToken || !tokenDraft.trim()}
                  onClick={() => {
                    void onSaveToken(tokenDraft).then((saved) => {
                      if (saved) setTokenDraft("")
                    })
                  }}
                >
                  {t(
                    loadingToken
                      ? "networkProbe.nodes.tokenSaving"
                      : "networkProbe.nodes.tokenSave",
                  )}
                </Button>
                {tokenStatus.configured ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loadingToken}
                    onClick={onClearToken}
                  >
                    {t("networkProbe.nodes.tokenClear")}
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t("networkProbe.nodes.listTitle")}</p>
            {nodes.some((node) => node.kind === "remote-agent") ? (
              <p className="text-muted-foreground text-xs">
                {t("networkProbe.nodes.agentExecutionPending")}
              </p>
            ) : null}
            <ul className="space-y-1 font-mono text-xs">
              {nodes.map((node) => (
                <li key={node.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {node.id === "local" ? t("networkProbe.nodeSelect.local") : node.label} ·{" "}
                    {node.kind}
                    {node.endpoint ? ` · ${node.endpoint}` : ""}
                  </span>
                  {node.kind === "remote-agent" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={loadingNodes || agentMutation !== null}
                      onClick={() => onRemoveAgent(node.id)}
                    >
                      {agentMutation?.action === "remove" && agentMutation.agentId === node.id
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
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t("networkProbe.nodes.labelPlaceholder")}
              />
              <Input
                className="min-w-[16rem] flex-1"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder={t("networkProbe.nodes.endpointPlaceholder")}
              />
              <CommandHint hint={t("networkProbe.cmd.addAgent")}>
                <Button
                  type="button"
                  disabled={
                    loadingNodes || agentMutation !== null || !label.trim() || !endpoint.trim()
                  }
                  onClick={() => onAddAgent(label.trim(), endpoint.trim())}
                >
                  {agentMutation?.action === "add"
                    ? t("networkProbe.nodes.addingAgent")
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
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.nodes.meta", {
              target: result.target,
              type: t(`networkProbe.nodes.types.${result.measurementType}`),
              count: result.results.length,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          <ul className="space-y-2 text-sm">
            {result.results.map((item) => (
              <li key={item.nodeId} className="rounded-md border px-3 py-2">
                <div className="font-medium">
                  {item.nodeId === "local" ? t("networkProbe.nodeSelect.local") : item.nodeLabel}{" "}
                  <span className="font-mono text-xs">
                    {t(item.ok ? "networkProbe.nodes.statusOk" : "networkProbe.nodes.statusFail")}
                  </span>
                </div>
                {!item.ok ? (
                  <p role="status" className="text-muted-foreground mt-1 text-xs">
                    {t("networkProbe.nodes.failedHint")}
                  </p>
                ) : null}
                {item.summary.length > 0 ? (
                  <ul className="text-muted-foreground mt-1 space-y-0.5 font-mono text-xs">
                    {item.summary.map((line, index) => (
                      <li key={`${item.nodeId}-${index}`}>
                        {t(`networkProbe.nodes.metrics.${line.key}`, { value: line.value })}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {item.detail ? (
                  <details className="text-xs">
                    <summary className="text-muted-foreground mt-1 cursor-pointer">
                      {t("networkProbe.nodes.technicalDetails")}
                    </summary>
                    <pre className="text-muted-foreground bg-muted/40 mt-1 max-h-48 overflow-auto rounded p-2 font-mono break-words whitespace-pre-wrap">
                      {item.detail}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
