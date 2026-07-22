/**
 * Page View / 页面视图: design-stage stub; 设计阶段占位，能力落地前不调 IPC.
 */
import { Network } from "lucide-react"
import { useTranslation } from "react-i18next"

export default function NetworkProbePage() {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Network className="text-muted-foreground h-10 w-10" aria-hidden />
      <div className="space-y-1">
        <h1 className="text-lg font-medium">{t("networkProbe.stub.title")}</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          {t("networkProbe.stub.description")}
        </p>
      </div>
    </div>
  )
}
