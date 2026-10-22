/**
 * Feature UI / 功能界面: integrated six-section basic network dashboard.
 */
import { useRef } from "react"
import type { ComponentProps, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { EgressPanel } from "@/features/network-probe/components/EgressPanel"
import { FixPanel } from "@/features/network-probe/components/FixPanel"
import { HealthTreePanel } from "@/features/network-probe/components/HealthTreePanel"
import { Ipv6Panel } from "@/features/network-probe/components/Ipv6Panel"
import { MtuPanel } from "@/features/network-probe/components/MtuPanel"
import { OfflinePanel } from "@/features/network-probe/components/OfflinePanel"
import { OverviewPanel } from "@/features/network-probe/components/OverviewPanel"
import { ReportPanel } from "@/features/network-probe/components/ReportPanel"
import { ScanOpinionPanel } from "@/features/network-probe/components/ScanOpinionPanel"
import { OFFLINE_SUBS, type NetworkProbeOfflineSub } from "@/features/network-probe/store"
import { cn } from "@/lib/utils"

type SectionId = "overview" | "tree" | "opinion" | "offline" | "fix" | "report"

type OverviewProps = Omit<ComponentProps<typeof OverviewPanel>, "embedded">
type HealthProps = Omit<ComponentProps<typeof HealthTreePanel>, "embedded">
type FixProps = Omit<ComponentProps<typeof FixPanel>, "embedded">
type ReportProps = Omit<ComponentProps<typeof ReportPanel>, "embedded" | "onGoTree">

interface OfflineProps {
  loading: boolean
  loadingIpv6: boolean
  loadingMtu: boolean
  loadingEgress: boolean
  focus: NetworkProbeOfflineSub
  captive: ComponentProps<typeof OfflinePanel>["captive"]
  publicIp: ComponentProps<typeof OfflinePanel>["publicIp"]
  proxyVpn: ComponentProps<typeof OfflinePanel>["proxyVpn"]
  ipv6: ComponentProps<typeof OfflinePanel>["ipv6"]
  mtu: ComponentProps<typeof OfflinePanel>["mtu"]
  onRunAll: () => void
  onSelectFocus: (focus: NetworkProbeOfflineSub) => void
  onCheckIpv6: () => void
  onProbeMtu: ComponentProps<typeof MtuPanel>["onRun"]
  onRefreshEgress: () => void
  onOpenMtu: () => void
}

interface BasicViewProps {
  overview: OverviewProps
  health: HealthProps
  offline: OfflineProps
  fix: FixProps
  report: ReportProps
}

const SECTIONS: { id: SectionId; titleKey: string }[] = [
  { id: "overview", titleKey: "networkProbe.l2.overview" },
  { id: "tree", titleKey: "networkProbe.l2.tree" },
  { id: "opinion", titleKey: "networkProbe.l2.opinion" },
  { id: "offline", titleKey: "networkProbe.l2.offline" },
  { id: "fix", titleKey: "networkProbe.l2.fix" },
  { id: "report", titleKey: "networkProbe.l2.report" },
]

export function BasicView({ overview, health, offline, fix, report }: BasicViewProps) {
  const { t } = useTranslation()
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({})

  const scrollTo = (id: SectionId) => {
    const section = sectionRefs.current[id]
    if (!section) return
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    section.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })
  }

  const section = (id: SectionId, children: ReactNode) => (
    <section
      key={id}
      id={`network-probe-basic-${id}`}
      ref={(element) => {
        sectionRefs.current[id] = element
      }}
      aria-labelledby={`network-probe-basic-${id}-title`}
      className="bg-card/30 min-w-0 scroll-mt-3 space-y-3 rounded-lg border p-3"
    >
      <h3 id={`network-probe-basic-${id}-title`} className="text-sm font-semibold">
        {t(`networkProbe.l2.${id}`)}
      </h3>
      {children}
    </section>
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <nav className="flex shrink-0 flex-wrap gap-1.5 pb-2" aria-label={t("networkProbe.nav.l2")}>
        {SECTIONS.map(({ id, titleKey }) => (
          <Button
            key={id}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            aria-controls={`network-probe-basic-${id}`}
            onClick={() => scrollTo(id)}
          >
            {t(titleKey)}
          </Button>
        ))}
      </nav>

      <ScrollableArea
        wrapperClassName="flex min-h-0 min-w-0 flex-1"
        className="min-h-0 flex-1 pr-1 pb-2"
        showBottomDot={false}
      >
        <div className="space-y-3 pb-2">
          {section("overview", <OverviewPanel {...overview} embedded />)}
          {section("tree", <HealthTreePanel {...health} embedded />)}
          {section(
            "opinion",
            <ScanOpinionPanel result={health.result} onGoTree={() => scrollTo("tree")} embedded />,
          )}
          {section(
            "offline",
            <div className="space-y-3">
              <nav className="flex flex-wrap gap-1.5" aria-label={t("networkProbe.offline.subNav")}>
                {OFFLINE_SUBS.map((focus) => (
                  <button
                    key={focus}
                    type="button"
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                      offline.focus === focus
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    aria-pressed={offline.focus === focus}
                    onClick={() => offline.onSelectFocus(focus)}
                  >
                    {t(`networkProbe.offline.sub.${focus}`)}
                  </button>
                ))}
              </nav>
              <OfflinePanel
                loading={offline.loading}
                focus={offline.focus}
                captive={offline.captive}
                publicIp={offline.publicIp}
                proxyVpn={offline.proxyVpn}
                ipv6={offline.ipv6}
                mtu={offline.mtu}
                onRunAll={offline.onRunAll}
                onOpenMtu={offline.onOpenMtu}
              />
              {offline.focus === "all" || offline.focus === "ipv6" ? (
                <Ipv6Panel
                  loading={offline.loadingIpv6 || offline.loading}
                  result={offline.ipv6}
                  onRun={offline.onCheckIpv6}
                  dualFrom="offline"
                />
              ) : null}
              {offline.focus === "all" || offline.focus === "mtu" ? (
                <MtuPanel
                  loading={offline.loadingMtu || offline.loading}
                  result={offline.mtu}
                  onRun={offline.onProbeMtu}
                  dualFrom="offline"
                />
              ) : null}
              {offline.focus === "egress" ? (
                <EgressPanel
                  loading={offline.loadingEgress || offline.loading}
                  result={offline.publicIp}
                  onRun={offline.onRefreshEgress}
                  dualFrom="offline"
                />
              ) : null}
            </div>,
          )}
          {section("fix", <FixPanel {...fix} embedded />)}
          {section(
            "report",
            <ReportPanel {...report} onGoTree={() => scrollTo("tree")} embedded />,
          )}
        </div>
      </ScrollableArea>
    </div>
  )
}
