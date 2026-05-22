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
        "updater.checking": "Checking...",
        "updater.checkingDescription": "Connecting to the update service now.",
        "updater.upToDateTitle": "You're up to date",
        "updater.upToDateDescription": "The currently installed Bench build is already the latest version.",
        "updater.availableTitle": `New version ${options?.version ?? ""}`.trim(),
        "updater.availableDescription": "Ready to download and install.",
        "updater.checkFailedTitle": "Couldn't check for updates",
        "updater.checkFailedDescription": "The update service didn't return a usable result. Please try again shortly.",
        "updater.installFailedTitle": "Update installation failed",
        "updater.installFailedDescription": "The update package couldn't be downloaded or installed. Please try again.",
        "updater.desktopOnlyTitle": "Updates aren't available here",
        "updater.desktopOnlyDescription": "Updater features are only available in the desktop app.",
        "updater.releaseInfoUnavailableTitle": "Update info isn't ready yet",
        "updater.releaseInfoUnavailableDescription": "The latest release details are still syncing or temporarily unreadable. Please try again shortly.",
        "updater.serviceBusyTitle": "Update service is busy",
        "updater.serviceBusyDescription": "The update service is temporarily unavailable. Please try again shortly.",
        "updater.networkUnavailableTitle": "Can't reach the update service",
        "updater.networkUnavailableDescription": "The app couldn't connect to the update service just now. Please try again shortly.",
        "updater.rateLimitedTitle": "Checks are happening too often",
        "updater.rateLimitedDescription": "The update service is rate limiting requests for a moment. Please try again later.",
        "updater.downloadFailedTitle": "Update download didn't finish",
        "updater.downloadFailedDescription": "The update package download was interrupted. Please try again.",
        "updater.installBlockedTitle": "Update can't be installed right now",
        "updater.installBlockedDescription": "The installer may be blocked by a file in use or missing permission. Close related processes and try again.",
        "updater.updateStateChangedTitle": "That update is no longer available",
        "updater.updateStateChangedDescription": "The update changed after the last check. Please check again.",
        "updater.releaseNotes": "Release Notes",
        "updater.technicalDetails": "Technical details",
        "updater.close": "Close",
        "updater.installNow": "Download and Install",
        "updater.retry": "Retry",
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

vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <button type="button" className={className}>{children}</button>,
  CollapsibleContent: ({
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
        errorInfo={null}
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
        errorInfo={null}
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

  it("shows a human-readable retry state without echoing current version as latest on check failure", () => {
    render(
      <UpdateDialog
        open={true}
        status="error"
        currentVersion="1.7.0"
        updateInfo={null}
        errorInfo={{
          kind: "releaseInfoUnavailable",
          operation: "check",
          message: "failed to check for updates: Could not fetch a valid release JSON from the remote",
          retryAction: "check",
        }}
        error="failed to check for updates: Could not fetch a valid release JSON from the remote"
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

    expect(screen.getByText("Update info isn't ready yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The latest release details are still syncing or temporarily unreadable. Please try again shortly.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Latest Version")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Technical details/i })).toBeInTheDocument();
  });
});
