/** Shared cancel action for long-running network probes. */
import { LoaderCircle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"

interface ProbeCancelButtonProps {
  canCancel: boolean
  cancelling: boolean
  cancelLabel: string
  onCancel: () => void
}

export function ProbeCancelButton({
  canCancel,
  cancelling,
  cancelLabel,
  onCancel,
}: ProbeCancelButtonProps) {
  const { t } = useTranslation()

  return (
    <CommandHint hint={t("networkProbe.cmd.cancelScan")}>
      <Button
        type="button"
        variant="outline"
        disabled={!canCancel || cancelling}
        aria-busy={cancelling}
        onClick={onCancel}
      >
        {cancelling ? (
          <LoaderCircle aria-hidden="true" className="mr-2 size-3 animate-spin" />
        ) : null}
        {cancelling ? t("networkProbe.common.cancelling") : cancelLabel}
      </Button>
    </CommandHint>
  )
}
