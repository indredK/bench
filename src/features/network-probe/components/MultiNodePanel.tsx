/**
 * Feature UI / 功能界面: Globalping measurements + agent registry.
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { getProbeNodeDisplayLabel } from "@/features/network-probe/utils/probe-node-label"
import type { AgentMutation, ProbeNodesLoadStatus } from "@/features/network-probe/store"
import type {
  AgentMeasurementResult,
  GlobalpingMeasurementResult,
  GlobalpingMeasurementType,
  GlobalpingProbeResult,
  ProbeNode,
} from "@/lib/tauri/types/network-probe"

const LOCATION_OPTIONS = [
  { value: "world", labelKey: "networkProbe.nodes.locationWorld" },
  { value: "US", labelKey: "networkProbe.nodes.locationUs" },
  { value: "Europe", labelKey: "networkProbe.nodes.locationEurope" },
  { value: "Asia", labelKey: "networkProbe.nodes.locationAsia" },
] as const

const MEASUREMENT_OPTIONS: { value: GlobalpingMeasurementType; labelKey: string }[] = [
  { value: "dns", labelKey: "networkProbe.nodes.modeDns" },
  { value: "ping", labelKey: "networkProbe.nodes.modePing" },
  { value: "http", labelKey: "networkProbe.nodes.modeHttp" },
]

const MAX_SELF_HOSTED_AGENTS = 10

function hasUrlAuthorityUserInfo(value: string) {
  const authority = value.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/iu)?.[1]
  return authority?.includes("@") ?? false
}

function isBlockedRemoteTargetHost(value: string) {
  const host = value
    .trim()
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "")
    .toLowerCase()
  if (
    ["metadata", "metadata.google.internal", "instance-data.ec2.internal", "localhost"].includes(
      host,
    ) ||
    host.endsWith(".localhost")
  ) {
    return true
  }
  const ipv4 = host.split(".").map((part) => Number(part))
  if (
    ipv4.length === 4 &&
    ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    ((ipv4[0] === 169 && ipv4[1] === 254) || ipv4[0] === 127)
  ) {
    return true
  }
  if (host === "::1" || /^fe[89ab][\da-f]:/u.test(host)) return true
  if (/^::ffff:/u.test(host)) {
    const mapped = host.slice("::ffff:".length)
    if (
      /^a9fe(?::[\da-f]{1,4})?$/u.test(mapped) ||
      /^169\.254\./u.test(mapped) ||
      /^7f[\da-f]{2}:/u.test(mapped) ||
      /^127\./u.test(mapped)
    ) {
      return true
    }
  }
  return false
}

function AgentMeasurementSummary({ result }: { result: AgentMeasurementResult }) {
  const { t } = useTranslation()
  const { probe } = result
  return (
    <div className="bg-muted/40 space-y-1 rounded p-2 text-xs" role="status">
      <p className="font-medium">
        {t(`networkProbe.nodes.measurementStatus.${result.status}`)} · {result.target} ·{" "}
        {t("networkProbe.nodes.elapsedMs", { ms: result.elapsedMs.toFixed(0) })}
      </p>
      {result.status === "rate-limited" ? (
        <p className="text-amber-700 dark:text-amber-400">
          {t("networkProbe.nodes.agentRateLimited", {
            seconds: result.retryAfterSeconds ?? "—",
          })}
        </p>
      ) : null}
      {result.measurementType === "dns" && probe.answers.length > 0 ? (
        <p className="break-all">{probe.answers.join(", ")}</p>
      ) : null}
      {result.measurementType === "dns" && probe.dnsRcode ? (
        <p>{t("networkProbe.nodes.dnsResponseCode", { code: probe.dnsRcode })}</p>
      ) : null}
      {result.measurementType === "ping" && probe.avgRttMs !== undefined ? (
        <p>{t("networkProbe.nodes.avgRtt", { ms: probe.avgRttMs.toFixed(2) })}</p>
      ) : null}
      {result.measurementType === "ping" && probe.packetLossPercent !== undefined ? (
        <p>{t("networkProbe.nodes.packetLoss", { percent: probe.packetLossPercent })}</p>
      ) : null}
      {result.measurementType === "ping" && probe.packetsSent !== undefined ? (
        <p>
          {t("networkProbe.nodes.packets", {
            received: probe.packetsReceived ?? 0,
            sent: probe.packetsSent,
          })}
        </p>
      ) : null}
      {result.measurementType === "http" && probe.httpStatusCode !== undefined ? (
        <p>{t("networkProbe.nodes.httpStatus", { code: probe.httpStatusCode })}</p>
      ) : null}
      {result.measurementType === "http" && probe.totalTimeMs !== undefined ? (
        <p>{t("networkProbe.nodes.httpTiming", { ms: probe.totalTimeMs.toFixed(0) })}</p>
      ) : null}
    </div>
  )
}

interface MultiNodePanelProps {
  loading: boolean
  loadingNodes: boolean
  nodesStatus: ProbeNodesLoadStatus
  agentMutation: AgentMutation
  result: GlobalpingMeasurementResult | null
  agentMeasurementResults: Record<string, AgentMeasurementResult>
  agentMeasurementLoadingById: Record<string, boolean>
  nodes: ProbeNode[]
  toolEnabled: boolean
  toolStatus?: string
  onRunMeasurement: (
    measurementType: GlobalpingMeasurementType,
    target: string,
    locations: string[],
  ) => void
  onGetTokenStatus: () => Promise<boolean | null>
  onSaveToken: (token: string) => Promise<boolean>
  onClearToken: () => Promise<boolean>
  onRefreshNodes: () => void
  onAddAgent: (label: string, endpoint: string, token: string) => Promise<boolean>
  onSetAgentToken: (agentId: string, token: string) => Promise<boolean>
  onRemoveAgent: (agentId: string) => Promise<boolean>
  onRunAgentMeasurement: (
    agentId: string,
    measurementType: GlobalpingMeasurementType,
    target: string,
  ) => Promise<AgentMeasurementResult | null>
}

export function MultiNodePanel({
  loading,
  loadingNodes,
  nodesStatus,
  agentMutation,
  result,
  agentMeasurementResults,
  agentMeasurementLoadingById,
  nodes,
  toolEnabled,
  toolStatus,
  onRunMeasurement,
  onGetTokenStatus,
  onSaveToken,
  onClearToken,
  onRefreshNodes,
  onAddAgent,
  onSetAgentToken,
  onRemoveAgent,
  onRunAgentMeasurement,
}: MultiNodePanelProps) {
  const { t } = useTranslation()
  const [measurementType, setMeasurementType] = useState<GlobalpingMeasurementType>("dns")
  const [target, setTarget] = useState("example.com")
  const [locations, setLocations] = useState<string[]>(["world"])
  const [label, setLabel] = useState("")
  const [endpoint, setEndpoint] = useState("")
  const [agentToken, setAgentToken] = useState("")
  const [agentTokenDrafts, setAgentTokenDrafts] = useState<Record<string, string>>({})
  const [savedAgentTokenId, setSavedAgentTokenId] = useState<string | null>(null)
  const [agentToRemove, setAgentToRemove] = useState<ProbeNode | null>(null)
  const [token, setToken] = useState("")
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null)
  const [tokenStatusLoading, setTokenStatusLoading] = useState(true)
  const [tokenSaving, setTokenSaving] = useState(false)
  const [removeTokenOpen, setRemoveTokenOpen] = useState(false)
  const [tokenMessageKey, setTokenMessageKey] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    setTokenStatusLoading(true)
    void onGetTokenStatus().then((configured) => {
      if (!current) return
      setTokenConfigured(configured)
      setTokenStatusLoading(false)
    })
    return () => {
      current = false
    }
  }, [onGetTokenStatus])

  const nodesLoading = loadingNodes || nodesStatus === "idle" || nodesStatus === "loading"
  const endpointErrorKey = (() => {
    if (!endpoint.trim()) return null
    try {
      const value = endpoint.trim()
      const url = new URL(value)
      if (url.protocol !== "https:") return "networkProbe.nodes.endpointHttpsOnly"
      if (
        url.username ||
        url.password ||
        hasUrlAuthorityUserInfo(value) ||
        value.includes("?") ||
        value.includes("#")
      ) {
        return "networkProbe.nodes.endpointNoCredentials"
      }
      if (!url.hostname) return "networkProbe.nodes.endpointInvalid"
      return null
    } catch {
      return "networkProbe.nodes.endpointInvalid"
    }
  })()
  const targetErrorKey = (() => {
    const value = target.trim()
    if (!value) return "networkProbe.nodes.targetRequired"
    if (Array.from(value).length > 2048) return "networkProbe.nodes.targetTooLong"
    if (measurementType === "http") {
      try {
        const url = new URL(value)
        if (!(["http:", "https:"].includes(url.protocol) && url.hostname)) {
          return "networkProbe.nodes.targetInvalidHttp"
        }
        if (url.username || url.password || hasUrlAuthorityUserInfo(value) || value.includes("#")) {
          return "networkProbe.nodes.targetHttpCredentials"
        }
        if (isBlockedRemoteTargetHost(url.hostname)) {
          return "networkProbe.nodes.targetRemoteBlocked"
        }
        return null
      } catch {
        return "networkProbe.nodes.targetInvalidHttp"
      }
    }
    if (/[\s/\\?#@%,]/u.test(value)) return "networkProbe.nodes.targetInvalidHost"
    if (isBlockedRemoteTargetHost(value)) return "networkProbe.nodes.targetRemoteBlocked"
    return null
  })()

  const toggleLocation = (location: string) => {
    setLocations((selected) => {
      if (selected.includes(location)) {
        return selected.length > 1 ? selected.filter((item) => item !== location) : selected
      }
      return selected.length < 3 ? [...selected, location] : selected
    })
  }

  const handleSaveToken = async () => {
    const value = token.trim()
    if (!value || tokenSaving) return
    setTokenSaving(true)
    setTokenMessageKey(null)
    try {
      if (await onSaveToken(value)) {
        setToken("")
        setTokenConfigured(true)
        setTokenMessageKey("networkProbe.nodes.tokenSaved")
      }
    } finally {
      setTokenSaving(false)
    }
  }

  const handleClearToken = async () => {
    setTokenSaving(true)
    setTokenMessageKey(null)
    try {
      if (await onClearToken()) {
        setTokenConfigured(false)
        setTokenMessageKey("networkProbe.nodes.tokenRemoved")
      }
    } finally {
      setTokenSaving(false)
    }
  }

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.nodes.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "globalping",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}

          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label={t("networkProbe.nodes.modeLabel")}
          >
            {MEASUREMENT_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={measurementType === option.value ? "default" : "outline"}
                aria-pressed={measurementType === option.value}
                disabled={loading}
                onClick={() => {
                  setMeasurementType(option.value)
                  setTokenMessageKey(null)
                }}
              >
                {t(option.labelKey)}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <div className="max-w-2xl min-w-[16rem] flex-1">
              <Input
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder={t(
                  measurementType === "http"
                    ? "networkProbe.nodes.httpTargetPlaceholder"
                    : measurementType === "ping"
                      ? "networkProbe.nodes.pingTargetPlaceholder"
                      : "networkProbe.nodes.domainPlaceholder",
                )}
                aria-label={t("networkProbe.nodes.targetLabel")}
                aria-invalid={Boolean(targetErrorKey)}
                disabled={loading}
              />
              {targetErrorKey ? (
                <p role="alert" className="text-destructive mt-1 text-xs">
                  {t(targetErrorKey)}
                </p>
              ) : null}
            </div>
            <CommandHint hint={t("networkProbe.nodes.commandHint", { mode: measurementType })}>
              <Button
                type="button"
                disabled={
                  loading || !toolEnabled || Boolean(targetErrorKey) || locations.length === 0
                }
                onClick={() => onRunMeasurement(measurementType, target.trim(), locations)}
              >
                {loading ? t("networkProbe.nodes.running") : t("networkProbe.nodes.run")}
              </Button>
            </CommandHint>
            <Button
              type="button"
              variant="outline"
              disabled={
                nodesLoading ||
                agentMutation !== null ||
                Object.values(agentMeasurementLoadingById).some(Boolean)
              }
              onClick={onRefreshNodes}
            >
              {t("networkProbe.nodes.refresh")}
            </Button>
          </div>

          <fieldset className="space-y-2" disabled={loading}>
            <legend className="text-sm font-medium">
              {t("networkProbe.nodes.locationsLabel")}
            </legend>
            <div className="flex flex-wrap items-center gap-2">
              {LOCATION_OPTIONS.map((option) => {
                const selected = locations.includes(option.value)
                return (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={selected ? "secondary" : "outline"}
                    aria-pressed={selected}
                    disabled={!selected && locations.length >= 3}
                    onClick={() => toggleLocation(option.value)}
                  >
                    {t(option.labelKey)}
                  </Button>
                )
              })}
              <span className="text-muted-foreground text-xs">
                {t("networkProbe.nodes.locationCount", { count: locations.length, max: 3 })}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              {t("networkProbe.nodes.locationCostHint")}
            </p>
          </fieldset>

          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              {t("networkProbe.nodes.tokenSettings")}
              <span className="text-muted-foreground ml-2 text-xs">
                {tokenStatusLoading
                  ? t("networkProbe.nodes.tokenChecking")
                  : tokenConfigured === null
                    ? t("networkProbe.nodes.tokenUnavailable")
                    : tokenConfigured
                      ? t("networkProbe.nodes.tokenConfigured")
                      : t("networkProbe.nodes.tokenNotConfigured")}
              </span>
            </summary>
            <div className="mt-3 space-y-2">
              <p className="text-muted-foreground text-xs">{t("networkProbe.nodes.tokenHint")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className="max-w-xl min-w-[16rem] flex-1"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder={t("networkProbe.nodes.tokenPlaceholder")}
                  aria-label={t("networkProbe.nodes.tokenLabel")}
                  disabled={tokenSaving || tokenStatusLoading || tokenConfigured === null}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    tokenSaving || tokenStatusLoading || tokenConfigured === null || !token.trim()
                  }
                  onClick={() => void handleSaveToken()}
                >
                  {tokenSaving
                    ? t("networkProbe.nodes.tokenSaving")
                    : t("networkProbe.nodes.tokenSave")}
                </Button>
                {tokenConfigured ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={tokenSaving}
                    onClick={() => setRemoveTokenOpen(true)}
                  >
                    {t("networkProbe.nodes.tokenRemove")}
                  </Button>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">
                {t("networkProbe.nodes.tokenDashboard")}
              </p>
              {tokenMessageKey ? (
                <p role="status" className="text-xs">
                  {t(tokenMessageKey)}
                </p>
              ) : null}
            </div>
          </details>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("networkProbe.nodes.listTitle")}</p>
          {nodesStatus === "failed" ? (
            <p role="alert" className="text-destructive text-xs">
              {t("networkProbe.nodes.loadFailed")}
            </p>
          ) : null}
          {nodes.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {nodesLoading
                ? t("networkProbe.nodes.loading")
                : nodesStatus === "failed"
                  ? t("networkProbe.nodes.loadFailed")
                  : t("networkProbe.nodes.empty")}
            </p>
          ) : null}
          <ul className="space-y-2 text-xs">
            {nodes.map((node) => (
              <li key={node.id} className="space-y-1 rounded border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 break-words">
                    {getProbeNodeDisplayLabel(node, t)}
                  </span>
                  {node.kind === "remote-agent" ? (
                    <>
                      <span
                        className={
                          node.reachable
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }
                      >
                        {node.reachable
                          ? t("networkProbe.nodes.agentOnline")
                          : t("networkProbe.nodes.agentOffline")}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          agentMutation !== null ||
                          nodesLoading ||
                          Boolean(agentMeasurementLoadingById[node.id])
                        }
                        onClick={() => setAgentToRemove(node)}
                      >
                        {agentMutation?.kind === "remove" && agentMutation.agentId === node.id
                          ? t("networkProbe.nodes.removingAgent")
                          : t("networkProbe.nodes.removeAgent")}
                      </Button>
                    </>
                  ) : null}
                </div>
                {node.kind === "remote-agent" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      maxLength={2048}
                      className="min-w-[14rem] flex-1"
                      value={agentTokenDrafts[node.id] ?? ""}
                      onChange={(event) =>
                        setAgentTokenDrafts((drafts) => ({
                          ...drafts,
                          [node.id]: event.target.value,
                        }))
                      }
                      placeholder={t("networkProbe.nodes.agentTokenPlaceholder")}
                      aria-label={t("networkProbe.nodes.agentTokenInputLabel", {
                        label: node.label,
                      })}
                      disabled={
                        agentMutation !== null ||
                        nodesLoading ||
                        Boolean(agentMeasurementLoadingById[node.id])
                      }
                      onFocus={() => setSavedAgentTokenId(null)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        !agentTokenDrafts[node.id]?.trim() ||
                        agentMutation !== null ||
                        nodesLoading ||
                        Boolean(agentMeasurementLoadingById[node.id])
                      }
                      onClick={async () => {
                        const saved = await onSetAgentToken(
                          node.id,
                          agentTokenDrafts[node.id]?.trim() ?? "",
                        )
                        if (saved) {
                          setAgentTokenDrafts((drafts) => ({ ...drafts, [node.id]: "" }))
                          setSavedAgentTokenId(node.id)
                          onRefreshNodes()
                        }
                      }}
                    >
                      {agentMutation?.kind === "set-token" && agentMutation.agentId === node.id
                        ? t("networkProbe.nodes.tokenSaving")
                        : t("networkProbe.nodes.agentTokenSave")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        targetErrorKey !== null ||
                        agentMutation !== null ||
                        nodesLoading ||
                        Boolean(agentMeasurementLoadingById[node.id]) ||
                        Object.values(agentMeasurementLoadingById).filter(Boolean).length >= 3
                      }
                      onClick={() =>
                        void onRunAgentMeasurement(node.id, measurementType, target.trim())
                      }
                    >
                      {agentMeasurementLoadingById[node.id]
                        ? t("networkProbe.nodes.agentMeasuring")
                        : t("networkProbe.nodes.measureFromAgent")}
                    </Button>
                    {savedAgentTokenId === node.id ? (
                      <p className="w-full text-xs" role="status">
                        {t("networkProbe.nodes.agentTokenSaved")}
                      </p>
                    ) : null}
                    {agentMeasurementResults[node.id] ? (
                      <div className="w-full">
                        <AgentMeasurementSummary result={agentMeasurementResults[node.id]} />
                      </div>
                    ) : null}
                  </div>
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
              maxLength={80}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t("networkProbe.nodes.labelPlaceholder")}
              disabled={agentMutation !== null || nodesLoading}
            />
            <Input
              className="min-w-[16rem] flex-1"
              maxLength={2048}
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder={t("networkProbe.nodes.endpointPlaceholder")}
              aria-label={t("networkProbe.nodes.endpointPlaceholder")}
              disabled={agentMutation !== null || nodesLoading}
            />
            <Input
              type="password"
              autoComplete="new-password"
              maxLength={2048}
              className="min-w-[14rem] flex-1"
              value={agentToken}
              onChange={(event) => setAgentToken(event.target.value)}
              placeholder={t("networkProbe.nodes.agentTokenPlaceholder")}
              aria-label={t("networkProbe.nodes.newAgentTokenLabel")}
              disabled={agentMutation !== null || nodesLoading}
            />
            {nodes.filter((node) => node.kind === "remote-agent").length >=
            MAX_SELF_HOSTED_AGENTS ? (
              <p className="text-muted-foreground w-full text-xs">
                {t("networkProbe.nodes.agentLimitReached", { count: MAX_SELF_HOSTED_AGENTS })}
              </p>
            ) : null}
            {endpointErrorKey ? (
              <p role="alert" className="text-destructive w-full text-xs">
                {t(endpointErrorKey)}
              </p>
            ) : null}
            <CommandHint hint={t("networkProbe.cmd.addAgent")}>
              <Button
                type="button"
                disabled={
                  !label.trim() ||
                  !endpoint.trim() ||
                  !agentToken.trim() ||
                  nodes.filter((node) => node.kind === "remote-agent").length >=
                    MAX_SELF_HOSTED_AGENTS ||
                  endpointErrorKey !== null ||
                  agentMutation !== null ||
                  nodesLoading
                }
                onClick={async () => {
                  const added = await onAddAgent(label.trim(), endpoint.trim(), agentToken.trim())
                  if (added) {
                    setLabel("")
                    setEndpoint("")
                    setAgentToken("")
                    setSavedAgentTokenId(null)
                  }
                }}
              >
                {agentMutation?.kind === "add"
                  ? t("networkProbe.nodes.addingAgent")
                  : t("networkProbe.nodes.addAgent")}
              </Button>
            </CommandHint>
          </div>
        </div>
      </div>
      {result ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.nodes.measurementMeta", {
              target: result.target,
              count: result.probes.length,
              ms: result.elapsedMs.toFixed(0),
            })}
            <span className="ml-2 font-medium">
              {t(`networkProbe.nodes.measurementStatus.${result.status}`)}
            </span>
          </p>
          {result.status === "rate-limited" ? (
            <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.nodes.rateLimited", {
                remaining: result.rateLimit?.remaining ?? "—",
                limit: result.rateLimit?.limit ?? "—",
                reset: result.rateLimit?.resetSeconds ?? result.retryAfterSeconds ?? "—",
              })}
            </p>
          ) : null}
          {result.probes.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {loading
                ? t("networkProbe.nodes.waitingForProbes")
                : t("networkProbe.nodes.noResults")}
            </p>
          ) : null}
          <ul className="space-y-2 text-sm">
            {result.probes.map((probe) => (
              <li key={probe.id} className="rounded-md border px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">
                    {probe.id === "local" ? t("networkProbe.nodes.local") : probe.label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t(`networkProbe.nodes.probeStatus.${probe.status}`)}
                  </span>
                </div>
                {renderProbeMetrics(probe, result.measurementType, t)}
                {probe.detail ? (
                  <details className="text-muted-foreground mt-1 text-xs">
                    <summary className="cursor-pointer">
                      {t("networkProbe.nodes.technicalDetails")}
                    </summary>
                    <pre className="mt-1 overflow-auto font-mono whitespace-pre-wrap">
                      {probe.detail}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
          <div
            className="text-muted-foreground min-w-0 truncate font-mono text-xs"
            title={result.commandHint}
          >
            {result.commandHint}
          </div>
        </div>
      ) : null}
      <DestructiveConfirmDialog
        open={removeTokenOpen}
        onOpenChange={setRemoveTokenOpen}
        title={t("networkProbe.nodes.tokenRemoveTitle")}
        description={t("networkProbe.nodes.tokenRemoveDescription")}
        consequence={t("networkProbe.nodes.tokenRemoveConsequence")}
        confirmLabel={t("networkProbe.nodes.tokenRemoveConfirm")}
        cancelLabel={t("networkProbe.nodes.tokenRemoveCancel")}
        loading={tokenSaving}
        onConfirm={handleClearToken}
      />
      <DestructiveConfirmDialog
        open={agentToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setAgentToRemove(null)
        }}
        title={t("networkProbe.nodes.agentRemoveTitle")}
        description={t("networkProbe.nodes.agentRemoveDescription", {
          label: agentToRemove?.label ?? "",
        })}
        consequence={t("networkProbe.nodes.agentRemoveConsequence")}
        confirmLabel={t("networkProbe.nodes.removeAgent")}
        cancelLabel={t("networkProbe.nodes.tokenRemoveCancel")}
        loading={agentMutation?.kind === "remove"}
        onConfirm={async () => {
          if (!agentToRemove) return
          const removed = await onRemoveAgent(agentToRemove.id)
          if (removed) {
            setAgentTokenDrafts((drafts) => {
              const next = { ...drafts }
              delete next[agentToRemove.id]
              return next
            })
          }
        }}
      />
    </ProbePanelShell>
  )
}

function renderProbeMetrics(
  probe: GlobalpingProbeResult,
  measurementType: GlobalpingMeasurementType,
  t: TFunction,
) {
  if (measurementType === "dns") {
    return (
      <>
        {probe.dnsRcode ? (
          <p className="text-muted-foreground mt-1 text-xs">
            {t("networkProbe.nodes.dnsResponseCode", { code: probe.dnsRcode })}
          </p>
        ) : null}
        {probe.answers.length > 0 ? (
          <pre className="text-muted-foreground mt-1 overflow-auto font-mono text-xs">
            {probe.answers.join("\n")}
          </pre>
        ) : null}
      </>
    )
  }
  if (measurementType === "ping") {
    return (
      <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs">
        {probe.avgRttMs !== undefined ? (
          <span>{t("networkProbe.nodes.avgRtt", { ms: probe.avgRttMs.toFixed(2) })}</span>
        ) : null}
        {probe.packetsReceived !== undefined && probe.packetsSent !== undefined ? (
          <span>
            {t("networkProbe.nodes.packets", {
              received: probe.packetsReceived,
              sent: probe.packetsSent,
            })}
          </span>
        ) : null}
        {probe.packetLossPercent !== undefined ? (
          <span>
            {t("networkProbe.nodes.packetLoss", { percent: probe.packetLossPercent.toFixed(1) })}
          </span>
        ) : null}
      </div>
    )
  }
  return (
    <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs">
      {probe.httpStatusCode !== undefined ? (
        <span>{t("networkProbe.nodes.httpStatus", { code: probe.httpStatusCode })}</span>
      ) : null}
      {probe.totalTimeMs !== undefined ? (
        <span>{t("networkProbe.nodes.httpTiming", { ms: probe.totalTimeMs })}</span>
      ) : null}
    </div>
  )
}
