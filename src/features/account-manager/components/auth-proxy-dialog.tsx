/**
 * 外部登录代理对话框 / Auth Proxy Dialog:
 *   外部 App 通过 bench-auth:// 请求登录时弹出,让用户选择账号并触发 proxyLogin。
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { openExternal } from "@/platform/shell";
import { cn } from "@/lib/utils";
import type {
  AuthProxyMatch,
  AuthProxyRequest,
  StationAccount,
} from "@/lib/tauri/types/account-manager";
import { NEW_ACCOUNT } from "@/features/account-manager/hooks/useAuthProxy";
import type { AuthProxyConfirmInput } from "@/features/account-manager/hooks/useAuthProxy";

function statusBadgeClass(status: StationAccount["status"]): string {
  switch (status) {
    case "ready":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "loginRequired":
    case "expired":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "fetchFailed":
      return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusLabel(status: StationAccount["status"], t: (k: string) => string): string {
  return t(`accountManager.status.${status}`);
}

function deriveExternalAppName(request: AuthProxyRequest): string {
  try {
    const url = new URL(request.returnUrl);
    return url.protocol.replace(":", "") || "external app";
  } catch {
    return "external app";
  }
}

export interface AuthProxyDialogProps {
  open: boolean;
  request: AuthProxyRequest | null;
  matches: AuthProxyMatch[];
  host?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: AuthProxyConfirmInput) => Promise<boolean>;
  onCompleted?: () => void;
}

export function AuthProxyDialog({
  open,
  request,
  matches,
  host,
  onOpenChange,
  onConfirm,
  onCompleted,
}: AuthProxyDialogProps) {
  const { t } = useTranslation();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newAccountName, setNewAccountName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const allAccounts = matches.flatMap((m) => m.accounts);
      // 有已存账号则默认选第一个,否则默认「新账号」。
      setSelectedAccountId(allAccounts[0]?.id ?? NEW_ACCOUNT);
      setNewAccountName("");
      setSubmitting(false);
    }
  }, [open, matches]);

  const flatAccounts = useMemo(
    () =>
      matches.flatMap((m) =>
        m.accounts.map((a) => ({ account: a, match: m })),
      ),
    [matches],
  );

  const hasMatches = flatAccounts.length > 0;
  const externalAppName = request ? deriveExternalAppName(request) : "";
  const targetHost = useMemo(() => {
    if (host) return host;
    if (!request) return "";
    try {
      return new URL(request.target).host;
    } catch {
      return request.target;
    }
  }, [host, request]);

  const isNewAccount = selectedAccountId === NEW_ACCOUNT;

  const handleConfirm = async () => {
    if (!request || !selectedAccountId || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onConfirm({
        request,
        selectedAccountId,
        isNewAccount,
        targetHost,
        newAccountName,
      });
      if (ok) {
        onCompleted?.();
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenReturnUrl = async () => {
    if (!request) return;
    try {
      await openExternal(request.returnUrl);
    } catch (error) {
      console.warn("[auth-proxy] open return url failed:", error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound size={16} />
            {t("accountManager.authProxy.title")}
          </DialogTitle>
          <DialogDescription>
            {request
              ? t("accountManager.authProxy.subtitle", {
                  app: externalAppName,
                  host: targetHost,
                })
              : t("accountManager.authProxy.subtitleLoading")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {!hasMatches ? (
            <div className="space-y-1 pb-1 text-sm text-muted-foreground">
              <p>{t("accountManager.authProxy.noMatch")}</p>
              <p className="text-xs">{t("accountManager.authProxy.noMatchHint")}</p>
            </div>
          ) : (
            <p className="text-sm font-medium">{t("accountManager.authProxy.selectAccount")}</p>
          )}

          <ul className="space-y-1">
            {flatAccounts.map(({ account, match }) => {
              const isSelected = account.id === selectedAccountId;
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedAccountId(account.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        isSelected ? "border-primary" : "border-muted-foreground/30",
                      )}
                    >
                      {isSelected && (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">
                        {account.username}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {match.stationName} · {match.website}
                      </span>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn("shrink-0", statusBadgeClass(account.status))}
                    >
                      {statusLabel(account.status, t)}
                    </Badge>
                  </button>
                </li>
              );
            })}

            <li>
              <button
                type="button"
                onClick={() => setSelectedAccountId(NEW_ACCOUNT)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                  isNewAccount
                    ? "border-primary bg-primary/5"
                    : "border-dashed border-muted-foreground/30 hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    isNewAccount ? "border-primary" : "border-muted-foreground/30",
                  )}
                >
                  {isNewAccount && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {t("accountManager.authProxy.newAccount")}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t("accountManager.authProxy.newAccountHint", { host: targetHost })}
                  </span>
                </div>
              </button>
            </li>
          </ul>

          {isNewAccount && (
            <Input
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder={t("accountManager.authProxy.newAccountNamePlaceholder")}
              disabled={submitting}
            />
          )}

          <p className="pt-2 text-xs text-muted-foreground">
            {t("accountManager.authProxy.proxyHint")}
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenReturnUrl}
            disabled={!request}
          >
            <ExternalLink size={14} />
            {t("accountManager.authProxy.openReturnUrl")}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!request || !selectedAccountId || submitting}
          >
            <ShieldCheck size={14} />
            {submitting
              ? t("accountManager.authProxy.starting")
              : t("accountManager.authProxy.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
