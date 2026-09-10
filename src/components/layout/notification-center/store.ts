/**
 * Notification Center / 消息中心: shell-level notification state.
 *
 * store 只存语言无关 canonical value（i18n key + 插值参数），文案在渲染期经 t() 解析，
 * 切换语言后无需来源重新推送即可跟随 locale（见 message.ts）。
 */
import { create } from "zustand"

export type AppNotificationLevel = "error" | "warning" | "info"

/** 可嵌套的本地化消息描述：descriptor 在渲染期翻译，数组按 ", " 连接。 */
export interface LocalizedMessage {
  key: string
  params?: Record<string, LocalizedParam>
}

export type LocalizedParam = string | number | LocalizedMessage | LocalizedParam[]

export interface AppNotificationInput {
  /** 稳定 id：同一来源重复推送时按 id upsert，不追加重复消息。 */
  id: string
  level: AppNotificationLevel
  titleKey: string
  titleParams?: Record<string, LocalizedParam>
  descriptionKey: string
  descriptionParams?: Record<string, LocalizedParam>
}

export interface AppNotification extends AppNotificationInput {
  createdAt: number
  read: boolean
}

interface NotificationCenterState {
  notifications: AppNotification[]
  pushNotification: (input: AppNotificationInput) => void
  dismissNotification: (id: string) => void
  markAllRead: () => void
  clearAll: () => void
}

/** 内容指纹：level + 文案 key + 参数，用于判断推送是否带来新信息。 */
function contentFingerprint(notification: AppNotificationInput): string {
  return JSON.stringify([
    notification.level,
    notification.titleKey,
    notification.titleParams ?? null,
    notification.descriptionKey,
    notification.descriptionParams ?? null,
  ])
}

export const useNotificationCenterStore = create<NotificationCenterState>((set) => ({
  notifications: [],

  pushNotification: (input) =>
    set((state) => {
      const fingerprint = contentFingerprint(input)
      const existing = state.notifications.find((item) => item.id === input.id)
      // 内容未变时保留已读状态，避免同一状态重复点亮未读角标。
      if (existing && contentFingerprint(existing) === fingerprint) return state
      const notification: AppNotification = { ...input, createdAt: Date.now(), read: false }
      const rest = state.notifications.filter((item) => item.id !== input.id)
      return { notifications: [notification, ...rest] }
    }),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((item) => item.id !== id),
    })),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((item) =>
        item.read ? item : { ...item, read: true },
      ),
    })),

  clearAll: () => set({ notifications: [] }),
}))
