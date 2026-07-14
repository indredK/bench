/**
 * Common UI / 通用 UI: render app update dialog only; 只放应用更新相关界面.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  RefreshCcw,
  Download,
  ExternalLink,
  RotateCw,
  CheckCircle2,
  TriangleAlert,
  ChevronDown,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import type { UpdaterController } from "@/features/updater/hooks/useUpdaterController"
import type { UpdaterErrorInfo } from "@/features/updater/error-classifier"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

const MAX_RELEASE_NOTES_LENGTH = 20_000

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

type ReleaseNotesBlock =
  | {
      type: "heading"
      level: number
      content: string
    }
  | {
      type: "list"
      items: string[]
    }
  | {
      type: "paragraph"
      content: string
    }

function renderInlineMarkdown(text: string): ReactNode[] {
  const segments: ReactNode[] = []
  const linkPattern = /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g
  let lastIndex = 0

  for (const match of text.matchAll(linkPattern)) {
    const [fullMatch, label, href] = match
    const start = match.index ?? 0

    if (start > lastIndex) {
      segments.push(text.slice(lastIndex, start))
    }

    segments.push(
      <a
        key={`${href}-${start}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="hover:text-foreground break-all underline underline-offset-3 transition-colors"
      >
        {label}
      </a>,
    )

    lastIndex = start + fullMatch.length
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex))
  }

  return segments
}

function parseReleaseNotes(body: string): ReleaseNotesBlock[] {
  const blocks: ReleaseNotesBlock[] = []
  const paragraphLines: string[] = []
  let listItems: string[] = []

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return
    blocks.push({
      type: "paragraph",
      content: paragraphLines.join(" "),
    })
    paragraphLines.length = 0
  }

  const flushList = () => {
    if (listItems.length === 0) return
    blocks.push({
      type: "list",
      items: listItems,
    })
    listItems = []
  }

  for (const rawLine of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph()
      flushList()
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2].trim(),
      })
      continue
    }

    const listMatch = line.match(/^[-*]\s+(.*)$/)
    if (listMatch) {
      flushParagraph()
      listItems.push(listMatch[1].trim())
      continue
    }

    if (listItems.length > 0) {
      listItems[listItems.length - 1] = `${listItems[listItems.length - 1]} ${line}`
      continue
    }

    paragraphLines.push(line)
  }

  flushParagraph()
  flushList()

  return blocks
}

function renderReleaseNotes(body: string) {
  const blocks = parseReleaseNotes(body)

  if (blocks.length === 0) {
    return <p className="text-muted-foreground leading-6 [overflow-wrap:anywhere]">{body}</p>
  }

  return blocks.map((block, index) => {
    if (block.type === "heading") {
      const headingClassName =
        block.level <= 2
          ? "text-base font-semibold text-foreground"
          : block.level === 3
            ? "text-sm font-semibold text-foreground"
            : "text-sm font-medium text-foreground"

      return (
        <h5 key={`heading-${index}`} className={headingClassName}>
          {renderInlineMarkdown(block.content)}
        </h5>
      )
    }

    if (block.type === "list") {
      return (
        <ul
          key={`list-${index}`}
          className="text-muted-foreground marker:text-muted-foreground list-disc space-y-2 pl-5"
        >
          {block.items.map((item, itemIndex) => (
            <li
              key={`list-item-${index}-${itemIndex}`}
              className="leading-6 [overflow-wrap:anywhere]"
            >
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      )
    }

    return (
      <p
        key={`paragraph-${index}`}
        className="text-muted-foreground leading-6 [overflow-wrap:anywhere]"
      >
        {renderInlineMarkdown(block.content)}
      </p>
    )
  })
}

function getErrorCopy(t: (key: string) => string, errorInfo: UpdaterErrorInfo | null) {
  switch (errorInfo?.kind) {
    case "desktopOnly":
      return {
        title: t("updater.desktopOnlyTitle"),
        description: t("updater.desktopOnlyDescription"),
      }
    case "releaseInfoUnavailable":
      return {
        title: t("updater.releaseInfoUnavailableTitle"),
        description: t("updater.releaseInfoUnavailableDescription"),
      }
    case "serviceBusy":
      return {
        title: t("updater.serviceBusyTitle"),
        description: t("updater.serviceBusyDescription"),
      }
    case "networkUnavailable":
      return {
        title: t("updater.networkUnavailableTitle"),
        description: t("updater.networkUnavailableDescription"),
      }
    case "rateLimited":
      return {
        title: t("updater.rateLimitedTitle"),
        description: t("updater.rateLimitedDescription"),
      }
    case "downloadFailed":
      return {
        title: t("updater.downloadFailedTitle"),
        description: t("updater.downloadFailedDescription"),
      }
    case "signatureVerificationFailed":
      return {
        title: t("updater.signatureVerificationFailedTitle"),
        description: t("updater.signatureVerificationFailedDescription"),
      }
    case "installBlocked":
      return {
        title: t("updater.installBlockedTitle"),
        description: t("updater.installBlockedDescription"),
      }
    case "updateStateChanged":
      return {
        title: t("updater.updateStateChangedTitle"),
        description: t("updater.updateStateChangedDescription"),
      }
    case "unknownInstallFailure":
      return {
        title: t("updater.installFailedTitle"),
        description: t("updater.installFailedDescription"),
      }
    case "unknownCheckFailure":
    default:
      return {
        title: t("updater.checkFailedTitle"),
        description: t("updater.checkFailedDescription"),
      }
  }
}

type UpdateDialogProps = Pick<
  UpdaterController,
  | "open"
  | "status"
  | "currentVersion"
  | "updateInfo"
  | "error"
  | "errorInfo"
  | "downloadedBytes"
  | "totalBytes"
  | "lastCheckedAt"
  | "checkUpdates"
  | "downloadAndInstall"
  | "cancelDownload"
  | "openReleasesPage"
  | "restartNow"
  | "closeDialog"
  | "dismissDialog"
>

export function UpdateDialog({
  open,
  status,
  currentVersion,
  updateInfo,
  error,
  errorInfo,
  downloadedBytes,
  totalBytes,
  lastCheckedAt,
  checkUpdates,
  downloadAndInstall,
  cancelDownload,
  openReleasesPage,
  restartNow,
  closeDialog,
  dismissDialog,
}: UpdateDialogProps) {
  const { t } = useTranslation()
  const [showErrorDetails, setShowErrorDetails] = useState(false)

  const latestVersion = updateInfo?.version ?? null
  const publishedAt = updateInfo?.date ?? null
  const releaseNotes = updateInfo?.body?.trim().slice(0, MAX_RELEASE_NOTES_LENGTH) || ""
  const progressPercent =
    totalBytes && totalBytes > 0
      ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
      : null
  const checking = status === "checking"
  const busy = status === "downloading" || status === "cancelling" || status === "installing"
  const canInstall = status === "available"
  const canRestart = status === "readyToRestart"
  const retryAction = errorInfo?.retryAction ?? null
  const hasKnownLatestVersion = Boolean(latestVersion)
  const errorCopy = getErrorCopy(t, errorInfo)
  const statusAlert = useMemo(() => {
    switch (status) {
      case "checking":
        return {
          icon: <RefreshCcw className="size-4 animate-spin" />,
          title: t("updater.checking"),
          description: t("updater.checkingDescription"),
          variant: "default" as const,
        }
      case "upToDate":
        return {
          icon: <CheckCircle2 className="size-4" />,
          title: t("updater.upToDateTitle"),
          description: t("updater.upToDateDescription"),
          variant: "default" as const,
        }
      case "available":
        return {
          icon: <Download className="size-4" />,
          title: t("updater.availableTitle", { version: latestVersion || "-" }),
          description: t("updater.availableDescription"),
          variant: "default" as const,
        }
      case "downloading":
        return {
          icon: <RotateCw className="size-4 animate-spin" />,
          title: t("updater.downloading"),
          description: t("updater.downloadDescription"),
          variant: "default" as const,
        }
      case "cancelling":
        return {
          icon: <RotateCw className="size-4 animate-spin" />,
          title: t("updater.cancelling"),
          description: t("updater.cancellingDescription"),
          variant: "default" as const,
        }
      case "installing":
        return {
          icon: <RotateCw className="size-4 animate-spin" />,
          title: t("updater.installing"),
          description: t("updater.installDescription"),
          variant: "default" as const,
        }
      case "readyToRestart":
        return {
          icon: <CheckCircle2 className="size-4" />,
          title: t("updater.readyToRestartTitle"),
          description: t("updater.readyToRestartDescription"),
          variant: "default" as const,
        }
      case "error":
        return {
          icon: <TriangleAlert className="size-4" />,
          title: errorCopy.title,
          description: errorCopy.description,
          variant: "destructive" as const,
        }
      default:
        return null
    }
  }, [errorCopy.description, errorCopy.title, latestVersion, status, t])
  const dialogDescription = useMemo(() => {
    const parts = [`${t("updater.currentVersion")} ${currentVersion || "-"}.`]

    if (latestVersion) {
      parts.push(`${t("updater.latestVersion")} ${latestVersion}.`)
    }

    if (publishedAt) {
      parts.push(`${t("updater.publishedAt")} ${formatDate(publishedAt)}.`)
    }

    if (lastCheckedAt > 0) {
      parts.push(`${t("updater.lastChecked")} ${new Date(lastCheckedAt).toLocaleString()}.`)
    }

    return parts.join(" ")
  }, [currentVersion, latestVersion, publishedAt, lastCheckedAt, t])

  useEffect(() => {
    setShowErrorDetails(false)
  }, [status, open])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeDialog()
        }
      }}
    >
      <DialogContent className="max-h-[min(85vh,720px)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-[640px]">
        <DialogHeader className="pr-8">
          <DialogTitle>{t("updater.title")}</DialogTitle>
          <DialogDescription className="sr-only">{dialogDescription}</DialogDescription>
        </DialogHeader>

        <ScrollableArea
          className="min-w-0 flex-1 pr-1"
          wrapperClassName="flex min-w-0 min-h-0 flex-1"
        >
          <div className="min-w-0 space-y-4">
            {statusAlert && (
              <Alert variant={statusAlert.variant} className="px-3 py-3">
                {statusAlert.icon}
                <AlertTitle>{statusAlert.title}</AlertTitle>
                <AlertDescription>{statusAlert.description}</AlertDescription>
              </Alert>
            )}

            <div className="grid min-w-0 gap-2 rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground">{t("updater.currentVersion")}</span>
                <span className="min-w-0 text-right font-mono [overflow-wrap:anywhere]">
                  {currentVersion || "-"}
                </span>
              </div>
              {hasKnownLatestVersion && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{t("updater.latestVersion")}</span>
                  <span className="min-w-0 text-right font-mono [overflow-wrap:anywhere]">
                    {latestVersion}
                  </span>
                </div>
              )}
              {hasKnownLatestVersion && publishedAt && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{t("updater.publishedAt")}</span>
                  <span className="min-w-0 text-right [overflow-wrap:anywhere]">
                    {formatDate(publishedAt)}
                  </span>
                </div>
              )}
              {lastCheckedAt > 0 && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{t("updater.lastChecked")}</span>
                  <span className="min-w-0 text-right [overflow-wrap:anywhere]">
                    {new Date(lastCheckedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {status === "error" && error && (
              <Collapsible open={showErrorDetails} onOpenChange={setShowErrorDetails}>
                <div className="bg-muted/20 rounded-lg border">
                  <CollapsibleTrigger className="hover:bg-muted/40 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium transition-colors">
                    <span>{t("updater.technicalDetails")}</span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 transition-transform",
                        showErrorDetails && "rotate-180",
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="text-muted-foreground border-t px-3 py-3 text-sm [overflow-wrap:anywhere]">
                    {error}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            {(busy || canRestart) && (
              <div className="space-y-2">
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  {progressPercent === null && !canRestart ? (
                    <div
                      className="bg-primary h-full w-1/3 rounded-full motion-safe:animate-pulse"
                      data-progress="indeterminate"
                    />
                  ) : (
                    <div
                      className="bg-primary h-full rounded-full transition-[width]"
                      style={{ width: `${progressPercent ?? 100}%` }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progressPercent ?? 100}
                      data-progress="determinate"
                    />
                  )}
                </div>
                <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {status === "downloading" || status === "cancelling"
                      ? t("updater.progressLabel", {
                          downloaded: formatBytes(downloadedBytes),
                          total: totalBytes ? formatBytes(totalBytes) : t("updater.unknownSize"),
                        })
                      : t("updater.progressDone")}
                  </span>
                  {(progressPercent !== null || canRestart) && (
                    <span className="shrink-0">{progressPercent ?? 100}%</span>
                  )}
                </div>
              </div>
            )}

            {releaseNotes && (
              <div className="min-w-0 space-y-2">
                <h4 className="text-sm font-medium">{t("updater.releaseNotes")}</h4>
                <div className="bg-muted/30 min-w-0 rounded-lg border p-3 text-sm">
                  <div className="[&_a]:text-foreground min-w-0 space-y-4">
                    {renderReleaseNotes(releaseNotes)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollableArea>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={dismissDialog} disabled={busy}>
            {canRestart ? t("updater.later") : t("updater.close")}
          </Button>

          {status === "downloading" && (
            <Button variant="outline" onClick={() => void cancelDownload()}>
              {t("updater.cancelDownload")}
            </Button>
          )}

          {status === "cancelling" && (
            <Button variant="outline" disabled>
              <RotateCw className="size-4 animate-spin" />
              {t("updater.cancelling")}
            </Button>
          )}

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

          {status === "error" && retryAction && (
            <Button
              onClick={() =>
                void (retryAction === "install" ? downloadAndInstall() : checkUpdates())
              }
            >
              <RefreshCcw className="size-4" />
              {t("updater.retry")}
            </Button>
          )}

          {status === "error" && errorInfo?.kind === "releaseInfoUnavailable" && (
            <Button variant="outline" onClick={openReleasesPage}>
              <ExternalLink className="size-4" />
              {t("updater.openReleases")}
            </Button>
          )}

          {(status === "idle" || status === "upToDate") && (
            <Button onClick={() => void checkUpdates()} disabled={checking || busy}>
              <RefreshCcw className={cn("size-4", checking && "animate-spin")} />
              {checking ? t("updater.checking") : t("updater.checkNow")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
