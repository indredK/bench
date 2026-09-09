/**
 * Quick login dialog / 快速登录对话框. (拆分自 dialogs.tsx — A1-3)
 * Session Keeper 增强:URL 输入防抖匹配站点分组(exact/同域),
 * 可选择已有账号在其隔离环境打开该 URL,或新建临时账号.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Globe, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Field, StatusBadge } from "@/features/account-manager/components/shared"
import type { AccountSessionStatus, StationUrlMatch } from "@/lib/tauri/types/account-manager"
import type { QuickLoginSubmission } from "@/features/account-manager/hooks/useAccountActions"

const STATION_NEW = "__new_station__"
const ACCOUNT_NEW = "__new_account__"
const MATCH_DEBOUNCE_MS = 300

export function QuickLoginDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultStationId,
  history,
  onMatchStations,
  getStationAccounts,
  submitting,
  initialUrl = "",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (submission: QuickLoginSubmission) => void | Promise<void>
  defaultStationId?: string | null
  history?: string[]
  /** URL → 站点匹配(controller 注入;组件不直接 invoke)。 */
  onMatchStations: (url: string) => Promise<StationUrlMatch[]>
  /** 站点 → 账号列表(controller 从 store 过滤注入)。 */
  getStationAccounts: (stationId: string) => {
    id: string
    username: string
    status: AccountSessionStatus
  }[]
  submitting?: boolean
  /** 打开时预填的 URL(从外部登录引导转发,见 F1)。 */
  initialUrl?: string
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState("")
  const [username, setUsername] = useState("")
  const [destroyOnClose, setDestroyOnClose] = useState(false)
  const [matches, setMatches] = useState<StationUrlMatch[]>([])
  const [matching, setMatching] = useState(false)
  const [stationChoice, setStationChoice] = useState<string>(STATION_NEW)
  const [accountChoice, setAccountChoice] = useState<string>(ACCOUNT_NEW)
  const matchSeqRef = useRef(0)

  useEffect(() => {
    if (!open) {
      setUrl("")
      setUsername("")
      setDestroyOnClose(false)
      setMatches([])
      setMatching(false)
      setStationChoice(STATION_NEW)
      setAccountChoice(ACCOUNT_NEW)
      matchSeqRef.current += 1
    } else if (initialUrl.trim()) {
      setUrl(initialUrl.trim())
    }
  }, [open, initialUrl])

  // URL 变化 → 防抖匹配站点;新匹配集到达时预选最高置信度(列表首位)。
  useEffect(() => {
    const trimmed = url.trim()
    if (!open || !trimmed) {
      matchSeqRef.current += 1
      setMatches([])
      setMatching(false)
      return
    }
    setMatching(true)
    const seq = ++matchSeqRef.current
    const timer = window.setTimeout(async () => {
      try {
        const result = await onMatchStations(trimmed)
        if (seq !== matchSeqRef.current) return
        setMatches(result)
        if (result.length > 0) {
          setStationChoice(result[0].stationId)
          setAccountChoice(ACCOUNT_NEW)
        } else {
          setStationChoice(STATION_NEW)
        }
      } catch {
        if (seq !== matchSeqRef.current) return
        setMatches([])
        setStationChoice(STATION_NEW)
      } finally {
        if (seq === matchSeqRef.current) setMatching(false)
      }
    }, MATCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [url, open, onMatchStations])

  const stationAccounts = useMemo(
    () => (stationChoice === STATION_NEW ? [] : getStationAccounts(stationChoice)),
    [stationChoice, getStationAccounts],
  )
  const selectedAccount =
    accountChoice !== ACCOUNT_NEW
      ? stationAccounts.find((account) => account.id === accountChoice)
      : undefined

  const canSubmit =
    url.trim().length > 0 &&
    !submitting &&
    (selectedAccount
      ? true
      : stationChoice === STATION_NEW
        ? username.trim().length > 0
        : accountChoice === ACCOUNT_NEW
          ? username.trim().length > 0
          : true)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (selectedAccount) {
      void Promise.resolve(onSubmit({ kind: "existing", url, accountId: selectedAccount.id }))
      return
    }
    const stationId = stationChoice === STATION_NEW ? (defaultStationId ?? null) : stationChoice
    void Promise.resolve(
      onSubmit({
        kind: "new",
        url,
        username,
        destroyOnClose,
        stationId,
      }),
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("accountManager.sessionManager.quickLogin.title")}</DialogTitle>
          <DialogDescription>
            {t("accountManager.sessionManager.quickLogin.description")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            label={t("accountManager.sessionManager.quickLogin.urlLabel")}
            icon={<Globe size={14} />}
            input={
              <div className="space-y-1">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t("accountManager.addStationDialog.websitePlaceholder")}
                  required
                  list="quick-login-history"
                />
                {history && history.length > 0 && (
                  <>
                    <p className="text-muted-foreground text-xs">
                      {t("accountManager.sessionManager.quickLogin.historyDatalist")}
                    </p>
                    <datalist id="quick-login-history">
                      {history.map((h) => (
                        <option key={h} value={h} />
                      ))}
                    </datalist>
                  </>
                )}
                {matching && (
                  <p className="text-muted-foreground text-xs">
                    {t("accountManager.sessionManager.quickLogin.matching")}
                  </p>
                )}
                {!matching && matches.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {t("accountManager.sessionManager.quickLogin.matchedStations", {
                      count: matches.length,
                    })}
                  </p>
                )}
              </div>
            }
          />
          {matches.length > 0 && (
            <Field
              label={t("accountManager.sessionManager.quickLogin.stationLabel")}
              input={
                <Select
                  value={stationChoice}
                  onValueChange={(value) => {
                    setStationChoice(value)
                    setAccountChoice(ACCOUNT_NEW)
                  }}
                >
                  <SelectTrigger
                    aria-label={t("accountManager.sessionManager.quickLogin.stationLabel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {matches.map((match) => (
                      <SelectItem key={match.stationId} value={match.stationId}>
                        {match.remark || match.website}
                        {match.accountCount > 0
                          ? t("accountManager.sessionManager.quickLogin.accountCountSuffix", {
                              count: match.accountCount,
                            })
                          : ""}
                        {match.confidence === "exact"
                          ? t("accountManager.sessionManager.quickLogin.exactMatchSuffix")
                          : ""}
                      </SelectItem>
                    ))}
                    <SelectItem value={STATION_NEW}>
                      {t("accountManager.sessionManager.quickLogin.newStationOption")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          )}
          {stationChoice !== STATION_NEW && stationAccounts.length > 0 && (
            <Field
              label={t("accountManager.sessionManager.quickLogin.accountLabel")}
              input={
                <Select value={accountChoice} onValueChange={(value) => setAccountChoice(value)}>
                  <SelectTrigger
                    aria-label={t("accountManager.sessionManager.quickLogin.accountLabel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stationAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.username}
                      </SelectItem>
                    ))}
                    <SelectItem value={ACCOUNT_NEW}>
                      {t("accountManager.sessionManager.quickLogin.newAccountOption")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          )}
          {selectedAccount ? (
            <div className="bg-muted/30 flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <UserRound size={14} className="text-muted-foreground shrink-0" />
                <span className="truncate text-sm font-medium">{selectedAccount.username}</span>
              </span>
              <StatusBadge status={selectedAccount.status} />
            </div>
          ) : (
            <>
              <Field
                label={t("accountManager.sessionManager.quickLogin.usernameLabel")}
                icon={<UserRound size={14} />}
                input={
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("accountManager.addAccountDialog.usernamePlaceholder")}
                    required
                  />
                }
              />
              {stationChoice === STATION_NEW && defaultStationId && (
                <p className="text-muted-foreground text-xs">
                  {t("accountManager.sessionManager.quickLogin.attachToStation")}
                </p>
              )}
              <label className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={destroyOnClose}
                  onChange={(e) => setDestroyOnClose(e.target.checked)}
                  className="size-3.5 accent-blue-500"
                />
                {t("accountManager.sessionManager.quickLogin.destroyOnClose")}
              </label>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("accountManager.sessionManager.quickLogin.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {t("accountManager.sessionManager.quickLogin.openButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
