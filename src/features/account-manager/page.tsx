/**
 * account-manager page / 账号管理页面: thin composition over useAccountManagerController.
 * 三栏布局(站点 / 账号 / 详情) + 各类对话框都是纯展示组件,状态与编排全在控制器 hook。
 */
import { useTranslation } from "react-i18next";
import { FeatureLoadError } from "@/components/common/FeatureLoadError";
import { openExternal } from "@/platform/shell";
import { useAccountManagerController } from "@/features/account-manager/hooks/useAccountManagerController";
import { StationColumn } from "@/features/account-manager/components/StationColumn";
import { AccountColumn } from "@/features/account-manager/components/AccountColumn";
import { DetailColumn } from "@/features/account-manager/components/DetailColumn";
import {
  AddAccountDialog,
  DeleteConfirmDialog,
  EditAccountDialog,
  ProxyPasteDialog,
  QuickLoginDialog,
  StationDialog,
} from "@/features/account-manager/components/dialogs";
import { AuthProxyDialog } from "@/features/account-manager/components/auth-proxy-dialog";
import { ExternalAppsPanel } from "@/features/account-manager/components/external-apps-panel";

function AccountManagerPage() {
  const { t } = useTranslation();
  const c = useAccountManagerController();

  if (c.loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (c.loadError) {
    return (
      <FeatureLoadError
        title={t("accountManager.loadFailedTitle")}
        description={c.loadError}
        onRetry={() => void c.loadInitialData().catch(() => undefined)}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-4">
      <StationColumn
        stations={c.stations}
        selectedId={c.selectedStationId}
        countByStation={c.accountCountByStation}
        onSelect={c.handleSelectStation}
        onAdd={() => c.setAddStationOpen(true)}
        onQuickLogin={() => c.setQuickLoginOpen(true)}
        onExternalLogin={() => c.setProxyPasteOpen(true)}
        onEdit={(station) => { c.setEditingStation(station); c.setEditStationOpen(true); }}
        onDelete={(station) => { c.setDeletingStation(station); c.setDeleteStationOpen(true); }}
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
        onSelect={c.setSelectedAccountId}
        onAdd={() => c.setAddAccountOpen(true)}
        onLogin={c.handleLogin}
        onRefresh={c.handleRefreshAccount}
        onRefreshStation={c.handleRefreshStation}
        onEdit={(account) => { c.setEditingAccount(account); c.setEditAccountOpen(true); }}
        onDelete={(account) => { c.setDeletingAccount(account); c.setDeleteAccountOpen(true); }}
        onReorder={(ids) => void c.handleReorderAccounts(ids)}
        reorderDisabled={c.reorderingAccounts}
      />

      <DetailColumn
        station={c.selectedStation}
        account={c.selectedAccount}
        onOpenWebsite={() => c.selectedStation && void openExternal(c.selectedStation.website)}
        onRedetectProfile={c.handleRedetectProfile}
        onToggleProxy={c.handleToggleProxy}
        onManageExternalApps={c.handleOpenExternalApps}
        onRevealPassword={c.handleRevealPassword}
        onCopyPassword={c.handleCopyPassword}
        onProbeStrategyChange={c.handleProbeStrategyChange}
        settingProbeStrategy={
          c.selectedStation
            ? c.settingProbeStrategyIds.has(c.selectedStation.id)
            : false
        }
        redetectingProfile={
          c.selectedStation ? c.redetectingStationIds.has(c.selectedStation.id) : false
        }
        togglingProxy={
          c.selectedAccount ? c.togglingProxyIds.has(c.selectedAccount.id) : false
        }
      />

      <StationDialog
        open={c.isAddStationOpen || c.isEditStationOpen}
        station={c.editingStation}
        onOpenChange={(open) => {
          if (!open) {
            c.setAddStationOpen(false);
            c.setEditStationOpen(false);
            c.setEditingStation(null);
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
          c.setEditAccountOpen(open);
          if (!open) c.setEditingAccount(null);
        }}
        onSubmit={c.handleEditAccount}
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
        description={c.deletingStation ? t("accountManager.deleteStationDesc", { name: c.deletingStation.remark }) : ""}
        onOpenChange={c.setDeleteStationOpen}
        onConfirm={c.handleDeleteStation}
      />
      <DeleteConfirmDialog
        open={c.isDeleteAccountOpen}
        title={t("accountManager.deleteAccountTitle")}
        description={c.deletingAccount ? t("accountManager.deleteAccountDesc", { name: c.deletingAccount.username }) : ""}
        onOpenChange={c.setDeleteAccountOpen}
        onConfirm={c.handleDeleteAccount}
      />

      <ExternalAppsPanel
        open={c.isExternalAppsOpen}
        onOpenChange={c.setExternalAppsOpen}
        accountId={c.externalAppsAccountId}
        accounts={c.accounts}
      />

      <ProxyPasteDialog
        open={c.isProxyPasteOpen}
        onOpenChange={c.setProxyPasteOpen}
        onSubmit={async (url) => {
          const ok = await c.openProxyForUrl(url);
          if (ok) c.setProxyPasteOpen(false);
          return ok;
        }}
      />

      <AuthProxyDialog
        open={c.isAuthProxyOpen}
        request={c.authProxyRequest}
        matches={c.authProxyMatches}
        host={c.authProxyHost}
        onOpenChange={c.setAuthProxyOpen}
        onConfirm={c.confirmAuthProxy}
        onCompleted={() => void c.loadInitialData().catch(() => undefined)}
      />
    </div>
  );
}

export default AccountManagerPage;
