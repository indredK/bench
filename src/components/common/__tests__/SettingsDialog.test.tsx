import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SettingsDialog } from "@/components/common/SettingsDialog"

const {
  changeLanguage,
  removeStorageItem,
  readStorageItem,
  setCurrentWindowTitle,
  setTheme,
  setWindowThemeId,
  setTrayLabels,
  getAutostartStatus,
  setAutostart,
  getCloseBehavior,
  setCloseBehavior,
  translations,
  writeStorageItem,
} = vi.hoisted(() => ({
  changeLanguage: vi.fn(async () => {}),
  setCurrentWindowTitle: vi.fn(async () => {}),
  readStorageItem: vi.fn(),
  writeStorageItem: vi.fn(),
  removeStorageItem: vi.fn(),
  setTheme: vi.fn(),
  setWindowThemeId: vi.fn(),
  setTrayLabels: vi.fn(async () => {}),
  getAutostartStatus: vi.fn(async () => false),
  setAutostart: vi.fn(async () => {}),
  getCloseBehavior: vi.fn(async () => "minimize_to_tray"),
  setCloseBehavior: vi.fn(async () => {}),
  translations: {
    "sidebar.settings": "Settings",
    "settings.title": "Settings",
    "settings.tabs.general": "General",
    "settings.tabs.appearance": "Appearance",
    "settings.tabs.about": "About",
    "language.switch": "Switch Language",
    "language.system": "System",
    "language.en": "English",
    "language.zh": "中文",
    "theme.sectionTitle": "Theme",
    "theme.system": "System",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.currentMode": "Current",
    "windowTheme.label": "Window Theme",
    "windowTheme.default": "Default",
    "windowTheme.glass": "Frosted Glass",
    "windowTheme.unsupportedTooltip": "This theme is only available on macOS",
    "navigationLayout.label": "Navigation Layout",
    "navigationLayout.sidebar": "Classic Sidebar",
    "navigationLayout.topTab": "Top Tabs",
    "navigationLayout.bottomTab": "Bottom Tabs",
    "startup.launchAtLogin": "Launch at Login",
    "startup.launchAtLoginDesc": "Automatically launch Bench when you log in",
    "startup.launchAtLoginError": "Failed to set launch at login: {{error}}",
    "closeBehavior.title": "Close Behavior",
    "closeBehavior.minimizeToTray": "Minimize to Tray",
    "closeBehavior.minimizeToTrayDesc": "Keep running in the background",
    "closeBehavior.quit": "Quit",
    "closeBehavior.quitDesc": "Exit the application completely",
    "closeBehavior.alwaysAsk": "Always Ask",
    "closeBehavior.alwaysAskDesc": "Show a dialog each time",
    "common.appTitle": "Bench - DevTools",
    "common.unknown": "Unknown",
    "common.retry": "Retry",
    "about.description": "All-in-one developer toolkit for macOS",
    "about.version": "Version",
    "about.runtime": "Runtime",
    "updater.title": "Software Update",
    "updater.checkNow": "Check for Updates",
    "updater.autoCheck": "Automatically check for updates",
    "updater.autoCheckDescription": "Check quietly every 24 hours",
    "tray.show": "Show Bench",
    "tray.preventSleep": "Prevent Sleep",
    "tray.launchAtLogin": "Launch at Login",
    "tray.quit": "Quit",
  } as Record<string, string>,
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "system",
    setTheme,
  }),
}))

vi.mock("@/i18n/config", () => ({
  __esModule: true,
  default: {
    changeLanguage,
    t: (key: string) => translations[key] ?? key,
  },
  detectSystemLanguage: () => "zh",
}))

vi.mock("@/platform/window", () => ({
  setCurrentWindowTitle,
}))

vi.mock("@/platform/storage", () => ({
  readStorageItem,
  writeStorageItem,
  removeStorageItem,
}))

vi.mock("@/hooks/useWindowTheme", () => ({
  useWindowTheme: () => ({
    themeId: "default",
    setThemeId: setWindowThemeId,
    isSupported: () => true,
  }),
}))

vi.mock("@/hooks/useNavigationLayout", () => ({
  useNavigationLayout: () => ({
    layoutId: "sidebar",
    setLayoutId: vi.fn(),
  }),
}))

vi.mock("@/lib/tauri/commands/system-settings", () => ({
  getAutostartStatus,
  setAutostart,
}))

vi.mock("@/lib/tauri/commands/app-preferences", () => ({
  getCloseBehavior,
  setCloseBehavior,
}))

vi.mock("@/lib/tauri/commands", () => ({
  setTrayLabels,
}))

vi.mock("@/lib/tauri/errors", () => ({
  getErrorMessage: (e: unknown) => String(e),
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    "aria-label"?: string
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}))

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    loading,
  }: {
    checked: boolean
    onCheckedChange?: (v: boolean) => void
    loading?: boolean
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      disabled={loading}
    >
      {checked ? "on" : "off"}
    </button>
  ),
}))

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe("SettingsDialog", () => {
  beforeEach(() => {
    changeLanguage.mockClear()
    setCurrentWindowTitle.mockClear()
    setTrayLabels.mockClear()
    readStorageItem.mockReset()
    readStorageItem.mockReturnValue("system")
    writeStorageItem.mockClear()
    removeStorageItem.mockClear()
    getAutostartStatus.mockResolvedValue(false)
    getCloseBehavior.mockResolvedValue("minimize_to_tray")
  })

  it("renders semantic section titles instead of deriving them from labels", async () => {
    const user = userEvent.setup()
    render(<SettingsDialog open={true} onOpenChange={() => {}} />)

    await user.click(screen.getByRole("button", { name: "Appearance" }))

    expect(screen.getByText("Theme")).toBeInTheDocument()
    expect(screen.getByText("Switch Language")).toBeInTheDocument()
  })

  it("updates the window title from i18n after switching language", async () => {
    const user = userEvent.setup()
    render(<SettingsDialog open={true} onOpenChange={() => {}} />)

    await user.click(screen.getByRole("button", { name: "Appearance" }))
    await user.click(screen.getByRole("button", { name: "中文" }))

    expect(writeStorageItem).toHaveBeenCalledWith("languageMode", "zh")
    expect(writeStorageItem).toHaveBeenCalledWith("language", "zh")
    expect(changeLanguage).toHaveBeenCalledWith("zh")
    expect(setCurrentWindowTitle).toHaveBeenCalledWith("Bench - DevTools")
  })

  it("updates the automatic update preference", async () => {
    const user = userEvent.setup()
    const onAutoCheckEnabledChange = vi.fn()
    render(
      <SettingsDialog
        open={true}
        onOpenChange={() => {}}
        autoCheckEnabled={false}
        onAutoCheckEnabledChange={onAutoCheckEnabledChange}
      />,
    )

    expect(screen.getByText("Automatically check for updates")).toBeInTheDocument()
    await user.click(screen.getAllByRole("switch")[1])
    expect(onAutoCheckEnabledChange).toHaveBeenCalledWith(true)
  })

  it("does not show autostart as disabled when its read fails", async () => {
    getAutostartStatus.mockRejectedValueOnce(new Error("permission denied"))
    render(<SettingsDialog open={true} onOpenChange={() => {}} />)

    expect(await screen.findByText("Unknown")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
  })
})
