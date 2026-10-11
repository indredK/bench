import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

interface OpenSystemNetworkSettingsButtonProps {
  opening: boolean
  label: string
  onOpen: () => void
  size?: "default" | "sm"
}

export function OpenSystemNetworkSettingsButton({
  opening,
  label,
  onOpen,
  size = "default",
}: OpenSystemNetworkSettingsButtonProps) {
  const { t } = useTranslation()

  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      disabled={opening}
      aria-busy={opening}
      onClick={onOpen}
    >
      {opening ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
      {opening ? t("networkProbe.actions.openingSettings") : label}
    </Button>
  )
}
