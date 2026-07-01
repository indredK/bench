/**
 * Detail column / 详情栏: station + account detail, password reveal, auth profile.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BadgeCheck, ExternalLink, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import * as api from "@/features/api-billing/api";
import type {
  AuthProfile,
  ProbeStrategy,
  RelayStation,
  StationAccount,
} from "@/features/api-billing/api";
import type { DetailRow } from "@/features/api-billing/model/types";
import {
  ColumnHeader,
  CopyIconButton,
  EmptyHint,
  IconButton,
  SectionLabel,
} from "@/features/api-billing/components/shared";

export function DetailColumn({
  station,
  account,
  onOpenWebsite,
  onRedetectProfile,
  onToggleProxy,
  onManageExternalApps,
}: {
  station: RelayStation | null;
  account: StationAccount | null;
  onOpenWebsite: () => void;
  onRedetectProfile: (stationId: string) => void;
  onToggleProxy?: (accountId: string, enabled: boolean) => void;
  onManageExternalApps?: (accountId: string | null) => void;
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
      const pw = await api.revealPassword(account.id);
      setRevealedPassword(pw);
      setPasswordHidden(false);
    } catch (error) {
      toast.error(t("apiBilling.toasts.revealPasswordFailed"));
    } finally {
      setRevealing(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!account || !account.hasPassword) return;
    try {
      await api.copyPasswordToClipboard(account.id);
    } catch (error) {
      toast.error(t("apiBilling.toasts.copyPasswordFailed"));
    }
  };

  const handleCopyWebsite = async () => {
    if (!station) return;
    try {
      await navigator.clipboard.writeText(station.website);
    } catch {
      /* clipboard unavailable */
    }
  };

  const passwordValue = account?.hasPassword
    ? (revealedPassword ?? "••••••••")
    : "";

  return (
    <aside className="hidden w-[340px] shrink-0 rounded-lg border bg-card xl:flex xl:flex-col">
      <ColumnHeader title={t("apiBilling.detailTitle")} action={null} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {station ? (
          <div className="divide-y">
            <DetailSection
              title={t("apiBilling.detail.stationSection")}
              rows={[
                { label: t("apiBilling.detail.remark"), value: station.remark, truncate: true },
                { label: t("apiBilling.detail.website"), value: station.website, truncate: true },
                { label: t("apiBilling.detail.createdAt"), value: station.createdAt },
              ]}
              footer={
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={onOpenWebsite}>
                    <ExternalLink />
                    {t("apiBilling.detail.openWebsite")}
                  </Button>
                </div>
              }
            />

            {/* Account 详情 */}
            {account && (
              <DetailSection
                title="账号信息"
                rows={[
                  { label: "用户名", value: account.username },
                  {
                    label: "密码",
                    value: passwordValue,
                    reveal: {
                      hidden: passwordHidden,
                      onToggle: handleTogglePassword,
                      loading: revealing,
                    },
                    copy: account.hasPassword,
                    onCopy: handleCopyPassword,
                  },
                  { label: "备注", value: account.notes || "—" },
                  {
                    label: "网站",
                    value: station.website,
                    truncate: true,
                    copy: true,
                    onCopy: handleCopyWebsite,
                  },
                ]}
              />
            )}

            {station.authProfile && (
              <AuthProfilePanel
                profile={station.authProfile}
                stationId={station.id}
                stationProbeFailureCount={station.probeFailureCount}
                onRedetect={onRedetectProfile}
              />
            )}

            {account && (
              <DetailSection
                title={t("apiBilling.detail.proxySectionTitle")}
                rows={[]}
                extras={
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">{t("apiBilling.detail.proxyEnabled")}</span>
                        <span className="text-xs text-muted-foreground">{t("apiBilling.detail.proxyEnabledHint")}</span>
                      </div>
                      <Switch
                        checked={!!account.proxyEnabled}
                        onCheckedChange={(enabled) => onToggleProxy?.(account.id, enabled)}
                      />
                    </div>
                    {onManageExternalApps && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between"
                        onClick={() => onManageExternalApps(account.id)}
                      >
                        <span className="text-sm text-muted-foreground">
                          {t("apiBilling.detail.manageExternalApps")}
                        </span>
                        <ExternalLink size={14} />
                      </Button>
                    )}
                  </div>
                }
              />
            )}

          </div>
        ) : (
          <div className="px-5 py-6">
            <EmptyHint
              icon={<BadgeCheck className="size-8 opacity-40" />}
              text={t("apiBilling.detail.empty")}
            />

          </div>
        )}
      </div>
    </aside>
  );
}

function DetailSection({
  title,
  heading,
  rows,
  extras,
  footer,
  note,
}: {
  title: string;
  heading?: ReactNode;
  rows: DetailRow[];
  extras?: ReactNode;
  footer?: ReactNode;
  note?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 px-5 py-4">
      <SectionLabel>{title}</SectionLabel>
      {heading}
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="space-y-2">
          {rows.map(({ label, value, truncate, copy, onCopy, reveal }) => {
            const hasValue = value.length > 0;
            const display = reveal?.hidden
              ? hasValue
                ? "•".repeat(Math.min(value.length, 12))
                : "—"
              : hasValue
                ? value
                : "—";
            return (
              <div key={label} className="flex items-center justify-between gap-3 text-sm">
                <span className="shrink-0 text-muted-foreground">{label}</span>
                <div className="flex min-w-0 max-w-[68%] items-center justify-end gap-1">
                  <span
                    className={cn(
                      "min-w-0 text-right font-medium",
                      truncate ? "truncate" : "break-all"
                    )}
                  >
                    {display}
                  </span>
                  {reveal && (
                    <IconButton
                      onClick={reveal.onToggle}
                      icon={reveal.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                      label={
                        reveal.hidden
                          ? t("apiBilling.detail.revealPassword")
                          : t("apiBilling.detail.hidePassword")
                      }
                      disabled={reveal.loading}
                    />
                  )}
                  {copy && (
                    <CopyIconButton
                      value={value}
                      label={t("apiBilling.detail.copy")}
                      onCopy={onCopy}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {extras}
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
  stationProbeFailureCount,
  onRedetect,
}: {
  profile: AuthProfile;
  stationId: string;
  stationProbeFailureCount?: number;
  onRedetect: (stationId: string) => void;
}) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState(profile.probeStrategy);
  const [setting, setSetting] = useState(false);
  const handleStrategyChange = async (next: string) => {
    if (next === "auto") {
      setSetting(true);
      try {
        await api.resetProbeStrategy(stationId);
        setStrategy(profile.probeStrategy);
      } catch { /* ignore */ }
      setSetting(false);
      return;
    }
    setSetting(true);
    try {
      await api.setProbeStrategy(stationId, next as ProbeStrategy);
      setStrategy(next as ProbeStrategy);
    } catch { /* ignore */ }
    setSetting(false);
  };

  const p = profile;
  const confPct = Math.round(p.confidence * 100);
  const isOverridden = strategy !== profile.probeStrategy;

  const dims: Array<{
    icon: string;
    label: string;
    status: "ok" | "warn" | "off" | "na";
    detail: string;
  }> = [
    {
      icon: "📋",
      label: t("apiBilling.sessionManager.authProfile.cookieBased"),
      status: p.cookieBased ? "ok" : "off",
      detail: p.cookieBased
        ? t("apiBilling.sessionManager.authProfile.cookieDetected")
        : t("apiBilling.sessionManager.authProfile.cookieUndetected"),
    },
    {
      icon: "💾",
      label: t("apiBilling.sessionManager.authProfile.tokenStorage"),
      status: p.tokenStorage !== "none" ? "ok" : "off",
      detail: p.tokenStorage,
    },
    {
      icon: "🛡",
      label: t("apiBilling.sessionManager.authProfile.csrf"),
      status: p.csrfProtection ? "ok" : "off",
      detail: p.csrfProtection
        ? t("apiBilling.sessionManager.authProfile.csrfEnabled")
        : t("apiBilling.sessionManager.authProfile.csrfDisabled"),
    },
    {
      icon: "🔐",
      label: t("apiBilling.sessionManager.authProfile.authType"),
      status: p.authType !== "unknown" ? "ok" : "warn",
      detail: p.authType,
    },
    {
      icon: "👆",
      label: t("apiBilling.sessionManager.authProfile.fingerprinting"),
      status: p.fingerprinting === "none" ? "na" : p.fingerprinting === "basic" ? "ok" : "warn",
      detail:
        p.fingerprinting === "none"
          ? t("apiBilling.sessionManager.authProfile.fingerprintingNone")
          : p.fingerprinting === "basic"
            ? t("apiBilling.sessionManager.authProfile.fingerprintingBasic")
            : t("apiBilling.sessionManager.authProfile.fingerprintingStrict"),
    },
    {
      icon: "🚫",
      label: t("apiBilling.sessionManager.authProfile.antiBot"),
      status: p.antiBot ? "warn" : "off",
      detail: p.antiBot
        ? t("apiBilling.sessionManager.authProfile.antiBotDetected")
        : t("apiBilling.sessionManager.authProfile.antiBotUndetected"),
    },
  ];

  if (p.ssoProvider) {
    dims.push({
      icon: "🔗",
      label: t("apiBilling.sessionManager.authProfile.ssoProvider"),
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
    httpFirst: t("apiBilling.sessionManager.authProfile.probeStrategyHttpFirst"),
    httpOnly: t("apiBilling.sessionManager.authProfile.probeStrategyHttpOnly"),
    webviewOnly: t("apiBilling.sessionManager.authProfile.probeStrategyWebviewOnly"),
    hybrid: t("apiBilling.sessionManager.authProfile.probeStrategyHybrid"),
  };

  return (
    <div className="mx-5 mt-3 space-y-3">
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-blue-400">
            {t("apiBilling.sessionManager.authProfile.title")}
          </span>
          <button
            type="button"
            onClick={() => onRedetect(stationId)}
            className="rounded px-1.5 py-0.5 text-[10px] font-normal text-blue-500 hover:bg-blue-500/10"
          >
            {t("apiBilling.sessionManager.authProfile.redetect")}
          </button>
        </div>

        <div className="mb-2 space-y-1 text-[10px] text-muted-foreground">
          <div className="flex justify-between">
            <span>{t("apiBilling.sessionManager.authProfile.detectedAt")}</span>
            <span className="text-foreground">{p.detectedAt}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>{t("apiBilling.sessionManager.authProfile.confidence")}</span>
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
              {t("apiBilling.sessionManager.authProfile.probeStrategy")}
            </span>
            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
              {strategyLabels[strategy] ?? strategy}
            </span>
          </div>
          {stationProbeFailureCount !== undefined && stationProbeFailureCount > 0 && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {t("apiBilling.sessionManager.authProfile.probeSuccessRate")}:{" "}
              {t("apiBilling.sessionManager.authProfile.noData")}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={strategy}
          onChange={(e) => handleStrategyChange(e.target.value)}
          disabled={setting}
          className="h-7 flex-1 rounded border border-border bg-muted/50 px-2 text-[11px] text-foreground outline-none focus:border-blue-400"
        >
          <option value="auto">{t("apiBilling.sessionManager.authProfile.probeStrategyAuto")}</option>
          <option value="httpFirst">{t("apiBilling.sessionManager.authProfile.probeStrategyHttpFirst")}</option>
          <option value="httpOnly">{t("apiBilling.sessionManager.authProfile.probeStrategyHttpOnly")}</option>
          <option value="webviewOnly">{t("apiBilling.sessionManager.authProfile.probeStrategyWebviewOnly")}</option>
          <option value="hybrid">{t("apiBilling.sessionManager.authProfile.probeStrategyHybrid")}</option>
        </select>
      </div>

      {isOverridden && (
        <div className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-600">
          {t("apiBilling.sessionManager.authProfile.strategyManualOverride")}
        </div>
      )}
    </div>
  );
}
