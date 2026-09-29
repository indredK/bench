/**
 * Layout UI / 布局 UI: verify language switching changes the effective locale.
 */
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import LanguageSwitcher from "../LanguageSwitcher"

const state = vi.hoisted(() => ({
  changeLanguage: vi.fn(async (_language: string) => {}),
  setCurrentWindowTitle: vi.fn(async (_title: string) => {}),
  setTrayLabels: vi.fn(async (_labels: Record<string, string>) => {}),
  readStorageItem: vi.fn((_key: string) => null as string | null),
  writeStorageItem: vi.fn((_key: string, _value: string) => {}),
  removeStorageItem: vi.fn((_key: string) => {}),
  systemLanguage: "zh" as "zh" | "en",
  storedMode: null as string | null,
}))

const translations: Record<string, string> = {
  "language.system": "跟随系统",
  "language.en": "English",
  "language.zh": "中文",
  "language.switchTo": "点击切换到 {{next}}",
  "language.current": "当前：",
  "common.appTitle": "Bench",
  "tray.show": "显示 Bench",
  "tray.preventSleep": "防止睡眠",
  "tray.launchAtLogin": "登录时启动",
  "tray.quit": "退出",
}

function translate(key: string, options?: { next?: string }) {
  return (translations[key] ?? key).replace("{{next}}", options?.next ?? "{{next}}")
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}))

vi.mock("@/i18n/config", () => ({
  __esModule: true,
  default: {
    changeLanguage: state.changeLanguage,
    t: translate,
  },
  detectSystemLanguage: () => state.systemLanguage,
}))

vi.mock("@/platform/storage", () => ({
  readStorageItem: (key: string) => (key === "languageMode" ? state.storedMode : null),
  writeStorageItem: (key: string, value: string) => {
    if (key === "languageMode") state.storedMode = value
    state.writeStorageItem(key, value)
  },
  removeStorageItem: (key: string) => {
    if (key === "languageMode") state.storedMode = null
    state.removeStorageItem(key)
  },
}))

vi.mock("@/platform/window", () => ({
  setCurrentWindowTitle: state.setCurrentWindowTitle,
}))

vi.mock("@/lib/tauri/commands", () => ({
  setTrayLabels: state.setTrayLabels,
}))

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.storedMode = null
    state.systemLanguage = "zh"
  })

  it("skips the same effective language when system mode already resolves to Chinese", async () => {
    const user = userEvent.setup()
    render(<LanguageSwitcher />)

    const switchButton = screen.getByRole("button", { name: "点击切换到 English" })
    await user.click(switchButton)

    await waitFor(() => expect(state.changeLanguage).toHaveBeenCalledWith("en"))
    expect(state.writeStorageItem).toHaveBeenCalledWith("languageMode", "en")
  })

  it("skips the same effective language when system mode already resolves to English", async () => {
    state.systemLanguage = "en"
    const user = userEvent.setup()
    render(<LanguageSwitcher />)

    const switchButton = screen.getByRole("button", { name: "点击切换到 中文" })
    await user.click(switchButton)

    await waitFor(() => expect(state.changeLanguage).toHaveBeenCalledWith("zh"))
    expect(state.writeStorageItem).toHaveBeenCalledWith("languageMode", "zh")
  })

  it("returns to system mode when that resolves to a different language", async () => {
    state.storedMode = "en"
    state.systemLanguage = "zh"
    const user = userEvent.setup()
    render(<LanguageSwitcher />)

    const switchButton = screen.getByRole("button", { name: "点击切换到 跟随系统" })
    await user.click(switchButton)

    await waitFor(() => expect(state.changeLanguage).toHaveBeenCalledWith("zh"))
    expect(state.removeStorageItem).toHaveBeenCalledWith("languageMode")
  })
})
