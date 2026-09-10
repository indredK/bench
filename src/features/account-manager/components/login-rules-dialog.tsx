/**
 * Login rules dialog / 更新登录逻辑弹窗:
 * 展示当前生效的登录判定规则（generic 通用规则 + 当前站点特殊规则）与更新时间,
 * 远程检查有更新时才允许点击对应更新按钮；检查中展示加载态。
 */
import { useTranslation } from "react-i18next"
import { CloudDownload, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type {
  LoginRuleSummary,
  LoginRulesOverview,
  LoginRulesUpdateScope,
} from "@/lib/tauri/types/account-manager"

function RuleCard({
  rule,
  title,
  updatable,
  remoteVersion,
  indexUpdatedAt,
  lastFetchedAt,
  language,
}: {
  rule: LoginRuleSummary
  title: string
  updatable: boolean
  remoteVersion: string | null
  indexUpdatedAt: string | null
  lastFetchedAt: number | null
  language: string
}) {
  const { t } = useTranslation()
  const formatTs = (ts: number) => {
    try {
      return new Intl.DateTimeFormat(language, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(ts * 1000))
    } catch {
      return null
    }
  }
  const formatIso = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(language, {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(iso))
    } catch {
      return iso
    }
  }
  const updatedLabel =
    rule.source === "remote"
      ? ((indexUpdatedAt ? formatIso(indexUpdatedAt) : null) ??
        (lastFetchedAt ? formatTs(lastFetchedAt) : null) ??
        t("accountManager.loginRules.unknownTime"))
      : t("accountManager.loginRules.bundledTime")

  return (
    <div className="bg-muted/30 space-y-2 rounded-lg border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
          v{rule.version}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px]",
            rule.source === "remote"
              ? "bg-emerald-500/10 text-emerald-600"
              : "text-muted-foreground bg-slate-500/10",
          )}
        >
          {rule.source === "remote"
            ? t("accountManager.loginRules.sourceRemote")
            : t("accountManager.loginRules.sourceBundled")}
        </span>
        {updatable && remoteVersion && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600">
            {t("accountManager.loginRules.hasUpdate", { version: remoteVersion })}
          </span>
        )}
      </div>
      <div className="text-muted-foreground space-y-1 text-xs">
        {rule.hasLoginCheck ? (
          <p>
            {t("accountManager.loginRules.viaLoginCheck", {
              method: rule.loginCheckMethod ?? "GET",
            })}
            <span className="ml-1 font-mono break-all">{rule.loginCheckUrl}</span>
          </p>
        ) : null}
        {rule.loggedOutTexts.length > 0 && (
          <p>
            {t("accountManager.loginRules.loggedOutEvidence", {
              evidence: rule.loggedOutTexts.join("、"),
            })}
          </p>
        )}
        {rule.loggedInTexts.length > 0 && (
          <p>
            {t("accountManager.loginRules.loggedInEvidence", {
              evidence: rule.loggedInTexts.join("、"),
            })}
          </p>
        )}
      </div>
      <p className="text-muted-foreground text-[11px]">
        {t("accountManager.loginRules.updatedAt", { time: updatedLabel })}
      </p>
    </div>
  )
}

export function LoginRulesDialog({
  open,
  onOpenChange,
  website,
  overview,
  checking,
  updatingScope,
  onUpdate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  website: string | null
  overview: LoginRulesOverview | null
  checking: boolean
  updatingScope: LoginRulesUpdateScope | null
  onUpdate: (scope: LoginRulesUpdateScope) => void
}) {
  const { t, i18n } = useTranslation()
  const remote = overview?.remote ?? null
  const generic = overview?.generic ?? null
  const site = overview?.site ?? null
  const anyUpdatable = Boolean(remote?.genericUpdatable || remote?.siteUpdatable)
  const updating = updatingScope !== null

  const disabledReason = checking || updating || !remote
  const updateDisabled = (scope: LoginRulesUpdateScope) => {
    if (disabledReason) return true
    if (scope === "generic") return !remote.genericUpdatable
    if (scope === "site") return !remote.siteUpdatable
    return !anyUpdatable
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudDownload size={16} />
            {t("accountManager.loginRules.title")}
          </DialogTitle>
          <DialogDescription>
            {t("accountManager.loginRules.description", {
              host: website ?? "",
            })}
          </DialogDescription>
        </DialogHeader>

        {checking && !overview ? (
          <div className="text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-4 text-sm">
            <Loader2 size={14} className="animate-spin" />
            {t("accountManager.loginRules.checking")}
          </div>
        ) : !overview || !generic ? (
          <div className="text-muted-foreground rounded-lg border px-3 py-4 text-sm">
            {t("accountManager.loginRules.empty")}
          </div>
        ) : (
          <div className="space-y-3">
            <RuleCard
              rule={generic}
              title={t("accountManager.loginRules.genericTitle", { title: generic.title })}
              updatable={remote?.genericUpdatable ?? false}
              remoteVersion={remote?.generic?.version ?? null}
              indexUpdatedAt={remote?.indexUpdatedAt ?? null}
              lastFetchedAt={overview.lastFetchedAt ?? null}
              language={i18n.language}
            />
            {site ? (
              <RuleCard
                rule={site}
                title={t("accountManager.loginRules.siteTitle", { title: site.title })}
                updatable={remote?.siteUpdatable ?? false}
                remoteVersion={remote?.site?.version ?? null}
                indexUpdatedAt={remote?.indexUpdatedAt ?? null}
                lastFetchedAt={overview.lastFetchedAt ?? null}
                language={i18n.language}
              />
            ) : (
              <div className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
                {t("accountManager.loginRules.noSiteRule")}
              </div>
            )}

            {checking ? (
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Loader2 size={12} className="animate-spin" />
                {t("accountManager.loginRules.checking")}
              </div>
            ) : remote ? (
              <p className="text-muted-foreground text-[11px]">
                {anyUpdatable
                  ? t("accountManager.loginRules.updatesAvailable")
                  : t("accountManager.loginRules.upToDate")}
              </p>
            ) : (
              <p className="text-[11px] text-amber-600">
                {overview.remoteError
                  ? t("accountManager.loginRules.checkFailed")
                  : t("accountManager.loginRules.noRemoteSource")}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onUpdate("all")}
            disabled={updateDisabled("all")}
          >
            {updatingScope === "all" && <Loader2 size={13} className="animate-spin" />}
            {t("accountManager.loginRules.updateAll")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onUpdate("generic")}
            disabled={updateDisabled("generic")}
          >
            {updatingScope === "generic" && <Loader2 size={13} className="animate-spin" />}
            {t("accountManager.loginRules.updateGeneric")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onUpdate("site")}
            disabled={updateDisabled("site")}
          >
            {updatingScope === "site" && <Loader2 size={13} className="animate-spin" />}
            {t("accountManager.loginRules.updateSite")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t("accountManager.loginRules.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
