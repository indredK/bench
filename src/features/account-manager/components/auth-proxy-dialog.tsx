/**
 * 外部登录代理对话框 / Auth Proxy Dialog:
 *   三步向导: 粘贴 URL → 选择站点/账号 → 确认登录
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { KeyRound, ArrowRight, Loader2, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { openExternal } from "@/platform/shell"
import { cn } from "@/lib/utils"
import type {
  AuthProxyMatch,
  AuthProxyRequest,
  MatchConfidence,
  RelayStation,
  StationAccount,
} from "@/lib/tauri/types/account-manager"
import { accountManagerRepository } from "@/features/account-manager/services/account-manager.repository"
import { NEW_ACCOUNT } from "@/features/account-manager/hooks/useAuthProxy"
import type { AuthProxyConfirmInput } from "@/features/account-manager/hooks/useAuthProxy"

// ═══════════════════════════════════════════════
// Wizard step constants
// ═══════════════════════════════════════════════

const STEP_PASTE = 1
const STEP_SELECT = 2
const STEP_CONFIRM = 3

// ═══════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════

function statusBadgeClass(status: StationAccount["status"]): string {
  switch (status) {
    case "ready":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    case "loginRequired":
    case "expired":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400"
    case "fetchFailed":
      return "bg-rose-500/15 text-rose-600 dark:text-rose-400"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function statusLabel(status: StationAccount["status"], t: (k: string) => string): string {
  return t(`accountManager.status.${status}`)
}

function deriveExternalAppName(url: string, t?: (k: string) => string): string {
  try {
    const u = new URL(url)
    return u.protocol.replace(":", "") || (t ? t("accountManager.authProxy.wizard.externalAppFallback") : "external app")
  } catch {
    return t ? t("accountManager.authProxy.wizard.externalAppFallback") : "external app"
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function safeTruncate(str: string, max = 60): string {
  if (str.length <= max) return str
  return str.slice(0, max) + "\u2026"
}

// ═══════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════

export interface AuthProxyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (input: AuthProxyConfirmInput) => Promise<boolean>
  onCompleted?: () => void
}

// ═══════════════════════════════════════════════
// Main dialog component
// ═══════════════════════════════════════════════

export function AuthProxyDialog({
  open,
  onOpenChange,
  onConfirm,
  onCompleted,
}: AuthProxyDialogProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEP_PASTE)
  const [url, setUrl] = useState("")
  const [parsing, setParsing] = useState(false)
  const [parsedRequest, setParsedRequest] = useState<AuthProxyRequest | null>(null)
  const [parsedHost, setParsedHost] = useState("")
  const [parsedMatches, setParsedMatches] = useState<AuthProxyMatch[]>([])

  // All known stations/accounts (loaded when dialog opens) so the user can
  // pick a site even if its host does not match the pasted URL.
  const [allStations, setAllStations] = useState<RelayStation[]>([])
  const [allAccounts, setAllAccounts] = useState<StationAccount[]>([])

  // Step 2 selections
  const [selectedStationIndex, setSelectedStationIndex] = useState<number | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [newAccountName, setNewAccountName] = useState("")

  // Step 3
  const [confirming, setConfirming] = useState(false)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep(STEP_PASTE)
      setUrl("")
      setParsing(false)
      setParsedRequest(null)
      setParsedHost("")
      setParsedMatches([])
      setSelectedStationIndex(null)
      setSelectedAccountId(null)
      setNewAccountName("")
      setConfirming(false)
    }
  }, [open])

  // Preload all stations + accounts so the site selector can offer every site,
  // not only the ones whose host matches the URL.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.all([
      accountManagerRepository.listStations(),
      accountManagerRepository.listAllAccounts(),
    ])
      .then(([stations, accounts]) => {
        if (cancelled) return
        setAllStations(stations)
        setAllAccounts(accounts)
      })
      .catch((err) => {
        console.warn("[auth-proxy] load stations failed:", err)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Merge backend matches with all other stations so the user can pick any
  // site, even one whose host does not match the URL host. Matched stations
  // come first.
  const mergedMatches = useMemo<AuthProxyMatch[]>(() => {
    if (!parsedRequest) return []
    const matchedIds = new Set(parsedMatches.map((m) => m.stationId))
    const unmatched: AuthProxyMatch[] = allStations
      .filter((s) => !matchedIds.has(s.id))
      .map((s) => ({
        stationId: s.id,
        stationName: s.remark || s.website,
        website: s.website,
        accounts: allAccounts.filter((a) => a.stationId === s.id && a.proxyEnabled === true),
        confidence: "manual" as MatchConfidence,
      }))
    return [...parsedMatches, ...unmatched]
  }, [parsedRequest, parsedMatches, allStations, allAccounts])

  // Auto-select the only available station (covers the case where allStations
  // loads after handleParseUrl, e.g. 0 matched + 1 unmatched station).
  useEffect(() => {
    if (step === STEP_SELECT && mergedMatches.length === 1 && selectedStationIndex === null) {
      setSelectedStationIndex(0)
    }
  }, [step, mergedMatches, selectedStationIndex])

  const flatAccounts = useMemo(
    () => mergedMatches.flatMap((m) => m.accounts.map((a) => ({ account: a, match: m }))),
    [mergedMatches],
  )

  const selectedStation = selectedStationIndex !== null ? mergedMatches[selectedStationIndex] : null
  const selectedStationAccounts = selectedStation ? selectedStation.accounts : []

  const canGoNext =
    step === STEP_PASTE
      ? !!parsedRequest
      : step === STEP_SELECT
        ? (selectedAccountId !== null && selectedAccountId !== NEW_ACCOUNT) ||
          (selectedAccountId === NEW_ACCOUNT && newAccountName.trim().length > 0)
        : true

  const isNewAccount = selectedAccountId === NEW_ACCOUNT

  const handleParseUrl = async () => {
    const trimmed = url.trim()
    const isValid =
      trimmed.startsWith("bench-auth://") ||
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://")
    if (!isValid || parsing) return

    setParsing(true)
    try {
      const result = await accountManagerRepository.handleBrowserOpen(trimmed)
      setParsedRequest({
        target: result.target,
        returnUrl: result.returnUrl ?? "",
        state: null,
        site: result.host,
      })
      setParsedHost(result.host)
      setParsedMatches(result.matches)

      // Auto-select first station if only one
      if (result.matches.length === 1) {
        setSelectedStationIndex(0)
      } else {
        setSelectedStationIndex(null)
      }
      setSelectedAccountId(null)
      setNewAccountName("")

      setStep(STEP_SELECT)
    } catch (error) {
      console.warn("[auth-proxy] parse url failed:", error)
    } finally {
      setParsing(false)
    }
  }

  const handleConfirmLogin = async () => {
    if (!parsedRequest || confirming) return
    if (!selectedAccountId) return

    setConfirming(true)
    try {
      const ok = await onConfirm({
        request: parsedRequest,
        selectedAccountId,
        isNewAccount,
        targetHost: parsedHost,
        newAccountName: newAccountName.trim(),
      })
      if (ok) {
        onCompleted?.()
        onOpenChange(false)
      }
    } finally {
      setConfirming(false)
    }
  }

  const handleBack = () => {
    if (step > STEP_PASTE) setStep(step - 1)
  }

  const handleCloseReturnUrl = async () => {
    if (!parsedRequest) return
    try {
      await openExternal(parsedRequest.returnUrl)
    } catch (error) {
      console.warn("[auth-proxy] open return url failed:", error)
    }
  }

  // ═══════════════════════════════════════════════
  // Step content renderers
  // ═══════════════════════════════════════════════

  const renderStepIndicator = () => {
    const steps = [
      { num: STEP_PASTE, label: t("accountManager.authProxy.wizard.step1") },
      { num: STEP_SELECT, label: t("accountManager.authProxy.wizard.step2") },
      { num: STEP_CONFIRM, label: t("accountManager.authProxy.wizard.step3") },
    ]

    return (
      <div className="mb-4 flex items-center justify-center gap-1">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                step === s.num
                  ? "bg-primary text-primary-foreground"
                  : step > s.num
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full text-[10px]">
                {s.num}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < steps.length - 1 && <ArrowRight size={12} className="text-muted-foreground/40" />}
          </div>
        ))}
      </div>
    )
  }

  const renderStep1Paste = () => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          {t("accountManager.authProxy.wizard.step1UrlLabel")}
        </label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("accountManager.authProxy.wizard.urlPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleParseUrl()
          }}
          disabled={parsing}
          autoFocus
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {t("accountManager.authProxy.wizard.step1Hint")}
      </p>
    </div>
  )

  const renderStep2Select = () => {
    const stations = mergedMatches
    const hasExistingAccounts = selectedStationAccounts.length > 0
    const usingExisting = !isNewAccount && selectedAccountId !== null
    const hostForHint = parsedHost || safeHost(parsedRequest?.target ?? "")

    return (
      <div className="space-y-4">
        {/* Station selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            {t("accountManager.authProxy.wizard.stationLabel")}
          </label>
          {stations.length > 0 ? (
            <Select
              value={selectedStationIndex !== null ? String(selectedStationIndex) : undefined}
              onValueChange={(v) => {
                const idx = parseInt(v, 10)
                setSelectedStationIndex(idx)
                setSelectedAccountId(null)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("accountManager.authProxy.wizard.selectStation")} />
              </SelectTrigger>
              <SelectContent>
                {stations.map((m, i) => (
                  <SelectItem key={m.stationId} value={String(i)}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{m.stationName || m.website}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        ({m.accounts.length})
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("accountManager.authProxy.wizard.noStation")}
            </p>
          )}
        </div>

        {/* Account choice: two mutually-exclusive radio cards */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {t("accountManager.authProxy.wizard.accountLabel")}
          </label>

          {!selectedStation ? (
            <p className="text-muted-foreground text-sm">
              {t("accountManager.authProxy.wizard.selectStationFirst")}
            </p>
          ) : (
            <div className="space-y-2">
              {/* Option A: existing account */}
              <Button
                variant="outline"
                disabled={!hasExistingAccounts || confirming}
                onClick={() => {
                  if (!hasExistingAccounts) return
                  if (isNewAccount || selectedAccountId === null) {
                    setSelectedAccountId(selectedStationAccounts[0].id)
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm",
                  usingExisting
                    ? "border-primary bg-primary/5"
                    : "",
                  !hasExistingAccounts && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    usingExisting ? "border-primary" : "border-muted-foreground/30",
                  )}
                >
                  {usingExisting && <span className="bg-primary h-2 w-2 rounded-full" />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium">
                    {t("accountManager.authProxy.wizard.useExistingAccount")}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {hasExistingAccounts
                      ? t("accountManager.authProxy.wizard.useExistingHint", {
                          count: selectedStationAccounts.length,
                        })
                      : t("accountManager.authProxy.wizard.noAccount")}
                  </span>
                </div>
              </Button>

              {/* Account dropdown — only shown when option A is selected */}
              {usingExisting && hasExistingAccounts && (
                <Select
                  value={selectedAccountId ?? undefined}
                  onValueChange={(v) => setSelectedAccountId(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("accountManager.authProxy.wizard.selectAccount")} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedStationAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{a.username}</span>
                          <Badge
                            variant="secondary"
                            className={cn("ml-auto shrink-0", statusBadgeClass(a.status))}
                          >
                            {statusLabel(a.status, t)}
                          </Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Option B: new account */}
              <Button
                variant="outline"
                onClick={() => setSelectedAccountId(NEW_ACCOUNT)}
                disabled={confirming}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm",
                  isNewAccount
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/20 hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    isNewAccount ? "border-primary" : "border-muted-foreground/30",
                  )}
                >
                  {isNewAccount && <span className="bg-primary h-2 w-2 rounded-full" />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium">
                    {t("accountManager.authProxy.wizard.newAccount")}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t("accountManager.authProxy.wizard.newAccountHint", { host: hostForHint })}
                  </span>
                </div>
              </Button>

              {/* Name input — only shown when option B is selected */}
              {isNewAccount && (
                <Input
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder={t("accountManager.authProxy.newAccountNamePlaceholder")}
                  disabled={confirming}
                />
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderStep3Confirm = () => {
    const appProtocol = parsedRequest ? deriveExternalAppName(parsedRequest.returnUrl, t) : ""
    const selectedAccount = flatAccounts.find((fa) => fa.account.id === selectedAccountId)
    const acct = selectedAccount?.account

    return (
      <div className="space-y-3">
        {/* Target */}
        <div className="space-y-1">
          <span className="text-muted-foreground text-xs">
            {t("accountManager.authProxy.wizard.targetLabel")}
          </span>
          <p className="text-sm font-medium break-all">
            {parsedRequest ? safeHost(parsedRequest.target) : ""}
          </p>
        </div>

        {/* Return URL */}
        <div className="space-y-1">
          <span className="text-muted-foreground text-xs">
            {t("accountManager.authProxy.wizard.returnLabel")}
          </span>
          <p className="text-sm font-medium break-all">
            {parsedRequest ? `${appProtocol}://${safeTruncate(parsedRequest.returnUrl, 80)}` : ""}
          </p>
        </div>

        {/* Station */}
        <div className="space-y-1">
          <span className="text-muted-foreground text-xs">
            {t("accountManager.authProxy.wizard.stationLabel")}
          </span>
          <p className="text-sm font-medium">{selectedStation?.stationName || "-"}</p>
        </div>

        {/* Account */}
        <div className="space-y-1">
          <span className="text-muted-foreground text-xs">
            {t("accountManager.authProxy.wizard.accountLabel")}
          </span>
          <p className="flex items-center gap-2 text-sm font-medium">
            {acct
              ? acct.username
              : isNewAccount
                ? t("accountManager.authProxy.wizard.newAccount")
                : "-"}
            {acct && (
              <Badge variant="secondary" className={cn(statusBadgeClass(acct.status))}>
                {statusLabel(acct.status, t)}
              </Badge>
            )}
          </p>
        </div>

        {/* Proxy hint */}
        <p className="text-muted-foreground pt-2 text-xs break-words">
          {t("accountManager.authProxy.proxyHint")}
        </p>
      </div>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!parsing && !confirming) onOpenChange(next)
      }}
    >
      <DialogContent size="lg">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2">
            <KeyRound size={16} />
            {t("accountManager.authProxy.title")}
          </DialogTitle>
          {step === STEP_PASTE && (
            <DialogDescription>{t("accountManager.authProxy.wizard.step1Desc")}</DialogDescription>
          )}
          {step === STEP_SELECT && (
            <DialogDescription>{t("accountManager.authProxy.wizard.step2Desc")}</DialogDescription>
          )}
          {step === STEP_CONFIRM && (
            <DialogDescription>{t("accountManager.authProxy.wizard.step3Desc")}</DialogDescription>
          )}
        </DialogHeader>

        {renderStepIndicator()}

        <div className="min-w-0 space-y-4 overflow-hidden">
          {step === STEP_PASTE && renderStep1Paste()}
          {step === STEP_SELECT && renderStep2Select()}
          {step === STEP_CONFIRM && renderStep3Confirm()}
        </div>

        <DialogFooter className="gap-2">
          {step > STEP_PASTE && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
              disabled={parsing || confirming}
            >
              {t("accountManager.authProxy.back")}
            </Button>
          )}
          {step === STEP_PASTE && (
            <Button size="sm" onClick={handleParseUrl} disabled={!url.trim() || parsing}>
              {parsing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t("accountManager.authProxy.wizard.parsing")}
                </>
              ) : (
                t("accountManager.authProxy.wizard.next")
              )}
            </Button>
          )}
          {(step === STEP_SELECT || step === STEP_CONFIRM) && (
            <Button
              size="sm"
              onClick={step === STEP_SELECT ? () => setStep(STEP_CONFIRM) : handleConfirmLogin}
              disabled={!canGoNext || parsing || confirming}
            >
              {confirming ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t("accountManager.authProxy.starting")}
                </>
              ) : step === STEP_CONFIRM ? (
                t("accountManager.authProxy.wizard.startLogin")
              ) : (
                t("accountManager.authProxy.wizard.next")
              )}
            </Button>
          )}
          {step === STEP_CONFIRM && parsedRequest && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseReturnUrl}
              disabled={parsing || confirming}
            >
              <Link2 size={14} />
              {t("accountManager.authProxy.openReturnUrl")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
