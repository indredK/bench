import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UpdateDialog } from "../UpdateDialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const translations: Record<string, string> = {
        "updater.title": "Software Update",
        "updater.currentVersion": "Current Version",
        "updater.latestVersion": "Latest Version",
        "updater.lastChecked": "Last Checked",
        "updater.availableTitle": `New version ${options?.version ?? ""}`.trim(),
        "updater.availableDescription": "Ready to download and install.",
        "updater.releaseNotes": "Release Notes",
        "updater.close": "Close",
        "updater.installNow": "Download and Install",
      };

      return translations[key] || key;
    },
  }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div data-testid="dialog-content" className={className}>{children}</div>,
  DialogHeader: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
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

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDescription: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

describe("UpdateDialog", () => {
  it("renders release notes as structured markdown content", () => {
    render(
      <UpdateDialog
        open={true}
        status="available"
        currentVersion="1.6.0"
        updateInfo={{
          available: true,
          currentVersion: "1.6.0",
          version: "1.7.0",
          date: "2026-05-22",
          body: [
            "## [1.7.0](https://github.com/example/release)",
            "",
            "### Features",
            "",
            "* Added [support article](https://example.com/some/really/long/path/that/should/wrap)",
          ].join("\n"),
        }}
        error=""
        downloadedBytes={0}
        totalBytes={null}
        lastCheckedAt={0}
        checkUpdates={vi.fn(async () => {})}
        downloadAndInstall={vi.fn(async () => {})}
        restartNow={vi.fn(async () => {})}
        closeDialog={vi.fn()}
        dismissDialog={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "1.7.0" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Features" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "support article" })).toHaveAttribute(
      "href",
      "https://example.com/some/really/long/path/that/should/wrap",
    );
    expect(screen.queryByText(/## \[1\.7\.0\]/)).not.toBeInTheDocument();
  });

  it("applies constrained dialog layout classes for long content", () => {
    render(
      <UpdateDialog
        open={true}
        status="available"
        currentVersion="1.6.0"
        updateInfo={{
          available: true,
          currentVersion: "1.6.0",
          version: "1.7.0",
          date: "2026-05-22",
          body: "plain text",
        }}
        error=""
        downloadedBytes={0}
        totalBytes={null}
        lastCheckedAt={0}
        checkUpdates={vi.fn(async () => {})}
        downloadAndInstall={vi.fn(async () => {})}
        restartNow={vi.fn(async () => {})}
        closeDialog={vi.fn()}
        dismissDialog={vi.fn()}
      />,
    );

    expect(screen.getByTestId("dialog-content")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("dialog-content")).toHaveClass("grid-rows-[auto_minmax(0,1fr)_auto]");
  });
});
