/**
 * 外部应用管理对话框 / External Apps Panel:
 *   列出已授权的外部 App + 绑定关系,支持取消授权 (revoke)。
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog";
import { useExternalApps } from "@/features/account-manager/hooks/useExternalApps";
import type {
  ExternalApp,
  ExternalAppBinding,
  StationAccount,
} from "@/features/account-manager/api";

interface AppsByApp {
  app: ExternalApp;
  bindings: ExternalAppBinding[];
}

function groupByApp(
  apps: ExternalApp[],
  bindings: ExternalAppBinding[],
): AppsByApp[] {
  return apps.map((app) => ({
    app,
    bindings: bindings.filter((b) => b.appId === app.id),
  }));
}

function findAccountLabel(
  accountId: string,
  accounts: StationAccount[],
): string {
  const account = accounts.find((a) => a.id === accountId);
  return account ? account.username : accountId;
}

export interface ExternalAppsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId?: string | null;
  accounts: StationAccount[];
}

export function ExternalAppsPanel({
  open,
  onOpenChange,
  accountId,
  accounts,
}: ExternalAppsPanelProps) {
  const { t } = useTranslation();
  const { apps, bindings, loading, revokingAppId, revokeApp } = useExternalApps(accountId, open);
  const [appToRevoke, setAppToRevoke] = useState<ExternalApp | null>(null);

  const grouped = groupByApp(apps, bindings);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!loading) onOpenChange(next);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ExternalLink size={16} />
              {t("accountManager.externalApps.title")}
            </DialogTitle>
            <DialogDescription>
              {t("accountManager.externalApps.subtitle")}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t("accountManager.externalApps.loading")}
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t("accountManager.externalApps.empty")}
            </div>
          ) : (
            <ul className="space-y-2">
              {grouped.map(({ app, bindings: appBindings }) => (
                <li
                  key={app.id}
                  className="rounded-md border border-border p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{app.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {app.urlScheme}://
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {t("accountManager.externalApps.useCount", { count: app.useCount })}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>
                      {t("accountManager.externalApps.boundAccounts")}:
                      {appBindings.length === 0
                        ? t("accountManager.externalApps.noBindings")
                        : appBindings
                            .map((b) => findAccountLabel(b.accountId, accounts))
                            .join(", ")}
                    </p>
                    <p>
                      {t("accountManager.externalApps.lastUsed")}:{" "}
                      {appBindings.length > 0
                        ? appBindings[0].lastUsedAt
                        : app.lastUsedAt}
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAppToRevoke(app)}
                      disabled={revokingAppId === app.id}
                      className="text-rose-600 hover:text-rose-700"
                    >
                      <Trash2 size={14} />
                      {revokingAppId === app.id
                        ? t("accountManager.externalApps.revoking")
                        : t("accountManager.externalApps.revoke")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("accountManager.externalApps.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {appToRevoke && (
        <DestructiveConfirmDialog
          open={appToRevoke !== null}
          onOpenChange={(next) => {
            if (!next) setAppToRevoke(null);
          }}
          title={t("accountManager.externalApps.revokeConfirmTitle")}
          description={t("accountManager.externalApps.revokeConfirmDescription", {
            name: appToRevoke.name,
          })}
          consequence={t("accountManager.externalApps.revokeConsequence")}
          confirmLabel={t("accountManager.externalApps.revoke")}
          cancelLabel={t("common.cancel")}
          loading={revokingAppId === appToRevoke.id}
          onConfirm={async () => {
            const id = appToRevoke.id;
            await revokeApp(id);
            setAppToRevoke(null);
          }}
        />
      )}
    </>
  );
}
