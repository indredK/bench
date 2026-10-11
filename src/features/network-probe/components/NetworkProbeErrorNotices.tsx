import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import type { LocalizedError } from "@/lib/errors"

interface NetworkProbeErrorNoticesProps {
  errors: LocalizedError[]
  onDismiss: (key: string) => void
}

export function NetworkProbeErrorNotices({ errors, onDismiss }: NetworkProbeErrorNoticesProps) {
  const { t } = useTranslation()

  return (
    <div className="flex max-h-24 shrink-0 flex-col gap-1 overflow-y-auto">
      {errors.map((error) => (
        <div
          key={error.key}
          role="alert"
          className="border-destructive/40 bg-destructive/5 text-destructive flex shrink-0 items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <span>
            {t(error.key, {
              ...(error.values ?? {}),
              defaultValue: error.fallback,
            })}
          </span>
          <button
            type="button"
            className="-mt-1 -mr-1 rounded p-1 opacity-70 hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
            aria-label={t("networkProbe.actions.dismissError")}
            onClick={() => onDismiss(error.key)}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
