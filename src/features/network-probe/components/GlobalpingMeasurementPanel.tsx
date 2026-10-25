/** Globalping ping/http controls; IPC and business state arrive through controller props. */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  GlobalpingMeasurementKind,
  GlobalpingMeasurementResult,
} from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface GlobalpingMeasurementPanelProps {
  result: GlobalpingMeasurementResult | null
  loading: boolean
  tokenConfigured: boolean | null
  loadingToken: boolean
  savingToken: boolean
  onRun: (kind: GlobalpingMeasurementKind, target: string, method?: string) => Promise<void>
  onRefreshTokenStatus: () => Promise<boolean | null>
  onSaveToken: (token: string) => Promise<boolean>
  onRemoveToken: () => Promise<boolean>
}

const FAILURE_KEYS = [
  "rate_limited",
  "invalid_token",
  "network_error",
  "timed_out",
  "invalid_request",
  "service_error",
  "http_error",
  "invalid_response",
  "terminal_failure",
  "no_results",
] as const

export function GlobalpingMeasurementPanel({
  result,
  loading,
  tokenConfigured,
  loadingToken,
  savingToken,
  onRun,
  onRefreshTokenStatus,
  onSaveToken,
  onRemoveToken,
}: GlobalpingMeasurementPanelProps) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<GlobalpingMeasurementKind>("ping")
  const [target, setTarget] = useState("example.com")
  const [method, setMethod] = useState("HEAD")
  const [token, setToken] = useState("")
  const [tokenSettingsOpen, setTokenSettingsOpen] = useState(false)
  const [removeConfirmationOpen, setRemoveConfirmationOpen] = useState(false)

  const quotaDetails = result?.quota
    ? [
        result.quota.rateLimitRemaining !== undefined && result.quota.rateLimitLimit !== undefined
          ? t("networkProbe.nodes.globalpingQuotaRemaining", {
              remaining: result.quota.rateLimitRemaining,
              limit: result.quota.rateLimitLimit,
            })
          : null,
        result.quota.rateLimitConsumed !== undefined
          ? t("networkProbe.nodes.globalpingQuotaConsumed", {
              consumed: result.quota.rateLimitConsumed,
            })
          : null,
        result.quota.rateLimitResetSeconds !== undefined
          ? t("networkProbe.nodes.globalpingQuotaReset", {
              seconds: result.quota.rateLimitResetSeconds,
            })
          : null,
        result.quota.creditsRemaining !== undefined
          ? t("networkProbe.nodes.globalpingCreditsRemaining", {
              credits: result.quota.creditsRemaining,
            })
          : null,
        result.quota.creditsConsumed !== undefined
          ? t("networkProbe.nodes.globalpingCreditsConsumed", {
              credits: result.quota.creditsConsumed,
            })
          : null,
      ]
        .filter((detail): detail is string => detail !== null)
        .join(" · ")
    : ""

  const run = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void onRun(kind, target.trim(), kind === "http" ? method : undefined)
  }

  const openTokenSettings = () => {
    const next = !tokenSettingsOpen
    setTokenSettingsOpen(next)
    if (next) void onRefreshTokenStatus()
    else setToken("")
  }

  const saveToken = async () => {
    if (!(await onSaveToken(token))) return
    setToken("")
    toast.success(t("networkProbe.nodes.globalpingTokenSaved"))
  }

  const removeToken = async () => {
    if (await onRemoveToken()) toast.success(t("networkProbe.nodes.globalpingTokenRemoved"))
  }

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{t("networkProbe.nodes.globalpingTitle")}</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("networkProbe.nodes.globalpingDisclosure")}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={openTokenSettings}>
          {tokenSettingsOpen
            ? t("networkProbe.nodes.globalpingTokenClose")
            : t("networkProbe.nodes.globalpingTokenSettings")}
        </Button>
      </div>

      <form className="flex flex-wrap items-center gap-2" onSubmit={run}>
        <Select value={kind} onValueChange={(value) => setKind(value as GlobalpingMeasurementKind)}>
          <SelectTrigger className="w-28" aria-label={t("networkProbe.nodes.globalpingType")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ping">{t("networkProbe.nodes.globalpingTypes.ping")}</SelectItem>
            <SelectItem value="http">{t("networkProbe.nodes.globalpingTypes.http")}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="min-w-[14rem] flex-1"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder={
            kind === "http"
              ? t("networkProbe.nodes.globalpingHttpPlaceholder")
              : t("networkProbe.nodes.domainPlaceholder")
          }
          aria-label={t("networkProbe.nodes.globalpingTarget")}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={2048}
        />
        {kind === "http" ? (
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-28" aria-label={t("networkProbe.nodes.globalpingMethod")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HEAD">{t("networkProbe.nodes.globalpingMethods.head")}</SelectItem>
              <SelectItem value="GET">{t("networkProbe.nodes.globalpingMethods.get")}</SelectItem>
              <SelectItem value="OPTIONS">
                {t("networkProbe.nodes.globalpingMethods.options")}
              </SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        <Button type="submit" disabled={loading || !target.trim()}>
          {loading
            ? t("networkProbe.nodes.globalpingRunning")
            : t("networkProbe.nodes.globalpingRun")}
        </Button>
      </form>

      {tokenSettingsOpen ? (
        <div className="bg-muted/40 space-y-2 rounded-md p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">{t("networkProbe.nodes.globalpingTokenStatus")}</p>
            <span role="status" className="text-muted-foreground text-xs">
              {loadingToken
                ? t("networkProbe.nodes.globalpingTokenChecking")
                : tokenConfigured === true
                  ? t("networkProbe.nodes.globalpingTokenConfigured")
                  : tokenConfigured === false
                    ? t("networkProbe.nodes.globalpingTokenMissing")
                    : t("networkProbe.nodes.globalpingTokenUnknown")}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.nodes.globalpingTokenHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[14rem] flex-1"
              type="password"
              autoComplete="new-password"
              value={token}
              disabled={savingToken}
              onChange={(event) => setToken(event.target.value)}
              placeholder={t("networkProbe.nodes.globalpingTokenPlaceholder")}
              aria-label={t("networkProbe.nodes.globalpingTokenPlaceholder")}
              maxLength={4096}
            />
            <Button
              type="button"
              disabled={savingToken || !token.trim()}
              onClick={() => void saveToken()}
            >
              {savingToken
                ? t("networkProbe.nodes.globalpingTokenSaving")
                : t("networkProbe.nodes.globalpingTokenSave")}
            </Button>
            {tokenConfigured ? (
              <Button
                type="button"
                variant="outline"
                disabled={savingToken}
                onClick={() => setRemoveConfirmationOpen(true)}
              >
                {t("networkProbe.nodes.globalpingTokenRemove")}
              </Button>
            ) : null}
          </div>
          <DestructiveConfirmDialog
            open={removeConfirmationOpen}
            onOpenChange={setRemoveConfirmationOpen}
            title={t("networkProbe.nodes.globalpingTokenRemoveTitle")}
            description={t("networkProbe.nodes.globalpingTokenRemoveDescription")}
            confirmLabel={t("networkProbe.nodes.globalpingTokenRemove")}
            cancelLabel={t("common.cancel")}
            onConfirm={removeToken}
            loading={savingToken}
          />
        </div>
      ) : null}

      {result ? (
        <div className="space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="text-muted-foreground min-w-0 break-all">
              {t("networkProbe.nodes.globalpingResultMeta", {
                kind: t(`networkProbe.nodes.globalpingTypes.${result.kind}`),
                target: result.target,
                count: result.probesCount,
                ms: result.elapsedMs.toFixed(0),
              })}
            </p>
            <span role="status" className="shrink-0">
              {t(`networkProbe.nodes.globalpingStatus.${result.status}`, {
                defaultValue: t("networkProbe.nodes.globalpingStatus.failed"),
              })}
            </span>
          </div>
          {result.failureCode && FAILURE_KEYS.includes(result.failureCode) ? (
            <p role="alert" className="text-destructive text-xs">
              {t(`networkProbe.nodes.globalpingFailures.${result.failureCode}`)}
            </p>
          ) : null}
          {quotaDetails ? <p className="text-muted-foreground text-xs">{quotaDetails}</p> : null}
          <ul className="space-y-2 text-sm">
            {result.results.map((probe) => {
              const status = probe.status === "finished" ? "finished" : "failed"
              return (
                <li key={probe.nodeId} className="rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{probe.nodeLabel}</span>
                    <span
                      role="status"
                      className={cn(
                        "font-mono text-xs",
                        probe.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
                      )}
                    >
                      {t(`networkProbe.nodes.globalpingStatus.${status}`)}
                    </span>
                  </div>
                  {probe.resolvedAddress ? (
                    <p className="text-muted-foreground mt-1 font-mono text-xs">
                      {t("networkProbe.nodes.globalpingResolved", {
                        address: probe.resolvedAddress,
                      })}
                    </p>
                  ) : null}
                  {probe.ping ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t("networkProbe.nodes.globalpingPingStats", {
                        received: probe.ping.packetsReceived,
                        sent: probe.ping.packetsSent,
                        loss: probe.ping.lossPercent,
                        avg: probe.ping.avgRttMs?.toFixed(2) ?? "—",
                      })}
                    </p>
                  ) : null}
                  {probe.http ? (
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        (probe.http.statusCode ?? 0) >= 400
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {t("networkProbe.nodes.globalpingHttpStats", {
                        code: probe.http.statusCode ?? "—",
                        total: probe.http.totalMs?.toFixed(2) ?? "—",
                        dns: probe.http.dnsMs?.toFixed(2) ?? "—",
                        tcp: probe.http.tcpMs?.toFixed(2) ?? "—",
                        tls: probe.http.tlsAvailable
                          ? (probe.http.tlsMs?.toFixed(2) ?? "—")
                          : t("networkProbe.nodes.globalpingNoTls"),
                        firstByte: probe.http.firstByteMs?.toFixed(2) ?? "—",
                        download: probe.http.downloadMs?.toFixed(2) ?? "—",
                      })}
                    </p>
                  ) : null}
                  {probe.failureSource ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t(`networkProbe.nodes.globalpingFailureSources.${probe.failureSource}`, {
                        defaultValue: t("networkProbe.nodes.globalpingFailureSources.unknown"),
                      })}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <p className="text-muted-foreground font-mono text-xs break-all">{result.commandHint}</p>
        </div>
      ) : null}
    </section>
  )
}
