/**
 * Notification Center / 消息中心: shell-level notification state.
 *
 * store 只存语言无关 canonical value（i18n key + 插值参数），文案在渲染期经 t() 解析，
 * 切换语言后无需来源重新推送即可跟随 locale（见 message.ts）。
 *
 * 分类（category）：
 * - `system`：操作反馈归档（右下角 toast 的镜像记录，由 sonner-archive 桥自动写入，
 *   原文模式存储——toast 内容在触发时已按当时 locale 渲染）；
 * - `announcement`：系统级公告（能力待验收摘要、启动诊断等，i18n key 模式，跟随语言）。
 */
import { create } from "zustand"

export type AppNotificationLevel = "error" | "warning" | "info"
export type AppNotificationCategory = "system" | "announcement"

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
  /** 缺省为 "system"。 */
  category?: AppNotificationCategory
  titleKey?: string
  titleParams?: Record<string, LocalizedParam>
  descriptionKey?: string
  descriptionParams?: Record<string, LocalizedParam>
  /** 原文模式（toast 归档）：内容在推送时已渲染，直接存储，不走 i18n。 */
  titleText?: string
  descriptionText?: string
}

export interface AppNotification extends Omit<AppNotificationInput, "category"> {
  category: AppNotificationCategory
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

/** 内容指纹：category + 文案（key/原文）+ 参数，用于判断推送是否带来新信息。 */
function contentFingerprint(notification: AppNotificationInput): string {
  return JSON.stringify([
    notification.level,
    notification.category ?? "system",
    notification.titleKey ?? null,
    notification.titleText ?? null,
    notification.titleParams ?? null,
    notification.descriptionKey ?? null,
    notification.descriptionText ?? null,
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
      const notification: AppNotification = {
        ...input,
        category: input.category ?? "system",
        createdAt: Date.now(),
        read: false,
      }
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
