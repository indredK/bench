/**
 * Feature UI / 功能界面: session command log side rail (prototype workspace).
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronsLeft, ChevronsRight } from "lucide-react"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const SIDE_LOG_OPEN_KEY = "network-probe:side-log-open"

interface CommandLogSidePanelProps {
  lines: string[]
  onClear: () => void
  /** Notifies parent so workspace grid can expand when collapsed. */
  onOpenChange?: (open: boolean) => void
}

function loadOpen(): boolean {
  if (typeof sessionStorage === "undefined") return true
  try {
    const raw = sessionStorage.getItem(SIDE_LOG_OPEN_KEY)
    if (raw === null) return true
    return raw === "1"
  } catch {
    return true
  }
}

function persistOpen(open: boolean) {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.setItem(SIDE_LOG_OPEN_KEY, open ? "1" : "0")
  } catch {
    // ignore
  }
}

export function CommandLogSidePanel({ lines, onClear, onOpenChange }: CommandLogSidePanelProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(loadOpen)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  const setOpenPersist = (next: boolean) => {
    setOpen(next)
    persistOpen(next)
  }

  if (!open) {
    return (
      <aside className="bg-muted/20 flex h-full w-9 shrink-0 flex-col items-center border-l py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t("networkProbe.sideLog.expand")}
          title={t("networkProbe.sideLog.expand")}
          onClick={() => setOpenPersist(true)}
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <span
          className="text-muted-foreground mt-3 text-[10px] font-semibold tracking-wider uppercase"
          style={{ writingMode: "vertical-rl" }}
        >
          {t("networkProbe.sideLog.title")}
        </span>
      </aside>
    )
  }

  return (
    <aside className="bg-muted/20 flex h-full min-h-0 w-full flex-col border-l">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-2 py-2">
        <h2 className="min-w-0 truncate text-xs font-semibold tracking-wide uppercase">
          {t("networkProbe.sideLog.title")}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={lines.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            {t("networkProbe.sideLog.clear")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("networkProbe.sideLog.collapse")}
            title={t("networkProbe.sideLog.collapse")}
            onClick={() => setOpenPersist(false)}
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
      <ScrollableArea className={cn("min-h-0 flex-1 p-2")} showBottomDot={false}>
        {lines.length === 0 ? (
          <p className="text-muted-foreground px-1 py-2 text-[11px]">
            {t("networkProbe.sideLog.empty")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {lines
              .slice()
              .reverse()
              .map((line, idx) => (
                <li
                  key={`${lines.length - idx}-${line.slice(0, 24)}`}
                  className="bg-background rounded-md border px-2 py-1.5 font-mono text-[10px] leading-snug break-all"
                >
                  {line}
                </li>
              ))}
          </ul>
        )}
      </ScrollableArea>

      <DestructiveConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t("networkProbe.sideLog.clearConfirmTitle")}
        description={t("networkProbe.sideLog.clearConfirmDescription")}
        confirmLabel={t("networkProbe.sideLog.clear")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          onClear()
          setConfirmClear(false)
        }}
      />
    </aside>
  )
}
