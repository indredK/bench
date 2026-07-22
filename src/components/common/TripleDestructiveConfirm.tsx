/**
 * Triple-step destructive confirmation / 三次危险确认:
 * single dialog state machine (impact → params → acknowledge + phrase).
 */
import { useEffect, useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const MIN_LOADING_MS = 300

export type TripleConfirmStepContent = {
  title: string
  description: string
  consequence?: ReactNode
}

export function TripleDestructiveConfirm({
  open,
  onOpenChange,
  step1,
  step2,
  step3,
  confirmPhrase,
  phraseLabel,
  acknowledgeLabel,
  nextLabel,
  backLabel,
  confirmLabel,
  cancelLabel,
  onConfirm,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  step1: TripleConfirmStepContent
  step2: TripleConfirmStepContent
  step3: TripleConfirmStepContent
  /** Exact phrase the user must type on step 3 (case-sensitive). */
  confirmPhrase: string
  phraseLabel: string
  acknowledgeLabel: string
  nextLabel: string
  backLabel: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void | Promise<void>
  loading?: boolean
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [acked, setAcked] = useState(false)
  const [phrase, setPhrase] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) {
      setStep(1)
      setAcked(false)
      setPhrase("")
      setPending(false)
    }
  }, [open])

  const busy = pending || Boolean(loading)
  const current = step === 1 ? step1 : step === 2 ? step2 : step3
  const canConfirm = step === 3 && acked && phrase === confirmPhrase && !busy

  const handleClose = (next: boolean) => {
    if (busy) return
    onOpenChange(next)
  }

  const handleConfirm = async (event: React.MouseEvent) => {
    event.preventDefault()
    if (!canConfirm) return
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

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <span className="text-muted-foreground mr-2 font-mono text-xs">{step}/3</span>
            {current.title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-muted-foreground space-y-3 pt-1 text-sm">
              <p>{current.description}</p>
              {current.consequence ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-200">
                  {current.consequence}
                </div>
              ) : null}
              {step === 3 ? (
                <div className="space-y-3">
                  <label className="text-foreground flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={acked}
                      disabled={busy}
                      onChange={(e) => setAcked(e.target.checked)}
                    />
                    <span>{acknowledgeLabel}</span>
                  </label>
                  <div className="space-y-1">
                    <label
                      className="text-foreground text-xs font-medium"
                      htmlFor="triple-confirm-phrase"
                    >
                      {phraseLabel}
                    </label>
                    <Input
                      id="triple-confirm-phrase"
                      value={phrase}
                      disabled={busy}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => setPhrase(e.target.value)}
                      placeholder={confirmPhrase}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
            >
              {backLabel}
            </Button>
          ) : null}
          {step < 3 ? (
            <Button type="button" disabled={busy} onClick={() => setStep((s) => (s === 1 ? 2 : 3))}>
              {nextLabel}
            </Button>
          ) : (
            <AlertDialogAction variant="destructive" disabled={!canConfirm} onClick={handleConfirm}>
              {pending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {confirmLabel}
                </>
              ) : (
                confirmLabel
              )}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
