/**
 * Dev Toolbox Page / 开发工具箱: 统一入口，5 个子 Tab。
 *
 * 收容: 端口管理 / 环境检测 / 开发工具 / 网络诊断 / 系统信息
 *
 * 三个内联面板（开发工具/诊断/信息）已拆到 ./components/*-panel.tsx（planned#9），
 * 本文件只做 Tab 编排与装配；各面板共享同一个 controller 实例（状态只在顶层初始化一次）。
 */
import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"
import { Loader2Icon, Code, Network, Monitor, Zap, Box } from "lucide-react"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { envDetectorFeature } from "@/features/env-detector/feature"
import { portManagerFeature } from "@/features/port-manager/feature"
import type { AppFeature } from "@/features/types"
import {
  useDevToolboxController,
  type ToolboxTab,
} from "@/features/dev-toolbox/hooks/useDevToolboxController"
import { DevtoolsPanel } from "@/features/dev-toolbox/components/devtools-panel"
import { DiagnosticsPanel } from "@/features/dev-toolbox/components/diagnostics-panel"
import { InfoPanel } from "@/features/dev-toolbox/components/info-panel"

const PortManager = lazy(() => import("@/features/port-manager/page"))
const EnvDetector = lazy(() => import("@/features/env-detector/page"))

// Full-page tools own their internal scroll (h-full + nested ScrollableArea).
// Mounting them inside the outer ScrollableArea creates a fragile double h-full
// height chain (outer scroll tag is NOT a flex container, inner uses h-full),
// which collapses and breaks scrolling. Give them a plain flex-1 min-h-0 box
// instead — same height context they get as a standalone route (motion.div.h-full).
const FULL_PAGE_TOOL_TABS = new Set<ToolboxTab>(["port-manager", "env-detector"])

interface DevToolboxProps {
  feature: AppFeature
}

function PageFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2Icon className="text-muted-foreground h-5 w-5 animate-spin" />
    </div>
  )
}

/**
 * 路由仍然传入工具箱自己的 descriptor，但这里不再往下传：门控条件属于各子功能
 * （端口管理/环境检测都是 desktopOnly:true），传工具箱的会把子页面的「仅桌面」占位吃掉。
 */
export default function DevToolbox(_props: DevToolboxProps) {
  const { t } = useTranslation()
  const controller = useDevToolboxController()
  const { activeTab, setActiveTab } = controller

  // ── Rendering the active full-page tool ──
  // For port-manager, env-detector: render their page component directly.
  // These components use their own controllers/hooks and work independently.
  const renderActiveTab = () => {
    switch (activeTab) {
      case "port-manager":
        return (
          <Suspense fallback={<PageFallback />}>
            {/* 门控条件属于子功能自己：传工具箱的 descriptor（desktopOnly:false）
                会让子页面在非桌面环境下不再显示「仅桌面功能」占位。 */}
            <PortManager feature={portManagerFeature} />
          </Suspense>
        )
      case "env-detector":
        return (
          <Suspense fallback={<PageFallback />}>
            <EnvDetector active feature={envDetectorFeature} />
          </Suspense>
        )
      case "devtools":
        return <DevtoolsPanel controller={controller} />
      case "diagnostics":
        return <DiagnosticsPanel controller={controller} />
      case "info":
        return <InfoPanel controller={controller} />
      default:
        return null
    }
  }

  const tabs: { id: ToolboxTab; labelKey: string; icon: typeof Zap }[] = [
    { id: "port-manager", labelKey: "sidebar.portManager", icon: Zap },
    { id: "env-detector", labelKey: "sidebar.envDetector", icon: Box },
    { id: "devtools", labelKey: "devToolbox.devtools", icon: Code },
    { id: "diagnostics", labelKey: "devToolbox.diagnostics", icon: Network },
    { id: "info", labelKey: "devToolbox.info", icon: Monitor },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-4">
        {tabs.map(({ id, labelKey, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            onClick={() => setActiveTab(id)}
            className={cn(
              "-mb-[1px] flex items-center gap-1.5 rounded-none border-b-2 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
              activeTab === id
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground hover:border-border border-transparent",
            )}
          >
            <Icon size={13} /> {t(labelKey)}
          </Button>
        ))}
      </div>
      {FULL_PAGE_TOOL_TABS.has(activeTab) ? (
        <div className="min-h-0 flex-1">{renderActiveTab()}</div>
      ) : (
        <ScrollableArea className="flex-1 p-4" wrapperClassName="flex flex-1 min-h-0">
          {renderActiveTab()}
        </ScrollableArea>
      )}
    </div>
  )
}
