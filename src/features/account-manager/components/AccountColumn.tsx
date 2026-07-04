/**
 * Account column / 账号栏: accounts of the selected station with reorder.
 */
import { useState, useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  ArrowDownAZ,
  ArrowUpZA,
  Check,
  ChevronRight,
  Copy,
  Filter,
  Inbox,
  Link2,
  LogIn,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { RelayStation, StationAccount } from "@/lib/tauri/types/account-manager"
import { SortableList, useSortableCard, DragHandle } from "@/components/ui/sortable-card"
import { ColumnHeader, EmptyHint, StatusBadge } from "@/features/account-manager/components/shared"

export function AccountColumn({
  station,
  accounts,
  selectedId,
  openingId,
  refreshingIds,
  refreshingStationIds,
  refreshingAll,
  justRefreshedIds,
  onSelect,
  onAdd,
  onLogin,
  onRefresh,
  onRefreshStation,
  onEdit,
  onDelete,
  onReorder,
  reorderDisabled,
}: {
  station: RelayStation | null
  accounts: StationAccount[]
  selectedId: string
  openingId: string | null
  refreshingIds: Set<string>
  refreshingStationIds: Set<string>
  refreshingAll: boolean
  justRefreshedIds: Set<string>
  onSelect: (id: string) => void
  onAdd: () => void
  onLogin: (account: StationAccount) => void
  onRefresh: (account: StationAccount) => void
  onRefreshStation: (stationId: string) => void
  onEdit: (account: StationAccount) => void
  onDelete: (account: StationAccount) => void
  onReorder: (orderedIds: string[]) => void
  reorderDisabled: boolean
}) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortMode, setSortMode] = useState<"manual" | "asc" | "desc">("manual")
  const [groupByStatus, setGroupByStatus] = useState(false)

  const filteredAccounts = useMemo(() => {
    let result = [...accounts]
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (a) => a.username.toLowerCase().includes(q) || a.notes.toLowerCase().includes(q),
      )
    }
    if (sortMode === "asc") {
      result.sort((a, b) => a.username.localeCompare(b.username))
    } else if (sortMode === "desc") {
      result.sort((a, b) => b.username.localeCompare(a.username))
    }
    return result
  }, [accounts, searchQuery, sortMode])

  const groupedAccounts = useMemo(() => {
    if (!groupByStatus) return null
    const groups: Record<StationAccount["status"], StationAccount[]> = {
      ready: [],
      loginRequired: [],
      expired: [],
      fetchFailed: [],
      inactive: [],
    }
    for (const acc of filteredAccounts) {
      groups[acc.status]?.push(acc)
    }
    return Object.entries(groups).filter(([, items]) => items.length > 0)
  }, [filteredAccounts, groupByStatus])

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (status: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const isFiltering = !!searchQuery.trim() || groupByStatus || sortMode !== "manual"

  const cycleSortMode = () => {
    setSortMode((mode) => (mode === "manual" ? "asc" : mode === "asc" ? "desc" : "manual"))
  }

  const stationRefreshing =
    refreshingAll || (station ? refreshingStationIds.has(station.id) : false)
  const renderCard = (account: StationAccount, dragging: boolean) => (
    <AccountCardContent
      account={account}
      selected={account.id === selectedId}
      opening={openingId === account.id}
      refreshing={stationRefreshing || refreshingIds.has(account.id)}
      justRefreshed={justRefreshedIds.has(account.id)}
      dragging={dragging}
      onSelect={onSelect}
      onLogin={onLogin}
      onRefresh={onRefresh}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  )
  return (
    <section className="bg-card flex min-w-0 flex-[1.1] flex-col rounded-lg border">
      <ColumnHeader
        title={`${t("accountManager.accountTitle")} (${accounts.length})`}
        action={
          <div className="flex items-center gap-1.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={() => station && onRefreshStation(station.id)}
                    disabled={!station || stationRefreshing || accounts.length === 0}
                    aria-label={t("accountManager.refreshStation")}
                  >
                    <RefreshCw className={stationRefreshing ? "animate-spin" : undefined} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("accountManager.refreshStation")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button size="sm" onClick={onAdd} disabled={!station}>
              <Plus />
              {t("accountManager.addAccount")}
            </Button>
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!station ? (
          <div className="p-3">
            <EmptyHint
              icon={<Inbox className="size-8 opacity-40" />}
              text={t("accountManager.pickStationFirst")}
            />
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-3">
            <EmptyHint
              icon={<UserRound className="size-8 opacity-40" />}
              text={t("accountManager.noAccount")}
              hint={t("accountManager.noAccountHint")}
            />
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="p-3">
            <EmptyHint
              icon={<Search className="size-8 opacity-40" />}
              text={t("accountManager.searchAccounts")}
            />
          </div>
        ) : groupedAccounts ? (
          <div className="space-y-4 p-3">
            {groupedAccounts.map(([status, items]) => (
              <div key={status}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroup(status)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      toggleGroup(status)
                    }
                  }}
                  className="bg-card sticky top-0 z-10 -mx-3 mb-2 flex items-center gap-2 border-b px-3 pt-1.5 pb-1.5 shadow-[0_1px_0_0] shadow-black/5 dark:shadow-white/5"
                >
                  <StatusBadge status={status as StationAccount["status"]} />
                  <span className="text-muted-foreground text-xs">({items.length})</span>
                  <ChevronRight
                    size={14}
                    className={cn(
                      "text-muted-foreground ml-auto transition-transform",
                      !collapsedGroups.has(status) && "rotate-90",
                    )}
                  />
                </div>
                {!collapsedGroups.has(status) && (
                  <div className="space-y-2">
                    {items.map((account) => (
                      <AccountCardContent
                        key={account.id}
                        account={account}
                        selected={account.id === selectedId}
                        opening={openingId === account.id}
                        refreshing={stationRefreshing || refreshingIds.has(account.id)}
                        justRefreshed={justRefreshedIds.has(account.id)}
                        dragging={false}
                        onSelect={onSelect}
                        onLogin={onLogin}
                        onRefresh={onRefresh}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3">
            <SortableList
              items={filteredAccounts}
              disabled={reorderDisabled || isFiltering || filteredAccounts.length < 2}
              onReorder={onReorder}
              activeId={activeId}
              onActiveIdChange={setActiveId}
              renderItem={(account) => (
                <SortableAccountItem
                  key={account.id}
                  account={account}
                  disabled={reorderDisabled || isFiltering || filteredAccounts.length < 2}
                  render={renderCard}
                />
              )}
              renderOverlay={(account) => (
                <div className="bg-card rounded-lg border shadow-xl">
                  {renderCard(account, true)}
                </div>
              )}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 border-t px-3 py-3">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("accountManager.searchAccounts")}
            disabled={!station || accounts.length === 0}
            className="h-7 pr-7 pl-7 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant={sortMode !== "manual" ? "secondary" : "outline"}
                onClick={cycleSortMode}
                disabled={!station || accounts.length === 0}
                aria-label={t("accountManager.sortByUsername")}
              >
                {sortMode === "desc" ? <ArrowUpZA size={14} /> : <ArrowDownAZ size={14} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("accountManager.sortByUsername")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant={groupByStatus ? "secondary" : "outline"}
                onClick={() => setGroupByStatus((v) => !v)}
                disabled={!station || accounts.length === 0}
                aria-label={t("accountManager.groupByStatus")}
              >
                <Filter size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("accountManager.groupByStatus")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </section>
  )
}

function SortableAccountItem({
  account,
  disabled,
  render,
}: {
  account: StationAccount
  disabled: boolean
  render: (account: StationAccount, dragging: boolean) => ReactNode
}) {
  const { t } = useTranslation()
  const { setNodeRef, style, handleProps, isDragging } = useSortableCard(account.id, disabled)
  return (
    <div ref={setNodeRef} style={style} className={cn("relative", isDragging && "z-10")}>
      <DragHandle
        label={t("accountManager.reorder.dragHandle")}
        disabled={disabled}
        handleProps={handleProps}
        className="absolute inset-y-0 left-0 z-10 w-4"
      />
      {render(account, false)}
    </div>
  )
}

function AccountCardContent({
  account,
  selected,
  opening,
  refreshing,
  justRefreshed,
  dragging,
  onSelect,
  onLogin,
  onRefresh,
  onEdit,
  onDelete,
}: {
  account: StationAccount
  selected: boolean
  opening: boolean
  refreshing: boolean
  justRefreshed: boolean
  dragging: boolean
  onSelect: (id: string) => void
  onLogin: (account: StationAccount) => void
  onRefresh: (account: StationAccount) => void
  onEdit: (account: StationAccount) => void
  onDelete: (account: StationAccount) => void
}) {
  const { t } = useTranslation()
  const [usernameCopied, setUsernameCopied] = useState(false)
  const handleCopyUsername = (event: React.MouseEvent) => {
    event.stopPropagation()
    navigator.clipboard
      .writeText(account.username)
      .then(() => {
        setUsernameCopied(true)
        toast.success(t("accountManager.toasts.copySuccess"))
        window.setTimeout(() => setUsernameCopied(false), 1200)
      })
      .catch(() => {
        toast.error(t("accountManager.toasts.copyFailed"))
      })
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(account.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSelect(account.id)
        }
      }}
      className={cn(
        "group relative w-full cursor-pointer overflow-hidden rounded-lg border px-4 py-4 text-left transition",
        selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-muted/40",
        dragging && "shadow-xl",
      )}
    >
      {justRefreshed && (
        <div className="animate-shimmer pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10" />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{account.username}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleCopyUsername}
                    className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={t("accountManager.detail.copy")}
                  >
                    {usernameCopied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("accountManager.detail.copy")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {!!account.proxyEnabled && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default">
                      <Link2 size={13} className="text-muted-foreground/60 shrink-0" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {t("accountManager.detail.proxySectionTitle")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
            {account.notes || t("accountManager.notesEmpty")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={(event) => {
                event.stopPropagation()
                onLogin(account)
              }}
              disabled={opening}
            >
              <LogIn />
              {opening ? t("accountManager.opening") : t("accountManager.card.login")}
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <StatusBadge status={account.status} />
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRefresh(account)
                  }}
                  disabled={refreshing}
                  aria-label={t("accountManager.refreshStatus")}
                  className="hover:bg-muted/50 cursor-pointer rounded-md"
                >
                  <RefreshCw className={refreshing ? "animate-spin" : undefined} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("accountManager.refreshStatus")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation()
                    onEdit(account)
                  }}
                  aria-label={t("accountManager.editAccount")}
                  className="hover:bg-muted/50 cursor-pointer rounded-md"
                >
                  <Pencil size={13} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("accountManager.editAccount")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(account)
                  }}
                  aria-label={t("accountManager.deleteAccount")}
                  className="hover:bg-muted/50 cursor-pointer rounded-md"
                >
                  <Trash2 size={13} className="text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("accountManager.deleteAccount")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  )
}
