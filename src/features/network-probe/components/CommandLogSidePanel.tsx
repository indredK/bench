/**
 * Feature UI / 功能界面: session command log side rail (prototype workspace).
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ScrollableArea } from "@/components/common/ScrollableArea"

interface CommandLogSidePanelProps {
  lines: string[]
  onClear: () => void
}

export function CommandLogSidePanel({ lines, onClear }: CommandLogSidePanelProps) {
  const { t } = useTranslation()
  return (
    <aside className="bg-muted/20 flex h-full min-h-0 w-full flex-col border-l">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          {t("networkProbe.sideLog.title")}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onClear}
        >
          {t("networkProbe.sideLog.clear")}
        </Button>
      </div>
      <ScrollableArea className="min-h-0 flex-1 p-2" showBottomDot={false}>
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
    </aside>
  )
}
