/**
 * Page View / 页面视图: compose screen only; 只组合页面.
 */
import { Suspense, lazy, useMemo } from "react"
import {
  Cpu,
  CircuitBoard,
  HardDrive,
  MemoryStick,
  Monitor,
  Plug,
  Box,
  Wind,
  Network,
  Smartphone,
  Camera,
  Telescope,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { FeatureErrorBoundary } from "@/components/common/FeatureErrorBoundary"
import CompareTabs, { type CompareTabItem } from "@/shared/compare/CompareTabs"

const LazyHardwareTab = lazy(() => import("@extension/components/HardwareCompareTab"))

type HardwareModuleLoader = () => Promise<{
  default?: never
  module:
    | typeof import("@extension/data/cpu").cpuModule
    | typeof import("@extension/data/gpu").gpuModule
    | typeof import("@extension/data/memory").memoryModule
    | typeof import("@extension/data/ssd").ssdModule
    | typeof import("@extension/data/motherboard").motherboardModule
    | typeof import("@extension/data/monitor").monitorModule
    | typeof import("@extension/data/psu").psuModule
    | typeof import("@extension/data/case").caseModule
    | typeof import("@extension/data/cooler").coolerModule
    | typeof import("@extension/data/switch").switchModule
    | typeof import("@extension/data/phone").phoneModule
    | typeof import("@extension/data/phone-chipset").chipsetModule
    | typeof import("@extension/data/camera").cameraModule
    | typeof import("@extension/data/telescope").telescopeModule
}>

interface HardwareTabDef {
  id: string
  i18nPrefix: string
  icon: React.ReactNode
  loadModule: HardwareModuleLoader
}

const hardwareTabs: readonly HardwareTabDef[] = [
  {
    id: "cpu",
    i18nPrefix: "cpuCompare",
    icon: <Cpu size={16} />,
    loadModule: async () => ({ module: (await import("@extension/data/cpu")).cpuModule }),
  },
  {
    id: "gpu",
    i18nPrefix: "gpuCompare",
    icon: <Monitor size={16} />,
    loadModule: async () => ({ module: (await import("@extension/data/gpu")).gpuModule }),
  },
  {
    id: "memory",
    i18nPrefix: "memoryCompare",
    icon: <MemoryStick size={16} />,
    loadModule: async () => ({ module: (await import("@extension/data/memory")).memoryModule }),
  },
  {
    id: "ssd",
    i18nPrefix: "ssdCompare",
    icon: <HardDrive size={16} />,
    loadModule: async () => ({ module: (await import("@extension/data/ssd")).ssdModule }),
  },
  {
    id: "motherboard",
    i18nPrefix: "motherboardCompare",
    icon: <CircuitBoard size={16} />,
    loadModule: async () => ({
      module: (await import("@extension/data/motherboard")).motherboardModule,
    }),
  },
  {
    id: "monitor",
    i18nPrefix: "monitorCompare",
    icon: <Monitor size={16} />,
    loadModule: async () => ({ module: (await import("@extension/data/monitor")).monitorModule }),
  },
  {
    id: "psu",
    i18nPrefix: "psuCompare",
    icon: <Plug size={16} />,
    loadModule: async () => ({ module: (await import("@extension/data/psu")).psuModule }),
  },
  {
    id: "case",
    i18nPrefix: "caseCompare",
    icon: <Box size={16} />,
    loadModule: async () => ({ module: (await import("@extension/data/case")).caseModule }),
  },
  {
    id: "cooler",
    i18nPrefix: "coolerCompare",
    icon: <Wind size={16} />,
    loadModule: async () => ({ module: (await import("@extension/data/cooler")).coolerModule }),
  },
  {
    id: "switch",
    i18nPrefix: "switchCompare",
    icon: <Network size={16} />,
    loadModule: async () => ({ module: (await import("@extension/data/switch")).switchModule }),
  },
  {
    id: "phone",
    i18nPrefix: "phoneCompare",
    icon: <Smartphone size={16} />,
    loadModule: async () => ({ module: (await import("@extension/data/phone")).phoneModule }),
  },
  {
    id: "chipset",
    i18nPrefix: "phoneChipsetCompare",
    icon: <Cpu size={16} />,
    loadModule: async () => ({
      module: (await import("@extension/data/phone-chipset")).chipsetModule,
    }),
  },
  {
    id: "camera",
    i18nPrefix: "cameraCompare",
    icon: <Camera size={16} />,
    loadModule: async () => ({ module: (await import("@extension/data/camera")).cameraModule }),
  },
  {
    id: "telescope",
    i18nPrefix: "telescopeCompare",
    icon: <Telescope size={16} />,
    loadModule: async () => ({
      module: (await import("@extension/data/telescope")).telescopeModule,
    }),
  },
] as const

const GROUP_LABEL_KEYS = {
  cpu: "hardwareCompare.groupPcHardware",
  phone: "hardwareCompare.groupDigitalProducts",
} as const

function HardwareTabFallback() {
  const { t } = useTranslation()

  return (
    <div className="bg-card/40 flex h-full items-center justify-center rounded-xl border">
      <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
    </div>
  )
}

function HardwareComparePage() {
  const { t } = useTranslation()

  const tabs = useMemo<CompareTabItem[]>(
    () =>
      hardwareTabs.map((tab) => ({
        id: tab.id,
        i18nPrefix: tab.i18nPrefix,
        icon: tab.icon,
        content: (
          <Suspense fallback={<HardwareTabFallback />}>
            <LazyHardwareTab key={tab.id} loadModule={tab.loadModule} />
          </Suspense>
        ),
      })),
    [],
  )

  const groupLabels = useMemo(() => {
    const next: Record<string, string> = {}
    for (const [key, i18nKey] of Object.entries(GROUP_LABEL_KEYS)) {
      next[key] = t(i18nKey)
    }
    return next
  }, [t])

  return (
    <FeatureErrorBoundary titleKey="hardwareCompare.loadFailedTitle">
      <CompareTabs tabs={tabs} defaultTabId="cpu" groupLabels={groupLabels} />
    </FeatureErrorBoundary>
  )
}

export default HardwareComparePage
