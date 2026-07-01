/**
 * Account column / 账号栏: accounts of the selected station with reorder.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Inbox, Link2, LogIn, Pencil, Plus, RefreshCw, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RelayStation, StationAccount } from "@/lib/tauri/types/account-manager";
import { SortableList, useSortableCard, DragHandle } from "@/components/ui/sortable-card";
import { ColumnHeader, EmptyHint, StatusBadge } from "@/features/account-manager/components/shared";

export function AccountColumn({
  station,
  accounts,
  selectedId,
  openingId,
  refreshingIds,
  refreshingStationIds,
  refreshingAll,
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
  station: RelayStation | null;
  accounts: StationAccount[];
  selectedId: string;
  openingId: string | null;
  refreshingIds: Set<string>;
  refreshingStationIds: Set<string>;
  refreshingAll: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onLogin: (account: StationAccount) => void;
  onRefresh: (account: StationAccount) => void;
  onRefreshStation: (stationId: string) => void;
  onEdit: (account: StationAccount) => void;
  onDelete: (account: StationAccount) => void;
  onReorder: (orderedIds: string[]) => void;
  reorderDisabled: boolean;
}) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | null>(null);
  const stationRefreshing =
    refreshingAll || (station ? refreshingStationIds.has(station.id) : false);
  const renderCard = (account: StationAccount, dragging: boolean) => (
    <AccountCardContent
      account={account}
      selected={account.id === selectedId}
      opening={openingId === account.id}
      refreshing={stationRefreshing || refreshingIds.has(account.id)}
      dragging={dragging}
      onSelect={onSelect}
      onLogin={onLogin}
      onRefresh={onRefresh}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
  return (
    <section className="flex min-w-0 flex-[1.1] flex-col rounded-lg border bg-card">
      <ColumnHeader
        title={`${t("accountManager.accountTitle")} (${accounts.length})`}
        action={
          <div className="flex items-center gap-1.5">
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => station && onRefreshStation(station.id)}
              disabled={!station || stationRefreshing || accounts.length === 0}
              aria-label={t("accountManager.refreshStation")}
              title={t("accountManager.refreshStation")}
            >
              <RefreshCw className={stationRefreshing ? "animate-spin" : undefined} />
            </Button>
            <Button size="sm" onClick={onAdd} disabled={!station}>
              <Plus />
              {t("accountManager.addAccount")}
            </Button>
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!station ? (
          <EmptyHint
            icon={<Inbox className="size-8 opacity-40" />}
            text={t("accountManager.pickStationFirst")}
          />
        ) : accounts.length === 0 ? (
          <EmptyHint
            icon={<UserRound className="size-8 opacity-40" />}
            text={t("accountManager.noAccount")}
            hint={t("accountManager.noAccountHint")}
          />
        ) : (
          <SortableList
            items={accounts}
            disabled={reorderDisabled || accounts.length < 2}
            onReorder={onReorder}
            activeId={activeId}
            onActiveIdChange={setActiveId}
            renderItem={(account) => (
              <SortableAccountItem
                key={account.id}
                account={account}
                disabled={reorderDisabled || accounts.length < 2}
                render={renderCard}
              />
            )}
            renderOverlay={(account) => (
              <div className="rounded-lg border bg-card shadow-xl">{renderCard(account, true)}</div>
            )}
          />
        )}
      </div>
    </section>
  );
}

function SortableAccountItem({
  account,
  disabled,
  render,
}: {
  account: StationAccount;
  disabled: boolean;
  render: (account: StationAccount, dragging: boolean) => ReactNode;
}) {
  const { t } = useTranslation();
  const { setNodeRef, style, handleProps, isDragging } = useSortableCard(account.id, disabled);
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
  );
}

function AccountCardContent({
  account,
  selected,
  opening,
  refreshing,
  dragging,
  onSelect,
  onLogin,
  onRefresh,
  onEdit,
  onDelete,
}: {
  account: StationAccount;
  selected: boolean;
  opening: boolean;
  refreshing: boolean;
  dragging: boolean;
  onSelect: (id: string) => void;
  onLogin: (account: StationAccount) => void;
  onRefresh: (account: StationAccount) => void;
  onEdit: (account: StationAccount) => void;
  onDelete: (account: StationAccount) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(account.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(account.id);
        }
      }}
      className={cn(
        "w-full cursor-pointer rounded-lg border px-4 py-4 text-left transition",
        selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-muted/40",
        dragging && "shadow-xl"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{account.username}</span>
            {!!account.proxyEnabled && (
              <span title={t("accountManager.detail.proxySectionTitle")}>
                <Link2 size={13} className="shrink-0 text-muted-foreground/60" />
              </span>
            )}
            <StatusBadge status={account.status} />
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {account.notes || t("accountManager.notesEmpty")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onLogin(account);
              }}
              disabled={opening}
            >
              <LogIn />
              {opening ? t("accountManager.opening") : t("accountManager.card.login")}
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                onRefresh(account);
              }}
              disabled={refreshing}
              aria-label={t("accountManager.refreshStatus")}
              title={t("accountManager.refreshStatus")}
            >
              <RefreshCw className={refreshing ? "animate-spin" : undefined} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(account);
              }}
              aria-label={t("accountManager.editAccount")}
              title={t("accountManager.editAccount")}
            >
              <Pencil size={13} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(account);
              }}
              aria-label={t("accountManager.deleteAccount")}
              title={t("accountManager.deleteAccount")}
            >
              <Trash2 size={13} className="text-destructive" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
