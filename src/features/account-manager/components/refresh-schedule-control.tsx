/**
 * Refresh schedule control / 会话保活设置控件(详情栏账号信息区).
 * 紧凑单行布局:左标题右控件;开关 + 模式(每 N 小时/每天定时) + 参数 + 下次执行时间.
 * 变更即时保存(防重入由 controller 的 useGuardedAsyncSet 保证).
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ScrollText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { RefreshSchedule } from "@/lib/tauri/types/account-manager"

const DEFAULT_INTERVAL_HOURS = 6
const DEFAULT_DAILY_MINUTE_OF_DAY = 9 * 60

function minuteOfDayToTime(minuteOfDay: number): string {
  const hours = Math.floor(minuteOfDay / 60)
  const minutes = minuteOfDay % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function timeToMinuteOfDay(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{1,2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

export function RefreshScheduleControl({
  schedule,
  nextRefreshAtTs,
  saving,
  onScheduleChange,
  onViewLogs,
}: {
  schedule: RefreshSchedule | null
  nextRefreshAtTs: number | null
  saving: boolean
  onScheduleChange: (next: RefreshSchedule | null) => void
  onViewLogs: () => void
}) {
  const { t, i18n } = useTranslation()
  const enabled = schedule?.enabled ?? false
  const mode = schedule?.mode ?? { type: "interval", hours: DEFAULT_INTERVAL_HOURS }

  const [hoursText, setHoursText] = useState(
    mode.type === "interval" ? String(mode.hours) : String(DEFAULT_INTERVAL_HOURS),
  )
  const [timeText, setTimeText] = useState(
    mode.type === "daily"
      ? minuteOfDayToTime(mode.minuteOfDay)
      : minuteOfDayToTime(DEFAULT_DAILY_MINUTE_OF_DAY),
  )

  // 账号切换或后端刷新时同步本地草稿。
  useEffect(() => {
    setHoursText(mode.type === "interval" ? String(mode.hours) : String(DEFAULT_INTERVAL_HOURS))
    setTimeText(
      mode.type === "daily"
        ? minuteOfDayToTime(mode.minuteOfDay)
        : minuteOfDayToTime(DEFAULT_DAILY_MINUTE_OF_DAY),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule])

  const handleToggle = (next: boolean) => {
    if (next) {
      // 开启:保留已有 mode,否则默认 interval 6h。
      onScheduleChange({
        enabled: true,
        mode: schedule?.mode ?? { type: "interval", hours: DEFAULT_INTERVAL_HOURS },
      })
    } else {
      // 关闭:保留配置,仅暂停调度;从未配置过则直接清除。
      if (schedule) {
        onScheduleChange({ enabled: false, mode: schedule.mode })
      } else {
        onScheduleChange(null)
      }
    }
  }

  const handleModeChange = (next: "interval" | "daily") => {
    if (next === "interval") {
      const hours = Number(hoursText)
      const safeHours =
        Number.isFinite(hours) && hours >= 1 && hours <= 8760
          ? Math.floor(hours)
          : DEFAULT_INTERVAL_HOURS
      onScheduleChange({ enabled: true, mode: { type: "interval", hours: safeHours } })
    } else {
      const minuteOfDay = timeToMinuteOfDay(timeText) ?? DEFAULT_DAILY_MINUTE_OF_DAY
      onScheduleChange({ enabled: true, mode: { type: "daily", minuteOfDay } })
    }
  }

  const commitHours = () => {
    const hours = Number(hoursText)
    if (!Number.isFinite(hours) || hours < 1 || hours > 8760) {
      setHoursText(mode.type === "interval" ? String(mode.hours) : String(DEFAULT_INTERVAL_HOURS))
      return
    }
    const next = Math.floor(hours)
    if (mode.type === "interval" && mode.hours === next) return
    onScheduleChange({ enabled: true, mode: { type: "interval", hours: next } })
  }

  const commitTime = () => {
    const minuteOfDay = timeToMinuteOfDay(timeText)
    if (minuteOfDay === null) {
      setTimeText(
        mode.type === "daily"
          ? minuteOfDayToTime(mode.minuteOfDay)
          : minuteOfDayToTime(DEFAULT_DAILY_MINUTE_OF_DAY),
      )
      return
    }
    if (mode.type === "daily" && mode.minuteOfDay === minuteOfDay) return
    onScheduleChange({ enabled: true, mode: { type: "daily", minuteOfDay } })
  }

  const formatNextRun = (ts: number) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(ts * 1000))
    } catch {
      return new Date(ts * 1000).toLocaleString()
    }
  }

  return (
    <div className="space-y-2 py-2">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t("accountManager.sessionKeeper.title")}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={onViewLogs}
          disabled={saving}
        >
          <ScrollText size={13} />
          {t("accountManager.sessionKeeper.viewLogs")}
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={saving}
            aria-label={t("accountManager.sessionKeeper.title")}
          />
          <Select
            value={mode.type}
            onValueChange={(value) => handleModeChange(value as "interval" | "daily")}
            disabled={saving || !enabled}
          >
            <SelectTrigger
              className="h-8 w-[130px] text-xs"
              aria-label={t("accountManager.sessionKeeper.modeLabel")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="interval" className="text-xs">
                {t("accountManager.sessionKeeper.mode.interval")}
              </SelectItem>
              <SelectItem value="daily" className="text-xs">
                {t("accountManager.sessionKeeper.mode.daily")}
              </SelectItem>
            </SelectContent>
          </Select>
          {mode.type === "interval" ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                max={8760}
                value={hoursText}
                onChange={(e) => setHoursText(e.target.value)}
                onBlur={commitHours}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitHours()
                }}
                disabled={saving || !enabled}
                className="h-8 w-20 text-xs"
                aria-label={t("accountManager.sessionKeeper.intervalHoursLabel")}
              />
              <span className="text-muted-foreground text-xs">
                {t("accountManager.sessionKeeper.hoursUnit")}
              </span>
            </div>
          ) : (
            <Input
              type="time"
              value={timeText}
              onChange={(e) => setTimeText(e.target.value)}
              onBlur={commitTime}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTime()
              }}
              disabled={saving || !enabled}
              className="h-8 w-[104px] text-xs"
              aria-label={t("accountManager.sessionKeeper.dailyTimeLabel")}
            />
          )}
        </div>
      </div>
      {enabled && nextRefreshAtTs != null && (
        <p className="text-muted-foreground py-0.5 text-xs">
          {t("accountManager.sessionKeeper.nextRun", { time: formatNextRun(nextRefreshAtTs) })}
        </p>
      )}
    </div>
  )
}
