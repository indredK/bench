/**
 * 外部应用管理对话框 / External Apps Panel:
 *   列出已授权的外部 App + 绑定关系,支持取消授权 (revoke)。
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import * as api from "@/features/api-billing/api";
import type {
  ExternalApp,
  ExternalAppBinding,
  StationAccount,
} from "@/features/api-billing/api";

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
  /** 当前查看的账号 ID。提供时只显示该账号绑定的 App。 */
  accountId?: string | null;
  /** 账号列表,用于展示账号用户名(而不是裸 ID)。 */
  accounts: StationAccount[];
}

export function ExternalAppsPanel({
  open,
  onOpenChange,
  accountId,
  accounts,
}: ExternalAppsPanelProps) {
  const { t } = useTranslation();
  const [apps, setApps] = useState<ExternalApp[]>([]);
  const [bindings, setBindings] = useState<ExternalAppBinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const filterAccountId = accountId ?? null;
      const [appsList, bindingsList] = await Promise.all([
        api.listExternalApps(null, filterAccountId),
        api.listExternalAppBindings(filterAccountId),
      ]);
      setApps(appsList);
      setBindings(bindingsList);
    } catch (error) {
      console.error("[external-apps-panel] reload failed:", error);
      toast.error(t("apiBilling.toasts.loadExternalAppsFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountId]);

  const handleRevoke = async (appId: string) => {
    setRevokingId(appId);
    try {
      await api.removeExternalApp(appId);
      await reload();
      toast.success(t("apiBilling.toasts.revokeExternalAppSuccess"));
    } catch (error) {
      console.error("[external-apps-panel] revoke failed:", error);
      toast.error(t("apiBilling.toasts.revokeExternalAppFailed"));
    } finally {
      setRevokingId(null);
    }
  };

  const grouped = groupByApp(apps, bindings);

  return (
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
            {t("apiBilling.externalApps.title")}
          </DialogTitle>
          <DialogDescription>
            {t("apiBilling.externalApps.subtitle")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t("apiBilling.externalApps.loading")}
          </div>
        ) : grouped.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t("apiBilling.externalApps.empty")}
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
                    {t("apiBilling.externalApps.useCount", { count: app.useCount })}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>
                    {t("apiBilling.externalApps.boundAccounts")}:
                    {appBindings.length === 0
                      ? t("apiBilling.externalApps.noBindings")
                      : appBindings
                          .map((b) => findAccountLabel(b.accountId, accounts))
                          .join(", ")}
                  </p>
                  <p>
                    {t("apiBilling.externalApps.lastUsed")}:{" "}
                    {appBindings.length > 0
                      ? appBindings[0].lastUsedAt
                      : app.lastUsedAt}
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(app.id)}
                    disabled={revokingId === app.id}
                    className="text-rose-600 hover:text-rose-700"
                  >
                    <Trash2 size={14} />
                    {revokingId === app.id
                      ? t("apiBilling.externalApps.revoking")
                      : t("apiBilling.externalApps.revoke")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("apiBilling.externalApps.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
