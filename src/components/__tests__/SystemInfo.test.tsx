import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import SystemInfo from "../SystemInfo";

const mockInvoke = vi.fn();
const mockIsTauri = vi.fn(() => true);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  isTauri: () => mockIsTauri(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "systemInfo.title": "System Information",
        "systemInfo.loading": "Loading system information...",
        "systemInfo.retry": "Retry",
        "systemInfo.refresh": "Refresh",
        "systemInfo.osName": "OS Name",
        "systemInfo.osVersion": "OS Version",
        "systemInfo.kernelVersion": "Kernel Version",
        "systemInfo.hostname": "Hostname",
        "systemInfo.cpuBrand": "CPU",
        "systemInfo.cpuCores": "CPU Cores",
        "systemInfo.totalMemory": "Total Memory",
        "systemInfo.availableMemory": "Available Memory",
        "systemInfo.usedMemory": "Used Memory",
        "systemInfo.memoryUsage": "Memory Usage",
        "systemInfo.browserName": "Browser",
        "systemInfo.browserVersion": "Browser Version",
        "systemInfo.platform": "Platform",
        "systemInfo.language": "Language",
        "systemInfo.screenResolution": "Screen Resolution",
      };
      return translations[key] || key;
    },
    i18n: {
      changeLanguage: vi.fn(),
      language: "en",
    },
  }),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-header" className={className}>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-title">{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>{children}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, variant, size }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} data-variant={variant} data-size={size}>{children}</button>
  ),
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <div data-testid="alert" data-variant={variant}>{children}</div>
  ),
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-description">{children}</div>
  ),
}));

vi.mock("@/lib/utils", () => ({
  formatMemory: (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2),
}));

describe("SystemInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauri.mockReturnValue(true);
  });

  it("renders the system info title", () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<SystemInfo active={true} />);
    expect(screen.getByText("System Information")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<SystemInfo active={true} />);
    expect(screen.getByText("Loading system information...")).toBeInTheDocument();
  });

  it("displays system info after successful load", async () => {
    mockInvoke.mockResolvedValue({
      os_name: "macOS",
      os_version: "14.0",
      kernel_version: "Darwin 23.0",
      hostname: "my-mac",
      cpu_brand: "Apple M1",
      cpu_cores: 8,
      total_memory: 17179869184,
      available_memory: 8589934592,
      used_memory: 8589934592,
      memory_usage_percent: 50.0,
    });

    render(<SystemInfo active={true} />);

    await waitFor(() => {
      expect(screen.getByText("macOS")).toBeInTheDocument();
    });

    expect(screen.getByText("Apple M1")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("my-mac")).toBeInTheDocument();
  });

  it("shows error state when invoke fails", async () => {
    mockInvoke.mockRejectedValue("Failed to load");

    render(<SystemInfo active={true} />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows browser info when not in Tauri environment", async () => {
    mockIsTauri.mockReturnValue(false);

    render(<SystemInfo active={true} />);

    await waitFor(() => {
      expect(screen.getByText("Browser")).toBeInTheDocument();
    });
  });

  it("does not fetch when not active", () => {
    mockInvoke.mockResolvedValue({});
    render(<SystemInfo active={false} />);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});