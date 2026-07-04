/**
 * Feature / 功能层: lazy-load hardware compare module; 只负责硬件模块延迟装载.
 */
import { AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { FeatureLoadError } from "@/components/common/FeatureLoadError"
import { getErrorMessage } from "@/lib/tauri/errors"
import HardwareCompare from "@/features/hardware/components/HardwareCompare"
import type { CompareDataModule } from "@/shared/compare/types"

interface HardwareCompareTabProps {
  loadModule: () => Promise<{ module: CompareDataModule<any> }>
}

export default function HardwareCompareTab({ loadModule }: HardwareCompareTabProps) {
  const { t } = useTranslation()
  const [module, setModule] = useState<CompareDataModule<any> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setModule(null)
    setLoadError(null)

    void loadModule()
      .then((loaded) => {
        if (!cancelled) {
          setModule(loaded.module)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, t("hardwareCompare.loadFailed")))
        }
      })

    return () => {
      cancelled = true
    }
  }, [loadModule, retryToken, t])

  if (loadError) {
    return (
      <FeatureLoadError
        title={t("hardwareCompare.loadFailedTitle")}
        description={loadError}
        icon={<AlertTriangle size={32} className="opacity-50" />}
        onRetry={() => setRetryToken((value) => value + 1)}
      />
    )
  }

  if (!module) {
    return (
      <div className="bg-card/40 flex h-full items-center justify-center rounded-xl border">
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </div>
    )
  }

  return <HardwareCompare module={module} />
}
