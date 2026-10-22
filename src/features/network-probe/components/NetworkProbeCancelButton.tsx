import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"

interface NetworkProbeCancelButtonProps {
  label: string
  cancelling: boolean
  disabled?: boolean
  onCancel: () => void
}

export function NetworkProbeCancelButton({
  label,
  cancelling,
  disabled = false,
  onCancel,
}: NetworkProbeCancelButtonProps) {
  const { t } = useTranslation()

  return (
    <CommandHint hint={t("networkProbe.cmd.cancelScan")}>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || cancelling}
        aria-live="polite"
        onClick={onCancel}
      >
        {cancelling ? t("networkProbe.cancelling") : label}
      </Button>
    </CommandHint>
  )
}
