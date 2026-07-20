/**
 * Destructive action confirmation / 危险操作确认: shared AlertDialog with optional
 * consequence callout for E5 (kill process, empty trash, etc.).
 */
import { useState } from "react"
import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const MIN_LOADING_MS = 300

export function DestructiveConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequence,
  confirmLabel,
  cancelLabel,
  onConfirm,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  consequence?: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void | Promise<void>
  loading?: boolean
}) {
  const [pending, setPending] = useState(false)

  const handleConfirm = async (event: React.MouseEvent) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    const startedAt = Date.now()
    try {
      await onConfirm()
    } finally {
      const elapsed = Date.now() - startedAt
      const wait = Math.max(0, MIN_LOADING_MS - elapsed)
      window.setTimeout(() => {
        setPending(false)
        onOpenChange(false)
      }, wait)
    }
  }

  const busy = pending || loading

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-muted-foreground space-y-3 pt-1 text-sm">
              <p>{description}</p>
              {consequence ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-200">
                  {consequence}
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={handleConfirm}>
            {pending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {confirmLabel}
              </>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
