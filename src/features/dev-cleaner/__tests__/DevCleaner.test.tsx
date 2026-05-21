import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import DevCleaner from "../page";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "devCleaner.title": "Dev Cleaner",
        "devCleaner.subtitle": "Clean up development garbage files",
        "devCleaner.selectPath": "Select Directory",
        "devCleaner.enterPath": "Enter directory path or select a folder",
        "devCleaner.startScan": "Start Scan",
        "devCleaner.scanning": "Scanning...",
        "devCleaner.stopScan": "Stop Scan",
        "devCleaner.scanStopped": "Scan stopped.",
        "devCleaner.scanComplete": "Scan Complete",
        "devCleaner.projectsFound": "Found {{count}} projects",
        "devCleaner.totalSize": "Total Size",
        "devCleaner.cleanupSize": "Cleanup Size",
        "devCleaner.lastModified": "Last Modified",
        "devCleaner.projectsLabel": "Projects",
        "devCleaner.projectType": "Project Type",
        "devCleaner.selectProjects": "Select Projects to Clean",
        "devCleaner.selectAll": "Select All",
        "devCleaner.deselectAll": "Deselect All",
        "devCleaner.cleanupButton": "Start Cleanup",
        "devCleaner.clearSelection": "Clear Selection",
        "devCleaner.confirmDelete": "Confirm Cleanup",
        "devCleaner.confirmMessage": "This will delete {{count}} projects.",
        "devCleaner.cancel": "Cancel",
        "devCleaner.cleanup": "Clean Up",
        "devCleaner.cleanupSuccess": "Cleanup successful!",
        "devCleaner.cleanupError": "Cleanup failed: {{error}}",
        "devCleaner.noProjects": "No projects found in the selected directory.",
        "devCleaner.refreshing": "Refreshing...",
        "devCleaner.filteredCleanup": "Visible Cleanup",
        "devCleaner.resultsLabel": "visible",
        "devCleaner.selectedSize": "Selected",
        "devCleaner.scanTime": "Scan Time",
        "devCleaner.dependencies": "Dependencies",
        "devCleaner.column.project": "Project",
        "devCleaner.sorting.size": "By Size",
        "devCleaner.sorting.current": "Sorted By",
        "devCleaner.sorting.totalSize": "Total Size",
        "devCleaner.sorting.cleanupSize": "Cleanup Size",
        "devCleaner.sorting.modified": "By Last Modified",
        "devCleaner.sorting.name": "By Name",
        "devCleaner.filterLabel": "Filter",
        "devCleaner.filter.nodejs": "Node.js (node_modules)",
        "devCleaner.filter.python": "Python (.venv, venv)",
        "devCleaner.filter.rust": "Rust (target)",
        "devCleaner.filter.go": "Go (vendor)",
        "devCleaner.filter.all": "All Projects",
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
  Input: React.forwardRef(({ className, placeholder, value, onChange, disabled, readOnly }: {
    className?: string;
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    readOnly?: boolean;
  }, _ref: React.Ref<HTMLInputElement>) => (
    <input
      className={className}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      readOnly={readOnly}
      data-testid="path-input"
    />
  )),
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <div data-testid="alert" data-variant={variant}>{children}</div>
  ),
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-description">{children}</div>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, variant, className }: { children: React.ReactNode; variant?: string; className?: string }) => (
    <span data-testid="badge" data-variant={variant} className={className}>{children}</span>
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(" "),
  formatSize: (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  },
  formatDate: (timestamp: number) => new Date(timestamp * 1000).toLocaleDateString(),
}));

vi.mock("lucide-react", () => ({
  Loader2: ({ className }: { className?: string }) => <span data-testid="loader" className={className}>Loading</span>,
  FolderOpen: () => <span data-testid="folder">Folder</span>,
  Trash2: () => <span data-testid="trash">Trash</span>,
  AlertTriangle: () => <span data-testid="alert-triangle">Alert</span>,
  StopCircle: () => <span data-testid="stop">Stop</span>,
  ChevronDown: () => <span data-testid="chevron-down">Down</span>,
  ChevronUp: () => <span data-testid="chevron-up">Up</span>,
}));

describe("DevCleaner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dev cleaner title", () => {
    render(<DevCleaner />);
    expect(screen.getByText("Dev Cleaner")).toBeInTheDocument();
  });

  it("renders the path input field", () => {
    render(<DevCleaner />);
    const input = screen.getByTestId("path-input");
    expect(input).toBeInTheDocument();
  });

  it("renders the select directory button", () => {
    render(<DevCleaner />);
    expect(screen.getByTestId("folder")).toBeInTheDocument();
  });

  it("renders the scan button", () => {
    render(<DevCleaner />);
    expect(screen.getByText("Start Scan")).toBeInTheDocument();
  });
});
