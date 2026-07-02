/**
 * Detail column / 详情栏: station + account detail, password reveal, auth profile.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BadgeCheck, ExternalLink, Eye, EyeOff, HelpCircle, RefreshCw, ScanSearch, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  AuthProfile,
  ProbeStrategy,
  RelayStation,
  StationAccount,
} from "@/lib/tauri/types/account-manager";
import type { DetailRow } from "@/features/account-manager/model/types";
import {
  ColumnHeader,
  EmptyHint,
  IconButton,
  SectionLabel,
} from "@/features/account-manager/components/shared";

export function DetailColumn({
  station,
  account,
  onOpenWebsite,
  onRedetectProfile,
  onToggleProxy,
  onManageExternalApps,
  onRevealPassword,
  onCopyPassword,
  onProbeStrategyChange,
  onRefreshAccount,
  revealingPassword,
  settingProbeStrategy,
  redetectingProfile,
  togglingProxy,
  refreshingAccount,
}: {
  station: RelayStation | null;
  account: StationAccount | null;
  onOpenWebsite: () => void;
  onRedetectProfile: (stationId: string, accountId?: string) => void;
  onToggleProxy?: (accountId: string, enabled: boolean) => void;
  onManageExternalApps?: (accountId: string | null) => void;
  onRevealPassword: (accountId: string) => Promise<string>;
  onCopyPassword: (accountId: string) => Promise<void>;
  onProbeStrategyChange: (stationId: string, strategy: ProbeStrategy | "auto") => void;
  onRefreshAccount?: (account: StationAccount) => void;
  revealingPassword?: boolean;
  settingProbeStrategy?: boolean;
  redetectingProfile?: boolean;
  togglingProxy?: boolean;
  refreshingAccount?: boolean;
}) {
  const { t } = useTranslation();
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    setPasswordHidden(true);
    setRevealedPassword(null);
  }, [account?.id]);

  const handleTogglePassword = async () => {
    if (!account) return;
    if (!passwordHidden) {
      setPasswordHidden(true);
      return;
    }
    if (!account.hasPassword) {
      setPasswordHidden(false);
      return;
    }
    if (revealedPassword !== null) {
      setPasswordHidden(false);
      return;
    }
    setRevealing(true);
    try {
      const pw = await onRevealPassword(account.id);
      setRevealedPassword(pw);
      setPasswordHidden(false);
    } catch {
      toast.error(t("accountManager.toasts.revealPasswordFailed"));
    } finally {
      setRevealing(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!account || !account.hasPassword) return;
    try {
      await onCopyPassword(account.id);
    } catch {
      toast.error(t("accountManager.toasts.copyPasswordFailed"));
    }
  };

  const passwordValue = account?.hasPassword
    ? (revealedPassword ?? "••••••••")
    : "";

  return (
    <aside className="hidden w-[340px] shrink-0 rounded-lg border bg-card xl:flex xl:flex-col">
      <ColumnHeader
        title={t("accountManager.detailTitle")}
        action={
          station ? (
            <Button size="sm" variant="outline" onClick={onOpenWebsite}>
              <ExternalLink />
              {t("accountManager.detail.openWebsite")}
            </Button>
          ) : null
        }
      />
      <div className="min-h-0 flex-1 flex flex-col">
        {station ? (
          <>
            {/* 上方：站点信息 - 灵活高度，内容多时滚动 */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DetailSection
                bordered={false}
                rows={[
                  { label: t("accountManager.detail.website"), value: station.website, truncate: true, copy: true },
                  { label: t("accountManager.detail.remark"), value: station.remark, truncate: true },
                  { label: t("accountManager.detail.createdAt"), value: station.createdAt },
                ]}
                extras={
                  station.authProfile ? (
                    <AuthProfilePanel
                      profile={station.authProfile}
                      stationId={station.id}
                      accountId={account?.id}
                      stationProbeFailureCount={station.probeFailureCount}
                      onRedetect={onRedetectProfile}
                      onStrategyChange={onProbeStrategyChange}
                      settingStrategy={settingProbeStrategy}
                      redetecting={redetectingProfile}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-4">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <ScanSearch size={24} className="text-muted-foreground" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {t("accountManager.sessionManager.authProfile.notDetectedTitle")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("accountManager.sessionManager.authProfile.notDetectedDesc")}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onRedetectProfile(station.id, account?.id)}
                          disabled={redetectingProfile}
                          className="mt-1"
                        >
                          {redetectingProfile ? (
                            t("accountManager.sessionManager.authProfile.detecting")
                          ) : (
                            <>
                              <ScanSearch size={13} />
                              {t("accountManager.sessionManager.authProfile.detectNow")}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                }
              />
            </div>

            {/* 下方：账号信息 - 按内容撑开，不滚动 */}
            <div className="shrink-0 border-t">
              {/* Account 详情 */}
              {account && (
                <DetailSection
                  bordered={false}
                  rows={[
                    { label: t("accountManager.detail.username"), value: account.username, copy: true, truncate: true },
                    {
                      label: t("accountManager.detail.password"),
                      value: passwordValue,
                      truncate: true,
                      reveal: {
                        hidden: passwordHidden,
                        onToggle: handleTogglePassword,
                        loading: revealing || revealingPassword,
                      },
                      copy: account.hasPassword,
                      onCopy: handleCopyPassword,
                    },
                    { label: t("accountManager.detail.notes"), value: account.notes || "—", truncate: true },
                    {
                      label: t("accountManager.detail.lastRefreshedAt"),
                      value: account.lastRefreshedAt || t("accountManager.card.neverRefreshed"),
                    },
                    {
                      label: t("accountManager.detail.lastLogin"),
                      value: account.lastLoginAt || "—",
                    },
                  ]}
                />
              )}
            </div>
          </>
        ) : (
          <div className="px-5 py-6">
            <EmptyHint
              icon={<BadgeCheck className="size-8 opacity-40" />}
              text={t("accountManager.detail.empty")}
            />
          </div>
        )}
      </div>

      {/* 底部操作行 - 与其他两列对称 */}
      <div className="flex items-center justify-between border-t px-3 py-3">
        {account && onToggleProxy && (
          <div className="flex items-center gap-1.5">
            <Switch
              checked={!!account.proxyEnabled}
              onCheckedChange={(enabled) => onToggleProxy(account.id, enabled)}
              disabled={togglingProxy}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {t("accountManager.detail.proxyEnabled")}
            </span>
          </div>
        )}
        {account && (
          <div className="flex items-center gap-1.5">
            {onManageExternalApps && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={() => onManageExternalApps(account.id)}
                      aria-label={t("accountManager.detail.manageExternalApps")}
                    >
                      <Settings size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t("accountManager.detail.manageExternalApps")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={() => onRefreshAccount?.(account)}
                    disabled={refreshingAccount}
                    aria-label={t("accountManager.refreshStatus")}
                  >
                    <RefreshCw size={14} className={refreshingAccount ? "animate-spin" : undefined} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("accountManager.refreshStatus")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    </aside>
  );
}

function DetailSection({
  title,
  heading,
  action,
  rows,
  extras,
  footer,
  note,
  bordered = true,
}: {
  title?: string;
  heading?: ReactNode;
  action?: ReactNode;
  rows: DetailRow[];
  extras?: ReactNode;
  footer?: ReactNode;
  note?: ReactNode;
  bordered?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 px-5 py-4">
      {title && (
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>{title}</SectionLabel>
          {action}
        </div>
      )}
      {heading}
      {rows.length > 0 && (
        <div className={cn(
          bordered && "rounded-lg border bg-muted/20 p-3",
          !bordered && "space-y-2"
        )}>
          <div className={cn(!bordered && "space-y-2", bordered && "space-y-2")}>
            {rows.map(({ label, value, truncate, copy, onCopy, reveal }) => {
              const hasValue = value.length > 0;
              const display = reveal?.hidden
                ? hasValue
                  ? "•".repeat(Math.min(value.length, 12))
                  : "—"
                : hasValue
                  ? value
                  : "—";
              const handleCopy = async () => {
                if (!copy && !hasValue) return;
                try {
                  if (onCopy) {
                    await onCopy();
                  } else {
                    await navigator.clipboard.writeText(value);
                  }
                  toast.success(t("accountManager.toasts.copySuccess"));
                } catch {
                  toast.error(t("accountManager.toasts.copyFailed"));
                }
              };
              const valueEl = (
                <span
                  className={cn(
                    "min-w-0 text-right font-medium",
                    truncate ? "truncate" : "break-all",
                    copy && hasValue && "cursor-pointer hover:underline"
                  )}
                  onClick={copy && hasValue ? handleCopy : undefined}
                >
                  {display}
                </span>
              );
              return (
                <div key={label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">{label}</span>
                  <div className="flex min-w-0 max-w-[68%] items-center justify-end gap-1">
                    {truncate && hasValue ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>{valueEl}</TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs break-all">
                            {display}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      valueEl
                    )}
                    {reveal && (
                      <IconButton
                        onClick={reveal.onToggle}
                        icon={reveal.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                        label={
                          reveal.hidden
                            ? t("accountManager.detail.revealPassword")
                            : t("accountManager.detail.hidePassword")
                        }
                        disabled={reveal.loading}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {extras && <div className="mt-3 pt-3 border-t">{extras}</div>}
        </div>
      )}
      {rows.length === 0 && extras}
      {footer}
      {note && (
        <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {note}
        </div>
      )}
    </div>
  );
}

function AuthProfilePanel({
  profile,
  stationId,
  accountId,
  stationProbeFailureCount,
  onRedetect,
  onStrategyChange,
  settingStrategy,
  redetecting,
}: {
  profile: AuthProfile;
  stationId: string;
  accountId?: string;
  stationProbeFailureCount?: number;
  onRedetect: (stationId: string, accountId?: string) => void;
  onStrategyChange: (stationId: string, strategy: ProbeStrategy | "auto") => void;
  settingStrategy?: boolean;
  redetecting?: boolean;
}) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState(profile.probeStrategy);

  useEffect(() => {
    setStrategy(profile.probeStrategy);
  }, [profile.probeStrategy, stationId]);

  const handleStrategyChange = (next: string) => {
    if (next === "auto") {
      setStrategy(profile.probeStrategy);
      onStrategyChange(stationId, "auto");
      return;
    }
    setStrategy(next as ProbeStrategy);
    onStrategyChange(stationId, next as ProbeStrategy);
  };

  const p = profile;
  const confPct = Math.round(p.confidence * 100);
  const isOverridden = strategy !== profile.probeStrategy;

  const dims: Array<{
    icon: string;
    label: string;
    status: "ok" | "warn" | "off" | "na";
    detail: string;
    tooltip?: string;
  }> = [
    {
      icon: "📋",
      label: t("accountManager.sessionManager.authProfile.cookieBased"),
      status: p.cookieBased ? "ok" : "off",
      detail: p.cookieBased
        ? t("accountManager.sessionManager.authProfile.cookieDetected")
        : t("accountManager.sessionManager.authProfile.cookieUndetected"),
    },
    {
      icon: "💾",
      label: t("accountManager.sessionManager.authProfile.tokenStorage"),
      status: p.tokenStorage !== "none" ? "ok" : "off",
      detail: p.tokenStorage,
    },
    {
      icon: "🛡",
      label: t("accountManager.sessionManager.authProfile.csrf"),
      status: p.csrfProtection ? "ok" : "off",
      detail: p.csrfProtection
        ? t("accountManager.sessionManager.authProfile.csrfEnabled")
        : t("accountManager.sessionManager.authProfile.csrfDisabled"),
      tooltip: p.csrfProtection && p.csrfExtraction
        ? `${t("accountManager.sessionManager.authProfile.csrfExtraction")}: ${p.csrfExtraction.source} / ${p.csrfExtraction.name} → ${p.csrfExtraction.headerName}`
        : undefined,
    },
    {
      icon: "🔐",
      label: t("accountManager.sessionManager.authProfile.authType"),
      status: p.authType !== "unknown" ? "ok" : "warn",
      detail: p.authType,
    },
    {
      icon: "👆",
      label: t("accountManager.sessionManager.authProfile.fingerprinting"),
      status: p.fingerprinting === "none" ? "na" : p.fingerprinting === "basic" ? "ok" : "warn",
      detail:
        p.fingerprinting === "none"
          ? t("accountManager.sessionManager.authProfile.fingerprintingNone")
          : p.fingerprinting === "basic"
            ? t("accountManager.sessionManager.authProfile.fingerprintingBasic")
            : t("accountManager.sessionManager.authProfile.fingerprintingStrict"),
    },
    {
      icon: "🚫",
      label: t("accountManager.sessionManager.authProfile.antiBot"),
      status: p.antiBot ? "warn" : "off",
      detail: p.antiBot
        ? p.antiBotProvider ?? t("accountManager.sessionManager.authProfile.antiBotDetected")
        : t("accountManager.sessionManager.authProfile.antiBotUndetected"),
    },
  ];

  if (p.ssoProvider) {
    dims.push({
      icon: "🔗",
      label: t("accountManager.sessionManager.authProfile.ssoProvider"),
      status: "ok",
      detail: p.ssoProvider,
    });
  }

  const statusColor = (s: typeof dims[number]["status"]) =>
    s === "ok" ? "bg-emerald-500"
    : s === "warn" ? "bg-amber-500"
    : s === "off" ? "bg-red-500/60"
    : "bg-slate-400/40";

  const strategyLabels: Record<string, string> = {
    httpFirst: t("accountManager.sessionManager.authProfile.probeStrategyHttpFirst"),
    httpOnly: t("accountManager.sessionManager.authProfile.probeStrategyHttpOnly"),
    webviewOnly: t("accountManager.sessionManager.authProfile.probeStrategyWebviewOnly"),
    hybrid: t("accountManager.sessionManager.authProfile.probeStrategyHybrid"),
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-blue-400">
            {t("accountManager.sessionManager.authProfile.title")}
          </span>
          <button
            type="button"
            onClick={() => onRedetect(stationId, accountId)}
            disabled={redetecting}
            className="rounded px-1.5 py-0.5 text-[10px] font-normal text-blue-500 hover:bg-blue-500/10 disabled:opacity-50"
          >
            {t("accountManager.sessionManager.authProfile.redetect")}
          </button>
        </div>

        <div className="mb-2 space-y-1 text-[10px] text-muted-foreground">
          <div className="flex justify-between">
            <span>{t("accountManager.sessionManager.authProfile.detectedAt")}</span>
            <span className="text-foreground">{p.detectedAt}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{t("accountManager.sessionManager.authProfile.confidence")}</span>
            <span className="font-medium text-foreground">{confPct}%</span>
          </div>
          <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-blue-500/10">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${confPct}%` }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          {dims.map((d) => (
            <div key={d.label} className="flex items-center justify-between gap-2 text-[11px]">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0">{d.icon}</span>
                <span className="truncate text-muted-foreground">{d.label}</span>
                {d.tooltip && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          tabIndex={-1}
                        >
                          <HelpCircle size={11} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-48 text-[10px]">
                        {d.tooltip}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-foreground">{d.detail}</span>
                <span className={cn("inline-block size-2 shrink-0 rounded-full", statusColor(d.status))} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-blue-500/10 pt-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">
              {t("accountManager.sessionManager.authProfile.probeStrategy")}
            </span>
            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
              {strategyLabels[strategy] ?? strategy}
            </span>
          </div>
          {stationProbeFailureCount !== undefined && stationProbeFailureCount > 0 && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {t("accountManager.sessionManager.authProfile.probeSuccessRate")}:{" "}
              {t("accountManager.sessionManager.authProfile.noData")}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={strategy}
          onChange={(e) => handleStrategyChange(e.target.value)}
          disabled={settingStrategy}
          className="h-7 flex-1 rounded border border-border bg-muted/50 px-2 text-[11px] text-foreground outline-none focus:border-blue-400"
        >
          <option value="auto">{t("accountManager.sessionManager.authProfile.probeStrategyAuto")}</option>
          <option value="httpFirst">{t("accountManager.sessionManager.authProfile.probeStrategyHttpFirst")}</option>
          <option value="httpOnly">{t("accountManager.sessionManager.authProfile.probeStrategyHttpOnly")}</option>
          <option value="webviewOnly">{t("accountManager.sessionManager.authProfile.probeStrategyWebviewOnly")}</option>
          <option value="hybrid">{t("accountManager.sessionManager.authProfile.probeStrategyHybrid")}</option>
        </select>
      </div>

      {isOverridden && (
        <div className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-600">
          {t("accountManager.sessionManager.authProfile.strategyManualOverride")}
        </div>
      )}
    </div>
  );
}
