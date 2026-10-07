import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"

interface ScanCancelButtonProps {
  label: string
  cancelRequested: boolean
  disabled?: boolean
  onCancel: () => void
}

/** Shared cancel action for session-backed network scans. */
export function ScanCancelButton({
  label,
  cancelRequested,
  disabled = false,
  onCancel,
}: ScanCancelButtonProps) {
  const { t } = useTranslation()

  return (
    <CommandHint hint={t("networkProbe.cmd.cancelScan")}>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || cancelRequested}
        aria-busy={cancelRequested}
        onClick={onCancel}
      >
        <span aria-live="polite">
          {cancelRequested ? t("networkProbe.scan.cancelling") : label}
        </span>
      </Button>
    </CommandHint>
  )
}
