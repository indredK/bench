/**
 * Common UI / 通用 UI: render app update dialog only; 只放应用更新相关界面.
 */
import type { ReactNode } from "react";
import { RefreshCcw, Download, RotateCw, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UpdaterController } from "@/features/updater/hooks/useUpdaterController";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

type ReleaseNotesBlock =
  | {
      type: "heading";
      level: number;
      content: string;
    }
  | {
      type: "list";
      items: string[];
    }
  | {
      type: "paragraph";
      content: string;
    };

function renderInlineMarkdown(text: string): ReactNode[] {
  const segments: ReactNode[] = [];
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(linkPattern)) {
    const [fullMatch, label, href] = match;
    const start = match.index ?? 0;

    if (start > lastIndex) {
      segments.push(text.slice(lastIndex, start));
    }

    segments.push(
      <a
        key={`${href}-${start}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="break-all underline underline-offset-3 transition-colors hover:text-foreground"
      >
        {label}
      </a>,
    );

    lastIndex = start + fullMatch.length;
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }

  return segments;
}

function parseReleaseNotes(body: string): ReleaseNotesBlock[] {
  const blocks: ReleaseNotesBlock[] = [];
  const paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push({
      type: "paragraph",
      content: paragraphLines.join(" "),
    });
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({
      type: "list",
      items: listItems,
    });
    listItems = [];
  };

  for (const rawLine of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2].trim(),
      });
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1].trim());
      continue;
    }

    if (listItems.length > 0) {
      listItems[listItems.length - 1] = `${listItems[listItems.length - 1]} ${line}`;
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderReleaseNotes(body: string) {
  const blocks = parseReleaseNotes(body);

  if (blocks.length === 0) {
    return (
      <p className="leading-6 text-muted-foreground [overflow-wrap:anywhere]">
        {body}
      </p>
    );
  }

  return blocks.map((block, index) => {
    if (block.type === "heading") {
      const headingClassName =
        block.level <= 2
          ? "text-base font-semibold text-foreground"
          : block.level === 3
            ? "text-sm font-semibold text-foreground"
            : "text-sm font-medium text-foreground";

      return (
        <h5 key={`heading-${index}`} className={headingClassName}>
          {renderInlineMarkdown(block.content)}
        </h5>
      );
    }

    if (block.type === "list") {
      return (
        <ul
          key={`list-${index}`}
          className="space-y-2 pl-5 text-muted-foreground marker:text-muted-foreground list-disc"
        >
          {block.items.map((item, itemIndex) => (
            <li key={`list-item-${index}-${itemIndex}`} className="leading-6 [overflow-wrap:anywhere]">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p
        key={`paragraph-${index}`}
        className="leading-6 text-muted-foreground [overflow-wrap:anywhere]"
      >
        {renderInlineMarkdown(block.content)}
      </p>
    );
  });
}

export function UpdateDialog({
  open,
  status,
  currentVersion,
  updateInfo,
  error,
  downloadedBytes,
  totalBytes,
  lastCheckedAt,
  checkUpdates,
  downloadAndInstall,
  restartNow,
  closeDialog,
  dismissDialog,
}: UpdaterController) {
  const { t } = useTranslation();

  const latestVersion = updateInfo?.version || currentVersion || "-";
  const releaseNotes = updateInfo?.body?.trim() || "";
  const progressPercent =
    totalBytes && totalBytes > 0
      ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
      : null;
  const checking = status === "checking";
  const busy = status === "downloading" || status === "installing";
  const canInstall = status === "available";
  const canRestart = status === "readyToRestart";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeDialog();
        }
      }}
    >
      <DialogContent className="max-h-[min(85vh,720px)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-[640px]">
        <DialogHeader className="pr-8">
          <DialogTitle>{t("updater.title")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("updater.currentVersion")} {currentVersion || "-"};{" "}
            {t("updater.latestVersion")} {latestVersion}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 overflow-y-auto pr-1">
          <div className="min-w-0 space-y-4">
            <div className="grid min-w-0 gap-2 rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">{t("updater.currentVersion")}</span>
                <span className="min-w-0 text-right font-mono [overflow-wrap:anywhere]">
                  {currentVersion || "-"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">{t("updater.latestVersion")}</span>
                <span className="min-w-0 text-right font-mono [overflow-wrap:anywhere]">
                  {latestVersion}
                </span>
              </div>
              {lastCheckedAt > 0 && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{t("updater.lastChecked")}</span>
                  <span className="min-w-0 text-right [overflow-wrap:anywhere]">
                    {new Date(lastCheckedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {status === "upToDate" && (
              <Alert>
                <CheckCircle2 className="size-4" />
                <AlertTitle>{t("updater.upToDateTitle")}</AlertTitle>
                <AlertDescription>{t("updater.upToDateDescription")}</AlertDescription>
              </Alert>
            )}

            {status === "available" && (
              <Alert>
                <Download className="size-4" />
                <AlertTitle>{t("updater.availableTitle", { version: latestVersion })}</AlertTitle>
                <AlertDescription>{t("updater.availableDescription")}</AlertDescription>
              </Alert>
            )}

            {busy && (
              <Alert>
                <RotateCw className="size-4 animate-spin" />
                <AlertTitle>
                  {status === "downloading" ? t("updater.downloading") : t("updater.installing")}
                </AlertTitle>
                <AlertDescription>
                  {status === "downloading"
                    ? t("updater.downloadDescription")
                    : t("updater.installDescription")}
                </AlertDescription>
              </Alert>
            )}

            {canRestart && (
              <Alert>
                <CheckCircle2 className="size-4" />
                <AlertTitle>{t("updater.readyToRestartTitle")}</AlertTitle>
                <AlertDescription>{t("updater.readyToRestartDescription")}</AlertDescription>
              </Alert>
            )}

            {status === "error" && (
              <Alert variant="destructive">
                <AlertTitle>{t("updater.errorTitle")}</AlertTitle>
                <AlertDescription className="[overflow-wrap:anywhere]">{error}</AlertDescription>
              </Alert>
            )}

            {(busy || canRestart) && (
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${progressPercent ?? (canRestart ? 100 : 8)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {status === "downloading"
                      ? t("updater.progressLabel", {
                          downloaded: formatBytes(downloadedBytes),
                          total: totalBytes ? formatBytes(totalBytes) : t("updater.unknownSize"),
                        })
                      : t("updater.progressDone")}
                  </span>
                  <span className="shrink-0">{progressPercent ?? (canRestart ? 100 : 0)}%</span>
                </div>
              </div>
            )}

            {releaseNotes && (
              <div className="min-w-0 space-y-2">
                <h4 className="text-sm font-medium">{t("updater.releaseNotes")}</h4>
                <div className="min-w-0 rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="min-w-0 space-y-4 [&_a]:text-foreground">
                    {renderReleaseNotes(releaseNotes)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={dismissDialog} disabled={busy}>
            {canRestart ? t("updater.later") : t("updater.close")}
          </Button>

          {canInstall && (
            <Button onClick={() => void downloadAndInstall()}>
              <Download className="size-4" />
              {t("updater.installNow")}
            </Button>
          )}

          {canRestart && (
            <Button onClick={() => void restartNow()}>
              <RotateCw className="size-4" />
              {t("updater.restartNow")}
            </Button>
          )}

          {!canInstall && !canRestart && (
            <Button onClick={() => void checkUpdates()} disabled={checking || busy}>
              <RefreshCcw className={`size-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? t("updater.checking") : t("updater.checkNow")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
