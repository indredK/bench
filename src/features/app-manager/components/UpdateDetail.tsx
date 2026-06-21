/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import type { TFunction } from "i18next";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailSection, MetadataRow } from "@/components/layout/DetailPanel";
import type { AppInfo, UpdateInfo } from "@/lib/tauri/types/app-manager";
import { AppIcon } from "@/features/app-manager/components/AppIcon";
import type { OperationStatus } from "@/features/app-manager/model/operations";
import {
  formatBytes,
  getUpdateActionKey,
  getUpdateSourceLabel,
} from "@/features/app-manager/model/update-source-info";

interface UpdateDetailProps {
  t: TFunction;
  update: UpdateInfo;
  app: AppInfo | undefined;
  operationStatus: OperationStatus | undefined;
  onAction: () => void;
  onOpenReleaseNotes: (url: string) => void;
}

export function UpdateDetail({
  t,
  update,
  app,
  operationStatus,
  onAction,
  onOpenReleaseNotes,
}: UpdateDetailProps) {
  const sizeLabel = formatBytes(update.size);
  const sourceLabel = getUpdateSourceLabel(t, update.source);
  const actionLabel = t(getUpdateActionKey(update.source));
  const running = operationStatus === "running";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <AppIcon
          iconBase64={null}
          installPath={app?.installPath}
          size={48}
          className="shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold truncate">{update.appName}</h3>
          {app?.bundleId && (
            <p className="text-xs text-muted-foreground truncate">{app.bundleId}</p>
          )}
        </div>
        <Badge variant="secondary">{sourceLabel}</Badge>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-center gap-3 tabular-nums">
        <span className="text-lg font-mono">{update.currentVersion || "—"}</span>
        <ArrowRight size={20} className="text-green-500" />
        <span className="text-lg font-mono font-bold text-green-600 dark:text-green-400">
          {update.latestVersion}
        </span>
      </div>

      <Button
        variant="default"
        size="default"
        className="w-full"
        onClick={onAction}
        disabled={running}
      >
        {running ? t("appManager.softwareUpdate.action.queued") : actionLabel}
      </Button>

      <DetailSection label={t("appManager.softwareUpdate.detail.versionCompare")}>
        <div className="flex flex-col">
          <MetadataRow label={t("appManager.softwareUpdate.detail.sourceLabel")} value={sourceLabel} />
          <MetadataRow label={t("appManager.softwareUpdate.detail.sizeLabel")} value={sizeLabel} />
          {app?.bundleId && (
            <MetadataRow label={t("appManager.detailBundleId")} value={app.bundleId} />
          )}
        </div>
      </DetailSection>

      <DetailSection label={t("appManager.softwareUpdate.detail.releaseNotes")}>
        {update.releaseNotesInline ? (
          <p className="text-sm whitespace-pre-wrap break-words text-foreground/90">
            {update.releaseNotesInline}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("appManager.softwareUpdate.detail.noNotes")}
          </p>
        )}
        {update.releaseNotesUrl && (
          <Button
            variant="link"
            size="sm"
            className="px-0 mt-2"
            onClick={() => onOpenReleaseNotes(update.releaseNotesUrl!)}
          >
            <ExternalLink size={12} />
            {t("appManager.softwareUpdate.detail.viewFullNotes")}
          </Button>
        )}
      </DetailSection>
    </div>
  );
}
