import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import PortManager from "../page";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "portManager.title": "Kill Port Processes",
        "portManager.targetPorts": "Target Port(s)",
        "portManager.placeholder": "e.g. 3000 or 3000-4000 or 3000,8080,9000-9010",
        "portManager.scanButton": "Add to Scan",
        "portManager.scanResultsTitle": "Process Details ({{count}} ports)",
        "portManager.killButton": "Free Port",
        "portManager.killAllButton": "Free All Ports",
        "portManager.killAllDisabledHint": "No occupied ports to free",
        "portManager.port": "Port {{port}}",
        "portManager.browserError": "Cannot terminate port processes in a browser environment.",
        "portManager.emptyResults": "No scan results yet.",
        "portManager.emptyOnly": "All scanned ports are free.",
        "portManager.emptyChips": "No ports selected.",
        "portManager.occupiedCount": ", {{occupied}} occupied",
        "portManager.hideEmpty": "Hide Free Ports",
        "portManager.showEmpty": "Show All Ports",
        "portManager.chipScrollTo": "Scroll to port {{port}} details",
        "portManager.clearSelectedPorts": "Clear Selected Ports",
        "portManager.invalidInput": "Only digits, commas, and hyphens allowed",
        "portManager.invalidRangeFormat": "Invalid range format",
        "portManager.invalidPortNumber": "Port must be a positive integer",
        "portManager.invalidPortFormat": "Invalid port format",
        "portManager.rangeStartGtEnd": "Start port cannot be greater than end port",
        "portManager.portOutOfRange": "Port range is 1-65535",
        "portManager.tooManyPorts": "Maximum 100 ports allowed",
        "portManager.portsAlreadyAdded": "These ports are already in the scan list",
        "portManager.rescan": "Rescan",
        "portManager.removePort": "Remove port {{port}}",
        "portManager.dismissError": "Dismiss",
        "portManager.rescanAll": "Rescan All",
        "portManager.killAllCommandHint": "Free all scanned ports",
        "portManager.freePortHint": "Free port {{port}} — {{command}}",
        "portManager.statusWaiting": "Waiting",
        "portManager.statusScanning": "Scanning",
        "portManager.statusSuccess": "Occupied",
        "portManager.statusEmpty": "Free",
        "portManager.statusError": "Error",
        "portManager.statusEnded": "Ended",
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
  Button: ({ children, onClick, disabled, variant, size, className }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} className={className} data-variant={variant} data-size={size}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: React.forwardRef(({ className, placeholder, value, onChange, onKeyDown, disabled, id, autoComplete }: {
    className?: string;
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    id?: string;
    autoComplete?: string;
  }, ref: React.Ref<HTMLInputElement>) => (
    <input
      ref={ref}
      id={id}
      className={className}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      disabled={disabled}
      autoComplete={autoComplete}
      data-testid="port-input"
    />
  )),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, variant, className }: { children: React.ReactNode; variant?: string; className?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
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

vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children, open }: {
    children: React.ReactNode;
    open?: boolean;
  }) => <div data-testid="collapsible" data-open={open}>{children}</div>,
  CollapsibleTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="collapsible-trigger" className={className}>{children}</div>
  ),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="collapsible-content">{children}</div>
  ),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="tooltip" data-open={open}>{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
  Loader2: ({ className }: { className?: string }) => <span data-testid="loader" className={className}>Loading</span>,
  RefreshCw: () => <span data-testid="refresh">Refresh</span>,
  Search: () => <span data-testid="search">Search</span>,
  X: () => <span data-testid="x-icon">X</span>,
  Zap: () => <span data-testid="zap">Zap</span>,
}));

describe("PortManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the port manager title", () => {
    render(<PortManager />);
    expect(screen.getByText("Kill Port Processes")).toBeInTheDocument();
  });

  it("renders the input field with placeholder", () => {
    render(<PortManager />);
    const input = screen.getByTestId("port-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "e.g. 3000 or 3000-4000 or 3000,8080,9000-9010");
  });

  it("renders common port buttons", () => {
    render(<PortManager />);
    expect(screen.getByText("3000")).toBeInTheDocument();
    expect(screen.getByText("5173")).toBeInTheDocument();
    expect(screen.getByText("8080")).toBeInTheDocument();
  });

  it("renders action buttons", () => {
    render(<PortManager />);
    expect(screen.getByText("Clear Selected Ports")).toBeInTheDocument();
    expect(screen.getByText("Add to Scan")).toBeInTheDocument();
  });

  it("updates input value on typing valid port numbers", async () => {
    render(<PortManager />);
    const input = screen.getByTestId("port-input");
    await userEvent.type(input, "3000");
    expect(input).toHaveValue("3000");
  });

  it("shows invalid input toast for non-numeric characters", async () => {
    render(<PortManager />);
    const input = screen.getByTestId("port-input");
    await userEvent.type(input, "abc");
    const tooltip = screen.getByTestId("tooltip");
    expect(tooltip).toHaveAttribute("data-open", "true");
  });
});
