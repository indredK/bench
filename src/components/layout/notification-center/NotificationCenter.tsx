/**
 * Layout UI / 布局 UI: shell notification center entry.
 *
 * 标题栏消息通知入口：铃铛触发按钮 + Popover 消息面板。
 * 消息数据由各功能通过 notification-center/store 推入（语言无关 key，渲染期解析）。
 */
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Bell, BellOff, CircleAlert, Info, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { resolveLocalizedMessage } from "./message"
import { useNotificationCenterStore } from "./store"
import type { AppNotification, AppNotificationLevel } from "./store"

const MAX_BADGE_COUNT = 9

const LEVEL_ICONS: Record<AppNotificationLevel, { icon: LucideIcon; className: string }> = {
  error: { icon: CircleAlert, className: "text-destructive" },
  warning: { icon: AlertTriangle, className: "text-amber-500" },
  info: { icon: Info, className: "text-sky-500" },
}

function NotificationItem({
  notification,
  onDismiss,
}: {
  notification: AppNotification
  onDismiss: (id: string) => void
}) {
  const { t } = useTranslation()
  const { icon: LevelIcon, className: levelClassName } = LEVEL_ICONS[notification.level]

  return (
    <li className="group hover:bg-muted/50 flex items-start gap-2 rounded-md px-2 py-2">
      <LevelIcon aria-hidden="true" className={cn("mt-0.5 size-3.5 shrink-0", levelClassName)} />
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-4 font-medium">
          {resolveLocalizedMessage(
            { key: notification.titleKey, params: notification.titleParams },
            t,
          )}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs leading-4">
          {resolveLocalizedMessage(
            { key: notification.descriptionKey, params: notification.descriptionParams },
            t,
          )}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        onClick={() => onDismiss(notification.id)}
        title={t("notificationCenter.dismiss")}
        aria-label={t("notificationCenter.dismiss")}
      >
        <X className="size-3" />
      </Button>
    </li>
  )
}

export function NotificationCenter() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const notifications = useNotificationCenterStore((s) => s.notifications)
  const dismissNotification = useNotificationCenterStore((s) => s.dismissNotification)
  const markAllRead = useNotificationCenterStore((s) => s.markAllRead)
  const clearAll = useNotificationCenterStore((s) => s.clearAll)

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  )

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (next) markAllRead()
    },
    [markAllRead],
  )

  const badgeLabel = unreadCount > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(unreadCount)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          data-no-window-drag
          className="relative"
          title={t("notificationCenter.title")}
          aria-label={
            unreadCount > 0
              ? t("notificationCenter.unreadCount", { count: unreadCount })
              : t("notificationCenter.title")
          }
        >
          <Bell size={14} />
          {unreadCount > 0 && (
            <span
              data-testid="unread-badge"
              className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[10px] leading-none font-medium"
            >
              {badgeLabel}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 gap-0 p-0">
        <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
          <span className="text-xs font-medium">{t("notificationCenter.title")}</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={clearAll}
            disabled={notifications.length === 0}
          >
            {t("notificationCenter.clearAll")}
          </Button>
        </div>

        {notifications.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-1.5 px-4 py-8 text-center">
            <BellOff aria-hidden="true" className="size-5" />
            <p className="text-xs">{t("notificationCenter.empty")}</p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto overscroll-contain p-1.5">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onDismiss={dismissNotification}
              />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
