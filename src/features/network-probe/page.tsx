/**
 * Page View / 页面视图: 只组合标题栏、工作区、L2 导航与能力包对话框.
 *
 * 目录与产品地图：`probe-catalog.ts`；面板路由：`components/ProbeWorkspace.tsx`。
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Network } from "lucide-react"
import { RuntimeFeatureGate } from "@/components/common/RuntimeFeatureGate"
import { CommandLogSidePanel } from "@/features/network-probe/components/CommandLogSidePanel"
import { PackInstallDialog } from "@/features/network-probe/components/PackInstallDialog"
import { ProbeHeader } from "@/features/network-probe/components/ProbeHeader"
import { ProbeL2Nav } from "@/features/network-probe/components/ProbeL2Nav"
import { ProbeWorkspace } from "@/features/network-probe/components/ProbeWorkspace"
import { SecurityAuthGate } from "@/features/network-probe/components/SecurityAuthGate"
import { useNetworkProbeController } from "@/features/network-probe/hooks/useNetworkProbeController"
import { L2_BY_L1 } from "@/features/network-probe/probe-catalog"
import { cn } from "@/lib/utils"
import type { FeatureDescriptor } from "@/platform/capabilities"

export default function NetworkProbePage({ feature }: { feature?: FeatureDescriptor }) {
  const { t } = useTranslation()
  const c = useNetworkProbeController()
  const [packsOpen, setPacksOpen] = useState(false)
  const [focusPackId, setFocusPackId] = useState<string | null>(null)
  const [packsBusy, setPacksBusy] = useState(false)
  const [packsRefreshing, setPacksRefreshing] = useState(false)
  const [sideLogOpen, setSideLogOpen] = useState(true)

  const l2Items = L2_BY_L1[c.l1Id]
  const resolvedL2 = l2Items.includes(c.l2Id) ? c.l2Id : l2Items[0]!

  useEffect(() => {
    if (c.l2Id !== resolvedL2) c.selectL2(resolvedL2)
  }, [c.l2Id, c.selectL2, resolvedL2])

  const probeNodes = useMemo(
    () =>
      c.probeNodes.length > 0
        ? c.probeNodes
        : [
            {
              id: "local",
              label: t("networkProbe.nodeSelect.local"),
              kind: "local",
              reachable: true,
            },
          ],
    [c.probeNodes, t],
  )
  // 通用原点选择仍只对本机探测生效；Globalping DNS/Ping/HTTP 从 Discover → Nodes 显式运行。
  // 自有 agent 尚未接入测量 use-case，继续显示为 disabled，避免假连接。
  const activeNode = useMemo(
    () => probeNodes.find((n) => n.kind === "local") ?? probeNodes[0],
    [probeNodes],
  )

  const errorText = c.error ? t(c.error.key, { defaultValue: c.error.fallback }) : null
  const showBasicView = c.l1Id === "basic"
  const panelTitle = showBasicView ? t("networkProbe.l1.basic") : t(`networkProbe.l2.${resolvedL2}`)

  const openPacks = (packId?: string) => {
    setFocusPackId(packId ?? null)
    setPacksOpen(true)
  }

  return (
    <RuntimeFeatureGate
      feature={feature}
      icon={<Network size={32} className="opacity-40" />}
      title={t("networkProbe.title")}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <ProbeHeader
          l1={c.l1Id}
          onSelectL1={c.selectL1}
          nodes={probeNodes}
          activeNodeId={activeNode?.id ?? "local"}
          onManagePacks={() => openPacks()}
        />

        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1 overflow-hidden",
            sideLogOpen
              ? "lg:grid-cols-[minmax(0,1fr)_280px]"
              : "lg:grid-cols-[minmax(0,1fr)_2.25rem]",
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden p-3">
            <div
              className={cn(
                "mx-auto flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden",
                c.l1Id === "sites" ? "max-w-6xl" : "max-w-5xl",
              )}
            >
              <div className="flex shrink-0 flex-wrap items-baseline gap-2">
                <h2 className="text-base font-semibold">{panelTitle}</h2>
                <p className="text-muted-foreground text-[11px]">
                  {showBasicView ? (
                    <span>{t("networkProbe.basicView.hint")}</span>
                  ) : (
                    <>
                      <span>{t(`networkProbe.l1.${c.l1Id}`)}</span>
                      <span className="mx-1 opacity-50">/</span>
                      <span>{panelTitle}</span>
                    </>
                  )}
                  {c.capabilities ? (
                    <>
                      <span className="mx-1 opacity-50">·</span>
                      <span className="font-mono">
                        {t("networkProbe.caps.banner", {
                          platform: c.capabilities.platform,
                          privilege: c.capabilities.privilegeLevel,
                        })}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>

              {errorText ? (
                <div className="border-destructive/40 bg-destructive/5 text-destructive shrink-0 rounded-md border px-3 py-2 text-sm">
                  {errorText}
                </div>
              ) : null}

              {c.l1Id === "security" ? (
                <div className="shrink-0">
                  <SecurityAuthGate
                    authorized={c.securityAuthorized}
                    onAuthorize={c.authorizeSecurity}
                    onRevoke={c.revokeSecurity}
                  />
                </div>
              ) : null}

              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <ProbeWorkspace c={c} l1={c.l1Id} l2={resolvedL2} onManagePacks={openPacks} />
              </div>
            </div>
          </div>

          <div className="hidden min-h-0 lg:flex lg:h-full lg:flex-col">
            <CommandLogSidePanel
              lines={c.commandLog}
              onClear={c.clearCommandLog}
              onOpenChange={setSideLogOpen}
            />
          </div>
        </div>

        {c.l1Id !== "basic" ? (
          <ProbeL2Nav items={l2Items} active={resolvedL2} onSelect={c.selectL2} />
        ) : null}

        <PackInstallDialog
          open={packsOpen}
          packs={c.capabilityPacks}
          busy={packsBusy}
          refreshing={packsRefreshing}
          progressText={c.packProgressText}
          focusPackId={focusPackId}
          onOpenChange={setPacksOpen}
          onRefresh={() => {
            setPacksRefreshing(true)
            void c.refreshCapabilityPacks().finally(() => setPacksRefreshing(false))
          }}
          onInstall={(packId) => {
            setPacksBusy(true)
            void c.installCapabilityPack(packId).finally(() => setPacksBusy(false))
          }}
          onVerifyFail={(packId) => {
            setPacksBusy(true)
            void c.installCapabilityPackVerifyFail(packId).finally(() => setPacksBusy(false))
          }}
          onUninstall={(packId) => {
            setPacksBusy(true)
            void c.uninstallCapabilityPack(packId).finally(() => setPacksBusy(false))
          }}
        />
      </div>
    </RuntimeFeatureGate>
  )
}
