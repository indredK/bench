import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsDialog } from "@/components/common/SettingsDialog";

const {
  changeLanguage,
  removeStorageItem,
  readStorageItem,
  setCurrentWindowTitle,
  setTheme,
  setWindowThemeId,
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
  translations: {
    "sidebar.settings": "Settings",
    "language.switch": "Switch Language",
    "language.system": "System",
    "language.en": "English",
    "language.zh": "中文",
    "theme.sectionTitle": "Theme",
    "theme.system": "System Theme",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.currentMode": "Current",
    "windowTheme.label": "Window Theme",
    "windowTheme.default": "Default",
    "windowTheme.glass": "Glass",
    "windowTheme.unsupportedTooltip": "Unsupported",
    "common.appTitle": "端口管理器 - DevTools",
  } as Record<string, string>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "system",
    setTheme,
  }),
}));

vi.mock("@/i18n/config", () => ({
  __esModule: true,
  default: {
    changeLanguage,
    t: (key: string) => translations[key] ?? key,
  },
  detectSystemLanguage: () => "zh",
}));

vi.mock("@/platform/window", () => ({
  setCurrentWindowTitle,
}));

vi.mock("@/platform/storage", () => ({
  readStorageItem,
  writeStorageItem,
  removeStorageItem,
}));

vi.mock("@/hooks/useWindowTheme", () => ({
  useWindowTheme: () => ({
    themeId: "default",
    setThemeId: setWindowThemeId,
    isSupported: () => true,
  }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

describe("SettingsDialog", () => {
  beforeEach(() => {
    changeLanguage.mockClear();
    setCurrentWindowTitle.mockClear();
    readStorageItem.mockReset();
    readStorageItem.mockReturnValue("system");
    writeStorageItem.mockClear();
    removeStorageItem.mockClear();
  });

  it("renders semantic section titles instead of deriving them from labels", () => {
    render(<SettingsDialog open={true} onOpenChange={() => {}} />);

    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Switch Language")).toBeInTheDocument();
  });

  it("updates the window title from i18n after switching language", async () => {
    const user = userEvent.setup();
    render(<SettingsDialog open={true} onOpenChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "中文" }));

    expect(writeStorageItem).toHaveBeenCalledWith("languageMode", "zh");
    expect(writeStorageItem).toHaveBeenCalledWith("language", "zh");
    expect(changeLanguage).toHaveBeenCalledWith("zh");
    expect(setCurrentWindowTitle).toHaveBeenCalledWith("端口管理器 - DevTools");
  });
});
