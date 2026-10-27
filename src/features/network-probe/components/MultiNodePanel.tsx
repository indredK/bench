/**
 * Feature UI / 功能界面: multi-node DNS compare + agent registry.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NetworkProbeCancelButton } from "@/features/network-probe/components/NetworkProbeCancelButton"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { cn } from "@/lib/utils"
import type {
  GlobalpingMeasurementResult,
  MultiNodeDnsResult,
  ProbeNode,
} from "@/lib/tauri/types/network-probe"

const MAX_AGENT_ENDPOINT_BYTES = 2048

type AgentEndpointError = "invalid" | "scheme" | "credentials" | "tooLong" | null
type AgentLabelError = "invalid" | "tooLong" | null

function getAgentLabelError(label: string): AgentLabelError {
  const value = label.trim()
  if (!value) return null
  if (Array.from(value).length > 80) return "tooLong"
  if (Array.from(value).some((character) => /[\u0000-\u001f\u007f-\u009f]/u.test(character))) {
    return "invalid"
  }
  return null
}

function getProbeNodeKindLabel(kind: string, t: ReturnType<typeof useTranslation>["t"]) {
  switch (kind) {
    case "local":
      return t("networkProbe.nodes.kind.local")
    case "remote-proxy":
      return t("networkProbe.nodes.kind.remoteProxy")
    case "remote-agent":
      return t("networkProbe.nodes.kind.remoteAgent")
    default:
      return t("networkProbe.nodes.kind.unknown")
  }
}

function getProbeNodeLabel(node: ProbeNode, t: ReturnType<typeof useTranslation>["t"]) {
  switch (node.id) {
    case "local":
      return t("networkProbe.nodes.labels.local")
    case "gp-world":
      return t("networkProbe.nodes.labels.globalpingWorld")
    case "gp-us":
      return t("networkProbe.nodes.labels.globalpingUs")
    case "gp-eu":
      return t("networkProbe.nodes.labels.globalpingEurope")
    default:
      return `${node.label} · ${getProbeNodeKindLabel(node.kind, t)}`
  }
}

function getDnsAnswerNodeLabel(
  nodeId: string,
  nodeLabel: string,
  t: ReturnType<typeof useTranslation>["t"],
) {
  return nodeId === "local" ? t("networkProbe.nodes.labels.local") : nodeLabel
}

function getDnsFailureTranslationKey(nodeId: string, failureKind: string) {
  if (nodeId === "local") {
    if (failureKind === "request") return "networkProbe.nodes.failures.localRequest"
    if (failureKind === "timeout") return "networkProbe.nodes.failures.localTimeout"
  }
  return `networkProbe.nodes.failures.${failureKind}`
}

function getRemoteMeasurementFailureTranslationKey(failureKind: string) {
  return failureKind === "measurement"
    ? "networkProbe.nodes.failures.remoteMeasurement"
    : `networkProbe.nodes.failures.${failureKind}`
}

function getAgentEndpointError(endpoint: string): AgentEndpointError {
  const value = endpoint.trim()
  if (!value) return null
  if (new TextEncoder().encode(value).byteLength > MAX_AGENT_ENDPOINT_BYTES) return "tooLong"

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
  canCancel: boolean
  cancelling: boolean
  result: MultiNodeDnsResult | null
  globalpingResult: GlobalpingMeasurementResult | null
  nodes: ProbeNode[]
  globalpingTokenConfigured: boolean | null
  loadingGlobalpingToken: boolean
  toolEnabled: boolean
  toolStatus?: string
  onCompare: (domain: string) => void
  onMeasureGlobalping: (
    measurementType: "ping" | "http",
    target: string,
    httpMethod?: "GET" | "HEAD",
  ) => void
  onCancel: () => void
  onRefreshNodes: () => void
  onRefreshGlobalpingTokenStatus: () => Promise<boolean>
  onSaveGlobalpingToken: (token: string) => Promise<boolean>
  onClearGlobalpingToken: () => Promise<boolean>
  onAddAgent: (label: string, endpoint: string) => void
  onRemoveAgent: (agentId: string) => void
}

export function MultiNodePanel({
  loading,
  loadingNodes,
  canCancel,
  cancelling,
  result,
  globalpingResult,
  nodes,
  globalpingTokenConfigured,
  loadingGlobalpingToken,
  toolEnabled,
  toolStatus,
  onCompare,
  onMeasureGlobalping,
  onCancel,
  onRefreshNodes,
  onRefreshGlobalpingTokenStatus,
  onSaveGlobalpingToken,
  onClearGlobalpingToken,
  onAddAgent,
  onRemoveAgent,
}: MultiNodePanelProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<"dns" | "ping" | "http">("dns")
  const [dnsDomain, setDnsDomain] = useState("example.com")
  const [pingTarget, setPingTarget] = useState("iana.org")
  const [httpTarget, setHttpTarget] = useState("https://www.iana.org/domains")
  const [httpMethod, setHttpMethod] = useState<"GET" | "HEAD">("GET")
  const [label, setLabel] = useState("")
  const [labelTouched, setLabelTouched] = useState(false)
  const [endpoint, setEndpoint] = useState("https://")
  const [endpointTouched, setEndpointTouched] = useState(false)
  const [globalpingToken, setGlobalpingToken] = useState("")
  const [tokenFeedback, setTokenFeedback] = useState<"saved" | "cleared" | "failed" | null>(null)
  const endpointError = getAgentEndpointError(endpoint)
  const labelError = getAgentLabelError(label)
  const showLabelError = labelTouched && labelError !== null
  const showEndpointError = endpointTouched && endpointError !== null
  const currentTarget = mode === "dns" ? dnsDomain : mode === "ping" ? pingTarget : httpTarget

  function runMeasurement() {
    if (mode === "dns") onCompare(dnsDomain.trim())
    else onMeasureGlobalping(mode, currentTarget.trim(), mode === "http" ? httpMethod : undefined)
  }

  async function checkGlobalpingTokenStatus() {
    const ok = await onRefreshGlobalpingTokenStatus()
    setTokenFeedback(ok ? null : "failed")
  }

  async function saveGlobalpingToken() {
    const saved = await onSaveGlobalpingToken(globalpingToken)
    if (saved) {
      setGlobalpingToken("")
      setTokenFeedback("saved")
    } else {
      setTokenFeedback("failed")
    }
  }

  async function clearGlobalpingToken() {
    const cleared = await onClearGlobalpingToken()
    setTokenFeedback(cleared ? "cleared" : "failed")
  }

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">
            {t(`networkProbe.nodes.modeHint.${mode}`)}
          </p>
          <p className="text-muted-foreground text-xs" role="note">
            {t("networkProbe.nodes.privacyNotice")}
          </p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "multiNode",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}

          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label={t("networkProbe.nodes.modeLabel")}
          >
            {(["dns", "ping", "http"] as const).map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={mode === item ? "secondary" : "outline"}
                aria-pressed={mode === item}
                disabled={loading}
                onClick={() => setMode(item)}
              >
                {t(`networkProbe.nodes.mode.${item}`)}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-xl min-w-[16rem] flex-1"
              value={currentTarget}
              disabled={loading}
              onChange={(event) => {
                if (mode === "dns") setDnsDomain(event.target.value)
                else if (mode === "ping") setPingTarget(event.target.value)
                else setHttpTarget(event.target.value)
              }}
              aria-label={t(`networkProbe.nodes.targetLabel.${mode}`)}
              placeholder={t(`networkProbe.nodes.targetPlaceholder.${mode}`)}
            />
            {mode === "http" ? (
              <label className="flex items-center gap-2 text-sm">
                <span>{t("networkProbe.nodes.httpMethod")}</span>
                <select
                  className="border-input bg-background h-8 rounded-lg border px-2"
                  value={httpMethod}
                  disabled={loading}
                  onChange={(event) => setHttpMethod(event.target.value as "GET" | "HEAD")}
                >
                  <option value="GET">{t("networkProbe.nodes.httpMethodOptions.get")}</option>
                  <option value="HEAD">{t("networkProbe.nodes.httpMethodOptions.head")}</option>
                </select>
              </label>
            ) : null}
            {loading ? (
              canCancel ? (
                <NetworkProbeCancelButton
                  label={t("common.cancel")}
                  cancelling={cancelling}
                  onCancel={onCancel}
                />
              ) : (
                <Button type="button" disabled>
                  {t("networkProbe.nodes.running")}
                </Button>
              )
            ) : (
              <CommandHint hint={t("networkProbe.cmd.compareDns")}>
                <Button
                  type="button"
                  disabled={loadingNodes || !toolEnabled || !currentTarget.trim()}
                  onClick={runMeasurement}
                >
                  {t(`networkProbe.nodes.runMode.${mode}`)}
                </Button>
              </CommandHint>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={loadingNodes}
              onClick={onRefreshNodes}
            >
              {loadingNodes ? t("networkProbe.nodes.working") : t("networkProbe.nodes.refresh")}
            </Button>
          </div>
          {loading && canCancel ? (
            <p className="text-muted-foreground text-xs" role="status">
              {t("networkProbe.nodes.stopWaitingHint")}
            </p>
          ) : null}

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {t("networkProbe.nodes.settingsTitle")}
            </summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("networkProbe.nodes.listTitle")}</p>
                <ul className="space-y-1 font-mono text-xs">
                  {nodes.map((n) => (
                    <li key={n.id} className="flex min-w-0 flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate" title={getProbeNodeLabel(n, t)}>
                          {getProbeNodeLabel(n, t)}
                        </p>
                        {n.kind === "remote-agent" && n.endpoint ? (
                          <p className="text-muted-foreground truncate" title={n.endpoint}>
                            {n.endpoint}
                          </p>
                        ) : null}
                      </div>
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
                          disabled={loadingNodes}
                          onClick={() => onRemoveAgent(n.id)}
                        >
                          {loadingNodes
                            ? t("networkProbe.nodes.working")
                            : t("networkProbe.nodes.removeAgent")}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {t("networkProbe.nodes.token.title")}
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-muted-foreground text-xs">
                    {t("networkProbe.nodes.token.hint")}
                  </p>
                  <p className="text-muted-foreground text-xs" role="status">
                    {globalpingTokenConfigured === null
                      ? t("networkProbe.nodes.token.statusUnknown")
                      : globalpingTokenConfigured
                        ? t("networkProbe.nodes.token.statusConfigured")
                        : t("networkProbe.nodes.token.statusMissing")}
                  </p>
                  {tokenFeedback ? (
                    <p
                      className={
                        tokenFeedback === "failed"
                          ? "text-destructive text-xs"
                          : "text-xs text-emerald-700 dark:text-emerald-400"
                      }
                      role={tokenFeedback === "failed" ? "alert" : "status"}
                    >
                      {tokenFeedback === "saved"
                        ? t("networkProbe.nodes.token.saved")
                        : tokenFeedback === "cleared"
                          ? t("networkProbe.nodes.token.cleared")
                          : t("networkProbe.nodes.token.failed")}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="min-w-[16rem] flex-1"
                      type="password"
                      autoComplete="new-password"
                      value={globalpingToken}
                      onChange={(event) => {
                        setGlobalpingToken(event.target.value)
                        setTokenFeedback(null)
                      }}
                      disabled={loading || loadingGlobalpingToken}
                      placeholder={t("networkProbe.nodes.token.placeholder")}
                      aria-label={t("networkProbe.nodes.token.placeholder")}
                      maxLength={4096}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={loading || loadingGlobalpingToken}
                      onClick={() => void checkGlobalpingTokenStatus()}
                    >
                      {loadingGlobalpingToken
                        ? t("networkProbe.nodes.working")
                        : t("networkProbe.nodes.token.check")}
                    </Button>
                    <Button
                      type="button"
                      disabled={loading || loadingGlobalpingToken || !globalpingToken.trim()}
                      onClick={() => void saveGlobalpingToken()}
                    >
                      {loadingGlobalpingToken
                        ? t("networkProbe.nodes.working")
                        : t("networkProbe.nodes.token.save")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        loading || loadingGlobalpingToken || globalpingTokenConfigured !== true
                      }
                      onClick={() => void clearGlobalpingToken()}
                    >
                      {loadingGlobalpingToken
                        ? t("networkProbe.nodes.working")
                        : t("networkProbe.nodes.token.clear")}
                    </Button>
                  </div>
                </div>
              </details>

              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">{t("networkProbe.nodes.addTitle")}</p>
                <p className="text-muted-foreground text-xs">{t("networkProbe.nodes.addHint")}</p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="max-w-[10rem]"
                    value={label}
                    onChange={(e) => {
                      setLabelTouched(true)
                      setLabel(e.target.value)
                    }}
                    disabled={loadingNodes}
                    placeholder={t("networkProbe.nodes.labelPlaceholder")}
                    aria-label={t("networkProbe.nodes.labelPlaceholder")}
                    aria-invalid={showLabelError}
                    aria-describedby={
                      showLabelError ? "network-probe-agent-label-error" : undefined
                    }
                    maxLength={160}
                  />
                  {showLabelError ? (
                    <p
                      id="network-probe-agent-label-error"
                      role="alert"
                      className="text-destructive w-full text-xs"
                    >
                      {t(`networkProbe.nodes.labelError.${labelError}`)}
                    </p>
                  ) : null}
                  <Input
                    className="min-w-[16rem] flex-1"
                    value={endpoint}
                    onChange={(e) => {
                      setEndpointTouched(true)
                      setEndpoint(e.target.value)
                    }}
                    disabled={loadingNodes}
                    placeholder={t("networkProbe.nodes.endpointPlaceholder")}
                    aria-label={t("networkProbe.nodes.endpointPlaceholder")}
                    maxLength={MAX_AGENT_ENDPOINT_BYTES + 1}
                    aria-invalid={showEndpointError}
                    aria-describedby={
                      showEndpointError ? "network-probe-agent-endpoint-error" : undefined
                    }
                  />
                  {showEndpointError ? (
                    <p
                      id="network-probe-agent-endpoint-error"
                      role="alert"
                      className="text-destructive w-full text-xs"
                    >
                      {t(`networkProbe.nodes.endpointError.${endpointError}`)}
                    </p>
                  ) : null}
                  <CommandHint hint={t("networkProbe.cmd.addAgent")}>
                    <Button
                      type="button"
                      disabled={
                        loadingNodes ||
                        !label.trim() ||
                        labelError !== null ||
                        !endpoint.trim() ||
                        endpointError !== null
                      }
                      onClick={() => onAddAgent(label.trim(), endpoint.trim())}
                    >
                      {loadingNodes
                        ? t("networkProbe.nodes.working")
                        : t("networkProbe.nodes.addAgent")}
                    </Button>
                  </CommandHint>
                </div>
              </div>
            </div>
          </details>
        </>
      }
    >
      {globalpingResult?.measurementType === mode ? (
        <div className="space-y-2">
          {loading ? (
            <p className="text-muted-foreground text-xs" role="status">
              {t("networkProbe.nodes.partialResults")}
            </p>
          ) : null}
          {globalpingResult.cancelled ? (
            <p className="text-muted-foreground text-sm" role="status">
              {t("networkProbe.nodes.cancelled")}
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.nodes.meta", {
              domain: globalpingResult.target,
              count: globalpingResult.probes.length,
              ms: globalpingResult.elapsedMs.toFixed(0),
            })}
          </p>
          <ul className="space-y-2 text-sm">
            {globalpingResult.probes.map((probe) => (
              <li key={probe.nodeId} className="rounded-md border px-3 py-2">
                <div className="font-medium">
                  {probe.nodeLabel}{" "}
                  <span
                    className={cn(
                      "font-mono text-xs",
                      probe.status === "finished"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-destructive",
                    )}
                  >
                    {t(
                      `networkProbe.nodes.remoteStatus.${probe.status === "finished" ? "finished" : "failed"}`,
                    )}
                  </span>
                </div>
                {probe.resolvedAddress ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t("networkProbe.nodes.resolvedAddress", {
                      address: probe.resolvedAddress,
                    })}
                  </p>
                ) : null}
                {probe.pingStats ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t("networkProbe.nodes.pingStats", {
                      min: probe.pingStats.minRttMs?.toFixed(2) ?? "—",
                      avg: probe.pingStats.avgRttMs?.toFixed(2) ?? "—",
                      max: probe.pingStats.maxRttMs?.toFixed(2) ?? "—",
                      loss: probe.pingStats.lossPercent ?? "—",
                      received: probe.pingStats.packetsReceived ?? "—",
                      sent: probe.pingStats.packetsSent ?? "—",
                    })}
                  </p>
                ) : null}
                {probe.httpStatusCode != null ? (
                  <p className="mt-1 font-mono text-xs">
                    {t("networkProbe.nodes.httpResponse", {
                      code: probe.httpStatusCode,
                      name: probe.httpStatusName ?? "",
                    })}
                  </p>
                ) : null}
                {probe.httpTimings ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t("networkProbe.nodes.httpTimings", {
                      total: probe.httpTimings.totalMs,
                      dns: probe.httpTimings.dnsMs ?? "—",
                      tcp: probe.httpTimings.tcpMs,
                      tls: probe.httpTimings.tlsMs ?? "—",
                      firstByte: probe.httpTimings.firstByteMs,
                      download: probe.httpTimings.downloadMs,
                    })}
                  </p>
                ) : null}
                {probe.failureKind ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t(getRemoteMeasurementFailureTranslationKey(probe.failureKind))}
                  </p>
                ) : null}
                {probe.failureKind === "quota" && probe.rateLimit ? (
                  <p className="text-muted-foreground mt-1 text-xs" role="status">
                    {t("networkProbe.nodes.rateLimitTitle")}
                    {probe.rateLimit.remaining != null
                      ? ` · ${t("networkProbe.nodes.rateLimitRemaining", { count: probe.rateLimit.remaining })}`
                      : null}
                    {probe.rateLimit.limit != null
                      ? ` · ${t("networkProbe.nodes.rateLimitLimit", { count: probe.rateLimit.limit })}`
                      : null}
                    {probe.rateLimit.consumed != null
                      ? ` · ${t("networkProbe.nodes.rateLimitConsumed", { count: probe.rateLimit.consumed })}`
                      : null}
                    {probe.rateLimit.creditsRemaining != null
                      ? ` · ${t("networkProbe.nodes.creditsRemaining", { count: probe.rateLimit.creditsRemaining })}`
                      : null}
                    {probe.rateLimit.creditsConsumed != null
                      ? ` · ${t("networkProbe.nodes.creditsConsumed", { count: probe.rateLimit.creditsConsumed })}`
                      : null}
                    {probe.rateLimit.requestCost != null
                      ? ` · ${t("networkProbe.nodes.requestCost", { count: probe.rateLimit.requestCost })}`
                      : null}
                    {probe.rateLimit.waitSeconds != null
                      ? ` · ${t("networkProbe.nodes.rateLimitWait", { count: probe.rateLimit.waitSeconds })}`
                      : null}
                  </p>
                ) : null}
                {probe.detail ? (
                  <details className="text-muted-foreground mt-1 text-xs">
                    <summary className="cursor-pointer">
                      {t("networkProbe.nodes.technicalDetails")}
                    </summary>
                    <pre className="mt-1 max-h-48 overflow-auto break-all whitespace-pre-wrap">
                      {probe.detail}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="text-muted-foreground font-mono text-xs">
            {globalpingResult.commandHint}
          </div>
        </div>
      ) : null}
      {mode === "dns" && result ? (
        <div className="space-y-2">
          {loading ? (
            <p className="text-muted-foreground text-xs" role="status">
              {t("networkProbe.nodes.partialResults")}
            </p>
          ) : null}
          {result.cancelled ? (
            <p className="text-muted-foreground text-sm" role="status">
              {t("networkProbe.nodes.cancelled")}
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.nodes.meta", {
              domain: result.domain,
              count: result.answers.length,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          <ul className="space-y-2 text-sm">
            {result.answers.map((a) => (
              <li key={a.nodeId} className="rounded-md border px-3 py-2">
                <div className="font-medium">
                  {getDnsAnswerNodeLabel(a.nodeId, a.nodeLabel, t)}{" "}
                  <span
                    className={cn(
                      "font-mono text-xs",
                      a.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
                    )}
                  >
                    {a.ok
                      ? t("networkProbe.nodes.answerStatus.success")
                      : t("networkProbe.nodes.answerStatus.failed")}
                  </span>
                </div>
                {a.answers.length > 0 ? (
                  <pre className="text-muted-foreground mt-1 overflow-auto font-mono text-xs">
                    {a.answers.join("\n")}
                  </pre>
                ) : null}
                {a.failureKind ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t(getDnsFailureTranslationKey(a.nodeId, a.failureKind))}
                  </p>
                ) : null}
                {a.failureKind === "quota" && a.rateLimit ? (
                  <p className="text-muted-foreground mt-1 text-xs" role="status">
                    {t("networkProbe.nodes.rateLimitTitle")}
                    {a.rateLimit.remaining != null
                      ? ` · ${t("networkProbe.nodes.rateLimitRemaining", { count: a.rateLimit.remaining })}`
                      : null}
                    {a.rateLimit.limit != null
                      ? ` · ${t("networkProbe.nodes.rateLimitLimit", { count: a.rateLimit.limit })}`
                      : null}
                    {a.rateLimit.consumed != null
                      ? ` · ${t("networkProbe.nodes.rateLimitConsumed", { count: a.rateLimit.consumed })}`
                      : null}
                    {a.rateLimit.creditsRemaining != null
                      ? ` · ${t("networkProbe.nodes.creditsRemaining", { count: a.rateLimit.creditsRemaining })}`
                      : null}
                    {a.rateLimit.creditsConsumed != null
                      ? ` · ${t("networkProbe.nodes.creditsConsumed", { count: a.rateLimit.creditsConsumed })}`
                      : null}
                    {a.rateLimit.requestCost != null
                      ? ` · ${t("networkProbe.nodes.requestCost", { count: a.rateLimit.requestCost })}`
                      : null}
                    {a.rateLimit.waitSeconds != null
                      ? ` · ${t("networkProbe.nodes.rateLimitWait", { count: a.rateLimit.waitSeconds })}`
                      : null}
                  </p>
                ) : null}
                {a.detail ? (
                  a.failureKind ? (
                    <details className="text-muted-foreground mt-1 text-xs">
                      <summary className="cursor-pointer">
                        {t("networkProbe.nodes.technicalDetails")}
                      </summary>
                      <p className="mt-1 break-all">{a.detail}</p>
                    </details>
                  ) : (
                    <p className="text-muted-foreground mt-1 text-xs">{a.detail}</p>
                  )
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
