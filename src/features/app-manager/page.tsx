/**
 * Page View / 页面视图: compose screen only; 只组合页面.
 */
import { AppWindow, ArrowUpCircle, CheckSquare, Download, Filter, Search, Trash2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DetailPanel } from "@/components/layout/DetailPanel";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import { ContentView } from "@/components/content/ContentView";
import { RuntimeFeatureGate } from "@/components/common/RuntimeFeatureGate";
import { AppDetail, InstallDetail } from "@/features/app-manager/components/AppManagerDetails";
import { AppManagerActionBar } from "@/features/app-manager/components/AppManagerActionBar";
import { AppManagerBatchResults } from "@/features/app-manager/components/AppManagerBatchResults";
import { AppManagerConfirmDialogs } from "@/features/app-manager/components/AppManagerConfirmDialogs";
import { AppManagerErrorBoundary } from "@/features/app-manager/components/AppManagerErrorBoundary";
import { AppManagerFilterSidebar } from "@/features/app-manager/components/AppManagerFilterSidebar";
import { AppManagerGridCard } from "@/features/app-manager/components/AppManagerGridCard";
import { AppManagerHistoryDrawer } from "@/features/app-manager/components/AppManagerHistoryDrawer";
import { AppManagerTabs } from "@/features/app-manager/components/AppManagerTabs";
import { InstallListCard } from "@/features/app-manager/components/InstallListCard";
import { SoftwareUpdateView } from "@/features/app-manager/components/SoftwareUpdateView";
import { useAppManagerController } from "@/features/app-manager/hooks/useAppManagerController";
import type { AppInfo, InstallListAppInfo } from "@/lib/tauri/types/app-manager";

function AppManager({ active, feature }: { active: boolean; feature?: { desktopOnly?: boolean } }) {
  const controller = useAppManagerController(active);
  const {
    t,
    apps,
    loading,
    error,
    searchQuery,
    activeFilter,
    categoryFilter,
    seriesFilter,
    sorting,
    scanned,
    result,
    history,
    confirmDialog,
    historyOpen,
    lastScanTime,
    lastUpdateCheck,
    viewMode,
    selectedItem,
    filterPanelOpen,
    selectedAppIds,
    batchMode,
    batchResults,
    batchConfirmDialog,
    installListApps,
    installStates,
    installConfirmDialog,
    selectedInstallIds,
    installBatchMode,
    installDetailItem,
    activeTab,
    updates,
    updatesLoading,
    updatesError,
    updatesScanned,
    expandedUpdateGroups,
    selectedUpdateIds,
    updateSourceFilter,
    selectedUpdate,
    updateOperations,
    filteredApps,
    activeFilterCount,
    visibleInstallListApps,
    visibleInstallListInstalledCount,
    visibleInstallListPendingCount,
    caps,
    appManagerColumns,
    installListColumns,
    setSearchQuery,
    setActiveFilter,
    setCategoryFilter,
    setSeriesFilter,
    setSorting,
    scanApps,
    setHistoryOpen,
    clearSelection,
    toggleSelectApp,
    closeBatchConfirmDialog,
    clearBatchResults,
    setViewMode,
    setSelectedItem,
    setFilterPanelOpen,
    closeInstallConfirmDialog,
    openExternal,
    copyText,
    handleLaunch,
    handleReveal,
    handleInstall,
    toggleInstallSelect,
    clearInstallSelection,
    handleBatchInstall,
    handleInstallConfirm,
    getRowAttributes,
    handleConfirmAction,
    handleToggleBatchMode,
    selectedUpgradable,
    selectedUninstallable,
    handleBatchUpgrade,
    handleBatchUninstall,
    handleBatchConfirm,
    handleDetailUpgrade,
    handleDetailUninstall,
    setInstallBatchMode,
    setInstallDetailItem,
    checkAllUpdates,
    handleUpdateAction,
    handleUpdateAllVisible,
    handleSetActiveTab,
    toggleUpdateGroup,
    toggleSelectUpdate,
    selectAllUpdates,
    clearUpdateSelection,
    setUpdateSourceFilter,
    setSelectedUpdate,
  } = controller;

  return (
    <AppManagerErrorBoundary>
      <RuntimeFeatureGate
        feature={feature}
        title={t("appManager.title")}
        icon={<AppWindow size={32} className="opacity-40" />}
      >
        <div className="h-full flex flex-col gap-3">
          <AppManagerTabs
            t={t}
            activeTab={activeTab}
            onChange={handleSetActiveTab}
            updateCount={updates.length}
          />

          {activeTab === "softwareUpdate" ? (
            <SoftwareUpdateView
              t={t}
              apps={apps}
              updates={updates}
              loading={updatesLoading}
              scanned={updatesScanned}
              error={updatesError}
              lastUpdateCheck={lastUpdateCheck}
              selectedIds={selectedUpdateIds}
              selectedUpdate={selectedUpdate}
              sourceFilter={updateSourceFilter}
              expandedGroups={expandedUpdateGroups}
              updateOperations={updateOperations}
              onRecheck={() => void checkAllUpdates(true)}
              onToggleGroup={toggleUpdateGroup}
              onToggleSelect={toggleSelectUpdate}
              onSelectAll={(ids) => selectAllUpdates(ids)}
              onClearSelection={clearUpdateSelection}
              onChangeSourceFilter={setUpdateSourceFilter}
              onRowClick={setSelectedUpdate}
              onCloseDetail={() => setSelectedUpdate(null)}
              onRowAction={(update) => void handleUpdateAction(update)}
              onUpdateAllVisible={(items) => void handleUpdateAllVisible(items)}
              onOpenExternal={(url) => void openExternal(url)}
            />
          ) : (
          <>
          <AppManagerActionBar
            t={t}
            searchQuery={searchQuery}
            loading={loading}
            historyOpen={historyOpen}
            onSearchQueryChange={setSearchQuery}
            onScanApps={scanApps}
            onToggleHistory={() => setHistoryOpen(!historyOpen)}
          />

          {error && (
            <Alert variant="destructive" className="shrink-0">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <AppManagerBatchResults
            t={t}
            batchResults={batchResults}
            onClear={clearBatchResults}
          />

          <ThreeColumnLayout
            filterOpen={filterPanelOpen}
            detailOpen={!!selectedItem || !!installDetailItem}
            onCloseDetail={() => {
              setSelectedItem(null);
              setInstallDetailItem(null);
            }}
            filter={
              <AppManagerFilterSidebar
                t={t}
                open={filterPanelOpen}
                activeFilterCount={activeFilterCount}
                activeFilter={activeFilter}
                apps={apps}
                installListApps={installListApps}
                categoryFilter={categoryFilter}
                seriesFilter={seriesFilter}
                capabilities={caps}
                lastScanTime={lastScanTime}
                lastUpdateCheck={lastUpdateCheck}
                totalCount={result?.totalCount}
                managedCount={result?.managedCount}
                onToggle={() => setFilterPanelOpen(!filterPanelOpen)}
                onActiveFilterChange={setActiveFilter}
                onCategoryChange={setCategoryFilter}
                onSeriesChange={setSeriesFilter}
              />
            }
            content={
              <div className="h-full flex flex-col gap-3">
                <div className="flex-1 min-h-0">
                  {activeFilter === "installList" ? (
                    <ContentView<InstallListAppInfo>
                      data={filteredApps as InstallListAppInfo[]}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      columns={installListColumns}
                      getRowId={(app) => app.id}
                      renderGridCard={(app) => (
                        <InstallListCard
                          app={app}
                          t={t}
                          status={installStates[app.id]?.status}
                          onInstall={handleInstall}
                          onOpenWebsite={(url) => {
                            if (url) void openExternal(url);
                          }}
                          onCopyText={copyText}
                        />
                      )}
                      estimatedCardHeight={220}
                      gridGap={10}
                      gridRowPadding={[4, 12]}
                      onItemClick={setInstallDetailItem}
                      batchMode={installBatchMode}
                      selectedIds={selectedInstallIds}
                      onToggleSelect={toggleInstallSelect}
                      showViewToggle={true}
                      actions={
                        <>
                          <ToolbarButton
                            icon={<CheckSquare size={15} />}
                            tooltip={installBatchMode ? t("appManager.batchModeOff") : t("appManager.batchMode")}
                            onClick={() => {
                              setInstallBatchMode((value) => !value);
                              clearInstallSelection();
                            }}
                            active={installBatchMode}
                          />
                          <ToolbarButton
                            icon={<Filter size={15} />}
                            tooltip={t("appManager.filters")}
                            onClick={() => setFilterPanelOpen(!filterPanelOpen)}
                            active={filterPanelOpen}
                          />
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {t("appManager.installListSummary", {
                              total: visibleInstallListApps.length,
                              pending: visibleInstallListPendingCount,
                              installed: visibleInstallListInstalledCount,
                            })}
                          </span>
                        </>
                      }
                      rightActions={installBatchMode ? (
                        <div className="flex items-center gap-1">
                          <ToolbarButton
                            icon={<Download size={15} />}
                            tooltip={`${t("appManager.installSelected")} (${selectedInstallIds.size})`}
                            disabled={selectedInstallIds.size === 0}
                            onClick={handleBatchInstall}
                          />
                          <ToolbarButton
                            icon={<X size={15} />}
                            tooltip={t("appManager.clearSelection")}
                            onClick={clearInstallSelection}
                          />
                        </div>
                      ) : undefined}
                      emptyIcon={<Search size={32} className="opacity-30" />}
                      emptyText={t("appManager.installNoResults")}
                    />
                  ) : (
                    <ContentView<AppInfo>
                      data={filteredApps as AppInfo[]}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      columns={appManagerColumns}
                      getRowId={(app) => app.appId}
                      renderGridCard={(app) => <AppManagerGridCard app={app} t={t} />}
                      estimatedCardHeight={120}
                      onItemClick={setSelectedItem}
                      sorting={sorting}
                      onSortingChange={setSorting}
                      loading={loading}
                      selectedId={selectedItem?.appId ?? null}
                      batchMode={batchMode}
                      selectedIds={selectedAppIds}
                      onToggleSelect={toggleSelectApp}
                      getRowAttributes={getRowAttributes}
                      actions={
                        <>
                          {scanned && (
                            <ToolbarButton
                              icon={<CheckSquare size={15} />}
                              tooltip={batchMode ? t("appManager.batchModeOff") : t("appManager.batchMode")}
                              onClick={handleToggleBatchMode}
                              active={batchMode}
                            />
                          )}
                          <ToolbarButton
                            icon={<Filter size={15} />}
                            tooltip={t("appManager.filters")}
                            onClick={() => setFilterPanelOpen(!filterPanelOpen)}
                            active={filterPanelOpen || activeFilter !== "all"}
                          />
                        </>
                      }
                      rightActions={batchMode ? (
                        <div className="flex items-center gap-1">
                          <ToolbarButton
                            icon={<ArrowUpCircle size={15} className={selectedUpgradable > 0 ? "text-orange-500" : ""} />}
                            tooltip={`${t("appManager.batchUpgrade")} (${selectedUpgradable})`}
                            disabled={selectedUpgradable === 0}
                            onClick={handleBatchUpgrade}
                          />
                          <ToolbarButton
                            icon={<Trash2 size={15} />}
                            tooltip={`${t("appManager.batchUninstall")} (${selectedUninstallable})`}
                            disabled={selectedUninstallable === 0}
                            onClick={handleBatchUninstall}
                          />
                          <ToolbarButton
                            icon={<X size={15} />}
                            tooltip={t("appManager.batchClear")}
                            onClick={clearSelection}
                          />
                        </div>
                      ) : undefined}
                      emptyIcon={
                        scanned
                          ? <Search size={32} className="opacity-30" />
                          : <AppWindow size={32} className="opacity-30" />
                      }
                      emptyText={
                        scanned
                          ? (filteredApps.length === 0 && apps.length > 0
                            ? t("appManager.noResults")
                            : t("appManager.empty"))
                          : t("appManager.startHint")
                      }
                    />
                  )}
                </div>
              </div>
            }
            detail={
              activeFilter === "installList" ? (
                <DetailPanel<InstallListAppInfo>
                  item={installDetailItem}
                  open={!!installDetailItem}
                  onClose={() => setInstallDetailItem(null)}
                  title={t("appManager.details")}
                  renderDetail={(app) => (
                    <InstallDetail
                      app={app}
                      t={t}
                      onInstall={handleInstall}
                      onOpenWebsite={(url) => {
                        if (url) void openExternal(url);
                      }}
                    />
                  )}
                />
              ) : (
                <DetailPanel<AppInfo>
                  item={selectedItem}
                  open={!!selectedItem}
                  onClose={() => setSelectedItem(null)}
                  title={t("appManager.details")}
                  renderDetail={(app) => (
                    <AppDetail
                      app={app}
                      t={t}
                      onLaunch={handleLaunch}
                      onReveal={handleReveal}
                      onUpgrade={handleDetailUpgrade}
                      onUninstall={handleDetailUninstall}
                    />
                  )}
                />
              )
            }
          />
          </>
          )}

          <AppManagerHistoryDrawer
            t={t}
            open={historyOpen}
            history={history}
            onClose={() => setHistoryOpen(false)}
          />

          <AppManagerConfirmDialogs
            t={t}
            confirmDialog={confirmDialog}
            installConfirmDialog={installConfirmDialog}
            batchConfirmDialog={batchConfirmDialog}
            onCloseConfirm={controller.closeConfirmDialog}
            onCloseInstallConfirm={closeInstallConfirmDialog}
            onCloseBatchConfirm={closeBatchConfirmDialog}
            onConfirmAction={handleConfirmAction}
            onInstallConfirm={handleInstallConfirm}
            onBatchConfirm={handleBatchConfirm}
          />
        </div>
      </RuntimeFeatureGate>
    </AppManagerErrorBoundary>
  );
}

export default AppManager;
