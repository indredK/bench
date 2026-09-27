/**
 * Feature UI / 功能界面: STUN-observed NAT mapping.
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { NatProbeResult } from "@/lib/tauri/types/network-probe"

interface NatPanelProps {
  loading: boolean
  result: NatProbeResult | null
  toolEnabled: boolean
  toolStatus?: string
  onRun: (behaviorServers: string[]) => void
}

const BEHAVIOR_SERVERS_KEY = "bench.networkProbe.rfc5780Servers"
const MAX_BEHAVIOR_SERVERS = 3

function readBehaviorServers(): string {
  try {
    return window.localStorage.getItem(BEHAVIOR_SERVERS_KEY) ?? ""
  } catch {
    return ""
  }
}

const NAT_TYPE_ALIASES: Record<string, string> = {
  "cone-or-mapped": "mapped-address",
  "symmetric-or-varied": "varying-mapping",
}

export function NatPanel({ loading, result, toolEnabled, toolStatus, onRun }: NatPanelProps) {
  const { t } = useTranslation()
  const [behaviorServerInput, setBehaviorServerInput] = useState(readBehaviorServers)
  const behaviorServers = useMemo(() => {
    const seen = new Set<string>()
    return behaviorServerInput
      .split(/\r?\n/)
      .map((server) => server.trim())
      .filter((server) => {
        if (!server) return false
        const normalized = server.toLowerCase()
        if (seen.has(normalized)) return false
        seen.add(normalized)
        return true
      })
  }, [behaviorServerInput])
  const tooManyBehaviorServers = behaviorServers.length > MAX_BEHAVIOR_SERVERS

  useEffect(() => {
    try {
      window.localStorage.setItem(BEHAVIOR_SERVERS_KEY, behaviorServerInput)
    } catch {
      // The field remains usable for this session when browser storage is unavailable.
    }
  }, [behaviorServerInput])

  const natType = result ? (NAT_TYPE_ALIASES[result.natType] ?? result.natType) : "unknown"
  return (
    <ProbePanelShell
      toolbar={
        <>
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-sm">{t("networkProbe.nat.hint")}</p>
            <label className="block text-sm font-medium" htmlFor="nat-behavior-servers">
              {t("networkProbe.nat.behaviorServersLabel")}
            </label>
            <Textarea
              id="nat-behavior-servers"
              rows={2}
              maxLength={1024}
              value={behaviorServerInput}
              placeholder={t("networkProbe.nat.behaviorServersPlaceholder")}
              onChange={(event) => setBehaviorServerInput(event.target.value)}
              disabled={loading}
              aria-describedby="nat-behavior-servers-hint"
            />
            <p
              id="nat-behavior-servers-hint"
              className={
                tooManyBehaviorServers
                  ? "text-destructive text-xs"
                  : "text-muted-foreground text-xs"
              }
            >
              {t(
                tooManyBehaviorServers
                  ? "networkProbe.nat.behaviorServersLimit"
                  : "networkProbe.nat.behaviorServersHint",
                { max: MAX_BEHAVIOR_SERVERS },
              )}
            </p>
          </div>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "nat",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}
          <CommandHint hint={t("networkProbe.cmd.nat")}>
            <Button
              type="button"
              disabled={loading || !toolEnabled || tooManyBehaviorServers}
              onClick={() => onRun(behaviorServers)}
            >
              {loading ? t("networkProbe.nat.running") : t("networkProbe.nat.run")}
            </Button>
          </CommandHint>
        </>
      }
    >
      {result ? (
        <div className="bg-muted/40 space-y-1 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.nat.type")}:{" "}
            <span className="font-medium">
              {t(`networkProbe.nat.types.${natType}`, {
                defaultValue: t("networkProbe.nat.types.unknown"),
              })}
            </span>
          </div>
          {result.mappedAddress ? (
            <div>
              {t("networkProbe.nat.mapped")}:{" "}
              <span className="font-mono">{result.mappedAddress}</span>
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t(`networkProbe.nat.explanations.${natType}`, {
              defaultValue: t("networkProbe.nat.explanations.unknown"),
            })}
          </p>
          {result.serverResults?.length ? (
            <ul className="space-y-1 text-xs" aria-label={t("networkProbe.nat.serverResults")}>
              {result.serverResults.map((server) => (
                <li key={server.server} className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-mono">{server.server}</span>
                  <span className="text-muted-foreground">
                    {t(`networkProbe.nat.serverStatuses.${server.status}`, {
                      defaultValue: t("networkProbe.nat.serverStatuses.unknown"),
                    })}
                    {server.mappedAddress ? ` · ${server.mappedAddress}` : null}
                    {` · ${t("networkProbe.nat.elapsedMs", { milliseconds: Math.round(server.elapsedMs) })}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {result.behaviorResults?.length ? (
            <section
              className="space-y-2 border-t pt-2"
              aria-label={t("networkProbe.nat.behaviorResults")}
            >
              <h3 className="font-medium">{t("networkProbe.nat.behaviorResults")}</h3>
              <ul className="space-y-2 text-xs">
                {result.behaviorResults.map((server, index) => (
                  <li
                    key={`${server.server}-${index}`}
                    className="space-y-1 rounded-md border px-2 py-1.5"
                  >
                    <div className="flex flex-wrap justify-between gap-x-3">
                      <span className="font-mono">{server.server}</span>
                      <span className="text-muted-foreground">
                        {t(`networkProbe.nat.behaviorStatuses.${server.status}`, {
                          defaultValue: t("networkProbe.nat.behaviorStatuses.unknown"),
                        })}
                      </span>
                    </div>
                    {server.endpoint ? (
                      <div className="text-muted-foreground font-mono">
                        {t("networkProbe.nat.behaviorEndpoint", { endpoint: server.endpoint })}
                      </div>
                    ) : null}
                    <div>
                      {t("networkProbe.nat.mappingBehaviorLabel")}:{" "}
                      {server.mappingBehavior
                        ? t(`networkProbe.nat.behaviors.${server.mappingBehavior}`, {
                            defaultValue: t("networkProbe.nat.behaviors.unknown"),
                          })
                        : t(`networkProbe.nat.behaviorStageStatuses.${server.mappingStatus}`, {
                            defaultValue: t("networkProbe.nat.behaviorStageStatuses.unknown"),
                          })}
                    </div>
                    <div>
                      {t("networkProbe.nat.filteringBehaviorLabel")}:{" "}
                      {server.filteringBehavior
                        ? t(`networkProbe.nat.behaviors.${server.filteringBehavior}`, {
                            defaultValue: t("networkProbe.nat.behaviors.unknown"),
                          })
                        : t(`networkProbe.nat.behaviorStageStatuses.${server.filteringStatus}`, {
                            defaultValue: t("networkProbe.nat.behaviorStageStatuses.unknown"),
                          })}
                    </div>
                    {server.mappedAddress ? (
                      <div className="font-mono">
                        {t("networkProbe.nat.mapped")}: {server.mappedAddress}
                      </div>
                    ) : null}
                    <div className="text-muted-foreground">
                      {t("networkProbe.nat.elapsedMs", {
                        milliseconds: Math.round(server.elapsedMs),
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
            <span>
              {t("networkProbe.nat.elapsed", { seconds: (result.elapsedMs / 1000).toFixed(1) })}
            </span>
            <span className="font-mono">{result.commandHint}</span>
          </div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
