/**
 * Sonner Notification Archive / 右下角 toast → 消息中心归档桥。
 *
 * 用户约定：右下角的操作反馈（sonner toast）必须留痕到右上角消息中心，
 * 否则转瞬即逝的 toast 无法事后追溯。本组件挂载于应用根部，通过 sonner
 * 的 `useSonner` 订阅**所有** toast（零侵入，不改任何既有 toast 调用点），
 * 以原文模式镜像进通知中心 store（category = "system"）。
 *
 * 原文模式的取舍：toast 在触发时已经按当时的 locale 渲染成文本，这里拿到的
 * 是渲染产物而非 i18n key，因此存原文；语言切换后历史记录不回译，属已知取舍。
 * 非字符串内容（JSX）降级为空并跳过，避免把 React 对象序列化成噪音。
 */
import { useEffect, useRef } from "react"
import { toast as sonner, useSonner } from "sonner"
import { useNotificationCenterStore } from "./store"
import type { AppNotificationLevel } from "./store"

type SonnerToast = {
  id: string | number
  type?: string
  title?: unknown
  description?: unknown
  action?: unknown
  cancel?: unknown
  promise?: unknown
  onDismiss?: unknown
  onAutoClose?: unknown
  duration?: number
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  return null
}

function toLevel(type: SonnerToast["type"]): AppNotificationLevel {
  if (type === "error") return "error"
  if (type === "warning") return "warning"
  return "info"
}

export function SonnerNotificationArchive() {
  const { toasts } = useSonner()
  const pushNotification = useNotificationCenterStore((s) => s.pushNotification)
  const archived = useRef(new Map<string, string>())

  useEffect(() => {
    const activeIds = new Set((toasts as SonnerToast[]).map((item) => String(item.id)))
    for (const id of archived.current.keys()) {
      if (!activeIds.has(id)) archived.current.delete(id)
    }
    for (const toast of toasts as SonnerToast[]) {
      const id = String(toast.id)
      const title = asText(toast.title)
      const description = asText(toast.description)
      if (title === null && description === null) continue
      const fingerprint = JSON.stringify([toast.type, title, description])
      if (archived.current.get(id) === fingerprint) continue
      archived.current.set(id, fingerprint)
      pushNotification({
        id: `toast:${id}`,
        level: toLevel(toast.type),
        titleText: title ?? "",
        descriptionText: description ?? "",
        category: "system",
      })
      // Only simple, fully archived success/info messages are moved to the bell.
      // Keep actionable, long-running, callback-bearing and custom-content toasts visible.
      if (
        (toast.type === "success" || toast.type === "info") &&
        title !== null &&
        (toast.description == null || description !== null) &&
        !toast.action &&
        !toast.cancel &&
        !toast.promise &&
        !toast.onDismiss &&
        !toast.onAutoClose &&
        toast.duration !== Infinity
      ) {
        sonner.dismiss(toast.id)
      }
    }
  }, [toasts, pushNotification])

  return null
}
