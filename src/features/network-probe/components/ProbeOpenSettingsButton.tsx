/** Shared guarded action for opening macOS Network Settings. */
import { LoaderCircle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

interface ProbeOpenSettingsButtonProps {
  label: string
  opening: boolean
  onOpen: () => void
  size?: "default" | "sm"
}

export function ProbeOpenSettingsButton({
  label,
  opening,
  onOpen,
  size = "default",
}: ProbeOpenSettingsButtonProps) {
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
      {opening ? <LoaderCircle aria-hidden="true" className="mr-2 size-3 animate-spin" /> : null}
      {opening ? t("networkProbe.common.openingSettings") : label}
    </Button>
  )
}
