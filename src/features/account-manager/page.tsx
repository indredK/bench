/**
 * account-manager page / 账号管理页面: thin composition over useAccountManagerController.
 * 三栏布局(站点 / 账号 / 详情) + 各类对话框都是纯展示组件,状态与编排全在控制器 hook。
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { FeatureLoadError } from "@/components/common/FeatureLoadError"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { openExternal } from "@/platform/shell"
import { useAccountManagerController } from "@/features/account-manager/hooks/useAccountManagerController"
import { StationColumn } from "@/features/account-manager/components/StationColumn"
import { AccountColumn } from "@/features/account-manager/components/AccountColumn"
import { DetailColumn } from "@/features/account-manager/components/DetailColumn"
import {
  AddAccountDialog,
  DeleteConfirmDialog,
  EditAccountDialog,
  QuickLoginDialog,
  StationDialog,
} from "@/features/account-manager/components/dialogs"
import { AuthProxyDialog } from "@/features/account-manager/components/auth-proxy-dialog"
import { ExternalAppsPanel } from "@/features/account-manager/components/external-apps-panel"
import { cn } from "@/lib/utils"

function SkeletonLine({ className }: { className: string }) {
  return <div className={cn("bg-muted rounded motion-safe:animate-pulse", className)} />
}

function SkeletonColumn({
  widthClass,
  rows,
  hiddenOnNarrow = false,
}: {
  widthClass: string
  rows: number
  hiddenOnNarrow?: boolean
}) {
  return (
    <section
      className={cn(
        "bg-card min-w-0 shrink-0 flex-col rounded-lg border",
        hiddenOnNarrow ? "hidden xl:flex" : "flex",
        widthClass,
      )}
      data-skeleton-column
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <SkeletonLine className="h-4 w-24" />
        <SkeletonLine className="h-8 w-20" />
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="space-y-2 rounded-md border p-3">
            <SkeletonLine className="h-3.5 w-2/3" />
            <SkeletonLine className="h-3 w-full" />
            <SkeletonLine className="h-3 w-1/2" />
          </div>
        ))}
      </div>
      <div className="flex h-14 shrink-0 items-center gap-2 border-t px-3">
        <SkeletonLine className="h-8 flex-1" />
        <SkeletonLine className="size-8" />
      </div>
    </section>
  )
}

export function AccountManagerLoadingSkeleton() {
  const { t } = useTranslation()

  return (
    <div className="flex h-full min-h-0 gap-4" aria-busy="true" aria-label={t("common.loading")}>
      <SkeletonColumn widthClass="w-[320px]" rows={5} />
      <div className="min-w-0 flex-[1.1]">
        <SkeletonColumn widthClass="h-full w-full" rows={6} />
      </div>
      <SkeletonColumn widthClass="w-[340px]" rows={4} hiddenOnNarrow />
    </div>
  )
}

function AccountManagerPage() {
  const { t } = useTranslation()
  const c = useAccountManagerController()
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)

  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 1280px)")
    if (!media) return
    const handleChange = () => {
      if (media.matches) setDetailSheetOpen(false)
    }
    media.addEventListener?.("change", handleChange)
    return () => media.removeEventListener?.("change", handleChange)
  }, [])

  const handleSelectAccount = (accountId: string) => {
    c.setSelectedAccountId(accountId)
    if (window.matchMedia?.("(max-width: 1279px)").matches) {
      setDetailSheetOpen(true)
    }
  }

  const renderDetailColumn = (className?: string) => (
    <DetailColumn
      className={className}
      station={c.selectedStation}
      account={c.selectedAccount}
      onOpenWebsite={() => c.selectedStation && void openExternal(c.selectedStation.website)}
      onRedetectProfile={c.handleRedetectProfile}
      onToggleProxy={c.handleToggleProxy}
      onManageExternalApps={c.handleOpenExternalApps}
      onRevealPassword={c.handleRevealPassword}
      onCopyPassword={c.handleCopyPassword}
      onProbeStrategyChange={c.handleProbeStrategyChange}
      onRefreshAccount={c.handleRefreshAccount}
      refreshingAccount={
        c.selectedAccount ? c.refreshingAccountIds.has(c.selectedAccount.id) : false
      }
      settingProbeStrategy={
        c.selectedStation ? c.settingProbeStrategyIds.has(c.selectedStation.id) : false
      }
      redetectingProfile={
        c.selectedStation ? c.redetectingStationIds.has(c.selectedStation.id) : false
      }
      togglingProxy={c.selectedAccount ? c.togglingProxyIds.has(c.selectedAccount.id) : false}
    />
  )

  if (c.loading) {
    return <AccountManagerLoadingSkeleton />
  }

  if (c.loadError) {
    return (
      <FeatureLoadError
        title={t("accountManager.loadFailedTitle")}
        description={c.loadError}
        onRetry={() => void c.loadInitialData().catch(() => undefined)}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 gap-4">
      <StationColumn
        stations={c.stations}
        selectedId={c.selectedStationId}
        countByStation={c.accountCountByStation}
        onSelect={(stationId) => {
          setDetailSheetOpen(false)
          c.handleSelectStation(stationId)
        }}
        onAdd={() => c.setAddStationOpen(true)}
        onQuickLogin={() => c.setQuickLoginOpen(true)}
        onExternalLogin={() => c.setAuthProxyOpen(true)}
        onEdit={(station) => {
          c.setEditingStation(station)
          c.setEditStationOpen(true)
        }}
        onDelete={(station) => {
          c.setDeletingStation(station)
          c.setDeleteStationOpen(true)
        }}
        onReorder={(ids) => void c.handleReorderStations(ids)}
        reorderDisabled={c.reorderingStations}
        onRefreshAll={c.handleRefreshAll}
        refreshingAll={c.refreshingAll}
        onImportData={() => void c.handleImportData()}
        onExportData={() => void c.handleExportData()}
        importingData={c.importingData}
        exportingData={c.exportingData}
      />

      <AccountColumn
        station={c.selectedStation}
        accounts={c.stationAccounts}
        selectedId={c.selectedAccount?.id ?? ""}
        openingId={c.openingAccountId}
        refreshingIds={c.refreshingAccountIds}
        refreshingStationIds={c.refreshingStationIds}
        refreshingAll={c.refreshingAll}
        justRefreshedIds={c.justRefreshedIds}
        onSelect={handleSelectAccount}
        onAdd={() => c.setAddAccountOpen(true)}
        onLogin={c.handleLogin}
        onRefresh={c.handleRefreshAccount}
        onRefreshStation={c.handleRefreshStation}
        onEdit={(account) => {
          c.setEditingAccount(account)
          c.setEditAccountOpen(true)
        }}
        onDelete={(account) => {
          c.setDeletingAccount(account)
          c.setDeleteAccountOpen(true)
        }}
        onReorder={(ids) => void c.handleReorderAccounts(ids)}
        reorderDisabled={c.reorderingAccounts}
      />

      {renderDetailColumn()}

      <Sheet open={detailSheetOpen && Boolean(c.selectedAccount)} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="p-0 xl:hidden">
          <SheetTitle className="sr-only">{t("accountManager.detailTitle")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("accountManager.detailSheetDescription")}
          </SheetDescription>
          {renderDetailColumn("flex h-full w-full rounded-none border-0")}
        </SheetContent>
      </Sheet>

      <StationDialog
        open={c.isAddStationOpen || c.isEditStationOpen}
        station={c.editingStation}
        onOpenChange={(open) => {
          if (!open) {
            c.setAddStationOpen(false)
            c.setEditStationOpen(false)
            c.setEditingStation(null)
          }
        }}
        onSubmit={c.editingStation ? c.handleEditStation : c.handleAddStation}
      />

      <AddAccountDialog
        open={c.isAddAccountOpen}
        onOpenChange={c.setAddAccountOpen}
        stationName={c.selectedStation?.remark ?? ""}
        onSubmit={c.handleAddAccount}
      />

      <EditAccountDialog
        open={c.isEditAccountOpen}
        account={c.editingAccount}
        stationName={c.selectedStation?.remark ?? ""}
        onOpenChange={(open) => {
          c.setEditAccountOpen(open)
          if (!open) c.setEditingAccount(null)
        }}
        onSubmit={c.handleEditAccount}
        onRevealPassword={c.handleRevealPassword}
      />

      <QuickLoginDialog
        open={c.isQuickLoginOpen}
        onOpenChange={c.setQuickLoginOpen}
        onSubmit={c.handleQuickLogin}
        defaultStationId={c.selectedStation?.id ?? null}
        history={c.readQuickLoginHistory()}
      />
      <DeleteConfirmDialog
        open={c.isDeleteStationOpen}
        title={t("accountManager.deleteStationTitle")}
        description={
          c.deletingStation
            ? t("accountManager.deleteStationDesc", { name: c.deletingStation.remark })
            : ""
        }
        onOpenChange={c.setDeleteStationOpen}
        onConfirm={c.handleDeleteStation}
      />
      <DeleteConfirmDialog
        open={c.isDeleteAccountOpen}
        title={t("accountManager.deleteAccountTitle")}
        description={
          c.deletingAccount
            ? t("accountManager.deleteAccountDesc", { name: c.deletingAccount.username })
            : ""
        }
        onOpenChange={c.setDeleteAccountOpen}
        onConfirm={c.handleDeleteAccount}
      />

      <ExternalAppsPanel
        open={c.isExternalAppsOpen}
        onOpenChange={c.setExternalAppsOpen}
        accountId={c.externalAppsAccountId}
        accounts={c.accounts}
      />

      <AuthProxyDialog
        open={c.isAuthProxyOpen}
        onOpenChange={c.setAuthProxyOpen}
        onConfirm={c.confirmAuthProxy}
        onCompleted={() => void c.loadInitialData().catch(() => undefined)}
        initialRequest={c.authProxyRequest}
        initialMatches={c.authProxyMatches}
        initialHost={c.authProxyHost}
      />
    </div>
  )
}

export default AccountManagerPage
