/**
 * Page View / 页面视图: compose screen only; 只组合页面.
 */
import { AnimatePresence, motion } from "motion/react";
import { AppWindow, CheckSquare, Download, Filter, Search, Trash2, X } from "lucide-react";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import { RuntimeFeatureGate } from "@/components/common/RuntimeFeatureGate";
import { AppDetail, InstallDetail } from "@/features/app-manager/components/AppManagerDetails";
import { AppManagerCatalogView } from "@/features/app-manager/components/AppManagerCatalogView";
import { AppManagerConfirmDialogs } from "@/features/app-manager/components/AppManagerConfirmDialogs";
import { AppManagerErrorBoundary } from "@/features/app-manager/components/AppManagerErrorBoundary";
import { AppManagerGridCard } from "@/features/app-manager/components/AppManagerGridCard";
import { AppManagerTabs } from "@/features/app-manager/components/AppManagerTabs";
import { InstallListCard } from "@/features/app-manager/components/InstallListCard";
import { SoftwareUpdateView } from "@/features/app-manager/components/SoftwareUpdateView";
import { UpdateBlockingDialogs } from "@/features/app-manager/components/UpdateBlockingDialogs";
import { UpdateProgressDialog } from "@/features/app-manager/components/UpdateProgressDialog";
import { useAppManagerController } from "@/features/app-manager/hooks/useAppManagerController";
import { getInstalledFilterCounts } from "@/features/app-manager/model/selectors";
import { APP_FILTER_OPTIONS, MARKETPLACE_FILTER_OPTIONS } from "@/features/app-manager/model/store-types";
import type { AppFilterKey, MarketplaceFilterKey } from "@/features/app-manager/model/preferences";
import type { AppInfo, InstallListAppInfo } from "@/lib/tauri/types/app-manager";
import { useAppManagerViewState } from "@/features/app-manager/hooks/useAppManagerViewState";

function AppManager({ active, feature }: { active: boolean; feature?: { desktopOnly?: boolean } }) {
  const viewState = useAppManagerViewState();
  const controller = useAppManagerController(active);
  const {
    t,
    loading,
    error,
    scanProgress,
    searchQuery,
    activeFilter,
    marketplaceFilter,
    categoryFilter,
    seriesFilter,
    scanned,
    result,
    confirmDialog,
    lastScanTime,
    lastUpdateCheck,
    viewMode,
    selectedItem,
    filterPanelOpen,
    selectedAppIds,
    batchMode,
    batchProgress,
    batchResults,
    batchConfirmDialog,
    installListApps,
    installStates,
    installConfirmDialog,
    selectedInstallIds,
    selectedInstallableCount,
    selectedMarketplaceUninstallableCount,
    installBatchMode,
    installDetailItem,
    activeTab,
    updatesLoading,
    updatesError,
    updatesScanned,
    filteredApps,
    filteredInstallListApps,
    activeFilterCount,
    marketplaceFilterCount,
    visibleInstallListInstalledCount,
    visibleInstallListPendingCount,
    appManagerColumns,
    installListColumns,
    clearError,
    clearUpdatesError,
    setSearchQuery,
    setActiveFilter,
    setMarketplaceFilter,
    setCategoryFilter,
    setSeriesFilter,
    scanApps,
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
    handleBatchInstallListUninstall,
    handleInstallConfirm,
    getRowAttributes,
    handleConfirmAction,
    handleToggleBatchMode,
    handleToggleInstallBatchMode,
    selectedUninstallable,
    handleBatchUninstall,
    handleBatchConfirm,
    handleDetailUpgrade,
    handleDetailUninstall,
    setInstallDetailItem,
    checkAllUpdates,
    handleUpdateAction,
    handleUpdateSourceAction,
    handleCloseInstallDialog,
    inProgressUpdate,
    handleSetActiveTab,
    toggleUpdateGroup,
    toggleSelectUpdate,
    clearUpdateSelection,
    setUpdateSourceFilter,
    setSelectedUpdate,
    clearSelectedApps,
  } = controller;

  const installedFilterCounts = getInstalledFilterCounts(viewState.apps);
  const installedTypeFilterOptions = APP_FILTER_OPTIONS.map((option) => ({
    key: option.key,
    label: t(option.labelKey),
    count: installedFilterCounts[option.key],
  }));

  const marketplaceInstalledCount = viewState.installListApps.filter((app) => app.installed).length;
  const marketplacePendingCount = viewState.installListApps.length - marketplaceInstalledCount;
  const marketplaceTypeFilterOptions = MARKETPLACE_FILTER_OPTIONS.map((option) => ({
    key: option.key,
    label: t(option.labelKey),
    count:
      option.key === "all"
        ? installListApps.length
        : option.key === "installed"
          ? marketplaceInstalledCount
          : marketplacePendingCount,
  }));
  const batchRunning = Boolean(batchProgress?.running);

  return (
    <AppManagerErrorBoundary>
      <RuntimeFeatureGate
        feature={feature}
        title={t("appManager.title")}
        icon={<AppWindow size={32} className="opacity-40" />}
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          <AppManagerTabs
            t={t}
            activeTab={activeTab}
            onChange={handleSetActiveTab}
            updateCount={viewState.updates.length}
          />

          <div className="flex-1 min-h-0">
            <AnimatePresence mode="wait" initial={false}>
            {activeTab === "softwareUpdate" ? (
              <motion.div
                key="softwareUpdate"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className="h-full min-h-0"
              >
              <SoftwareUpdateView
                t={t}
                apps={viewState.apps}
                updates={viewState.updates}
                searchQuery={searchQuery}
                loading={updatesLoading}
                scanned={updatesScanned}
                error={updatesError}
                onClearError={clearUpdatesError}
                lastUpdateCheck={viewState.lastUpdateCheck}
                selectedIds={viewState.selectedUpdateIds}
                selectedUpdate={viewState.selectedUpdate}
                sourceFilter={viewState.updateSourceFilter}
                expandedGroups={viewState.expandedUpdateGroups}
                updateOperations={viewState.updateOperations}
                onSearchQueryChange={setSearchQuery}
                onRecheck={() => void checkAllUpdates(true)}
                onToggleGroup={toggleUpdateGroup}
                onToggleSelect={toggleSelectUpdate}
                onClearSelection={clearUpdateSelection}
                onChangeSourceFilter={setUpdateSourceFilter}
                onRowClick={setSelectedUpdate}
                onCloseDetail={() => setSelectedUpdate(null)}
                onRowAction={(update) => void handleUpdateAction(update)}
                onGroupAction={(source, sourceUpdates) =>
                  void handleUpdateSourceAction(source, sourceUpdates)
                }
                onOpenExternal={(url) => void openExternal(url)}
              />
              </motion.div>
            ) : activeTab === "marketplace" ? (
              <motion.div
                key="marketplace"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className="h-full min-h-0"
              >
              <AppManagerCatalogView<InstallListAppInfo, MarketplaceFilterKey>
                t={t}
                items={filteredInstallListApps}
                allItems={viewState.installListApps}
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
                selectedItem={installDetailItem}
                selectedId={installDetailItem?.id ?? null}
                onItemClick={setInstallDetailItem}
                onCloseDetail={() => setInstallDetailItem(null)}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                searchQuery={searchQuery}
                searchPlaceholder={t("appManager.installSearchPlaceholder")}
                loading={loading}
                error={error}
                batchResults={batchResults}
                onClearError={clearError}
                filterPanelOpen={filterPanelOpen}
                activeFilterCount={marketplaceFilterCount}
                typeFilter={marketplaceFilter}
                typeFilterOptions={marketplaceTypeFilterOptions}
                categoryFilter={categoryFilter}
                seriesFilter={seriesFilter}
                detailTitle={t("appManager.details")}
                onSearchQueryChange={setSearchQuery}
                onScanApps={scanApps}
                onClearBatchResults={clearBatchResults}
                onToggleFilterPanel={() => setFilterPanelOpen(!filterPanelOpen)}
                onTypeFilterChange={setMarketplaceFilter}
                onCategoryChange={setCategoryFilter}
                onSeriesChange={setSeriesFilter}
                summary={t("appManager.installListSummary", {
                  total: filteredInstallListApps.length,
                  pending: visibleInstallListPendingCount,
                  installed: visibleInstallListInstalledCount,
                })}
                emptyIcon={<Search size={32} className="opacity-30" />}
                emptyText={t("appManager.installNoResults")}
                estimatedCardHeight={220}
                gridGap={10}
                gridRowPadding={[4, 12]}
                batchMode={installBatchMode}
                selectedIds={selectedInstallIds}
                onToggleSelect={toggleInstallSelect}
                showViewToggle={true}
                actions={
                  <>
                    <ToolbarButton
                      icon={<Filter size={15} />}
                      tooltip={t("appManager.filters")}
                      onClick={() => setFilterPanelOpen(!filterPanelOpen)}
                      active={filterPanelOpen || marketplaceFilterCount > 0}
                    />
                    <ToolbarButton
                      icon={<CheckSquare size={15} />}
                      tooltip={installBatchMode ? t("appManager.batchModeOff") : t("appManager.batchMode")}
                      onClick={handleToggleInstallBatchMode}
                      active={installBatchMode}
                    />
                  </>
                }
                rightActions={installBatchMode ? (
                  <div className="flex items-center gap-1">
                    <ToolbarButton
                      icon={<Download size={15} />}
                      tooltip={`${t("appManager.installSelected")} (${selectedInstallableCount})`}
                      disabled={selectedInstallableCount === 0 || batchRunning}
                      onClick={handleBatchInstall}
                    />
                    <ToolbarButton
                      icon={<Trash2 size={15} />}
                      tooltip={`${t("appManager.batchUninstall")} (${selectedMarketplaceUninstallableCount})`}
                      disabled={selectedMarketplaceUninstallableCount === 0 || batchRunning}
                      onClick={handleBatchInstallListUninstall}
                    />
                    <ToolbarButton
                      icon={<X size={15} />}
                      tooltip={t("appManager.clearSelection")}
                      onClick={clearInstallSelection}
                    />
                  </div>
                ) : undefined}
              />
              </motion.div>
            ) : (
              <motion.div
                key="installed"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className="h-full min-h-0"
              >
              <AppManagerCatalogView<AppInfo, AppFilterKey>
                t={t}
                items={filteredApps}
                allItems={viewState.apps}
                columns={appManagerColumns}
                getRowId={(app) => app.appId}
                renderGridCard={(app) => <AppManagerGridCard app={app} t={t} />}
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
                selectedItem={selectedItem}
                selectedId={selectedItem?.appId ?? null}
                onItemClick={setSelectedItem}
                onCloseDetail={() => setSelectedItem(null)}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                searchQuery={searchQuery}
                searchPlaceholder={t("appManager.searchPlaceholder")}
                loading={loading}
                error={error}
                loadingSubtitle={scanProgress ? (
                  scanProgress.stage === "processingMetadata"
                    ? t("appManager.scanStage.processing")
                    : scanProgress.stage === "resolvingSources"
                      ? t("appManager.scanStage.resolving")
                      : t("appManager.scanStage.scanning")
                ) : undefined}
                loadingProgress={scanProgress?.current}
                batchResults={batchResults}
                onClearError={clearError}
                filterPanelOpen={filterPanelOpen}
                activeFilterCount={activeFilterCount}
                typeFilter={activeFilter}
                typeFilterOptions={installedTypeFilterOptions}
                categoryFilter={categoryFilter}
                seriesFilter={seriesFilter}
                detailTitle={t("appManager.details")}
                onSearchQueryChange={setSearchQuery}
                onScanApps={scanApps}
                onClearBatchResults={clearBatchResults}
                onToggleFilterPanel={() => setFilterPanelOpen(!filterPanelOpen)}
                onTypeFilterChange={setActiveFilter}
                onCategoryChange={setCategoryFilter}
                onSeriesChange={setSeriesFilter}
                filterFooter={
                  <div className="space-y-3 text-xs">
                    {result?.platformCapabilities && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {t("appManager.platform")}
                        </p>
                        <div className="space-y-1.5">
                          {result.platformCapabilities.brewAvailable && <p className="text-green-600">✓ Homebrew</p>}
                          {result.platformCapabilities.wingetAvailable && <p className="text-green-600">✓ winget</p>}
                          {result.platformCapabilities.flatpakAvailable && <p className="text-green-600">✓ Flatpak</p>}
                          {result.platformCapabilities.snapAvailable && <p className="text-green-600">✓ Snap</p>}
                          {result.platformCapabilities.aptAvailable && <p className="text-green-600">✓ APT</p>}
                          {!result.platformCapabilities.brewAvailable &&
                            !result.platformCapabilities.wingetAvailable &&
                            !result.platformCapabilities.flatpakAvailable &&
                            !result.platformCapabilities.snapAvailable &&
                            !result.platformCapabilities.aptAvailable && (
                              <p className="text-muted-foreground">{t("appManager.noPmAvailable")}</p>
                            )}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1 text-[11px] text-muted-foreground">
                      {lastScanTime > 0 && (
                        <p>{t("appManager.lastScan")}: {new Date(lastScanTime).toLocaleTimeString()}</p>
                      )}
                      {lastUpdateCheck > 0 && (
                        <p>{t("appManager.lastUpdate")}: {new Date(lastUpdateCheck).toLocaleTimeString()}</p>
                      )}
                      {result && (
                        <p>{t("appManager.summaryShort", { total: result.totalCount, managed: result.managedCount })}</p>
                      )}
                    </div>
                  </div>
                }
                emptyIcon={
                  scanned
                    ? <Search size={32} className="opacity-30" />
                    : <AppWindow size={32} className="opacity-30" />
                }
                emptyText={
                  scanned
                    ? (filteredApps.length === 0 && viewState.apps.length > 0
                      ? t("appManager.noResults")
                      : t("appManager.empty"))
                    : t("appManager.startHint")
                }
                estimatedRowHeight={56}
                estimatedCardHeight={120}
                batchMode={batchMode}
                selectedIds={selectedAppIds}
                onToggleSelect={toggleSelectApp}
                summary={t("appManager.summaryShort", {
                  total: result?.totalCount ?? viewState.apps.length,
                  managed: result?.managedCount ?? 0,
                })}
                actions={
                  <>
                    <ToolbarButton
                      icon={<Filter size={15} />}
                      tooltip={t("appManager.filters")}
                      onClick={() => setFilterPanelOpen(!filterPanelOpen)}
                      active={filterPanelOpen || activeFilter !== "all"}
                    />
                    {scanned && (
                      <ToolbarButton
                        icon={<CheckSquare size={15} />}
                        tooltip={batchMode ? t("appManager.batchModeOff") : t("appManager.batchMode")}
                        onClick={handleToggleBatchMode}
                        active={batchMode}
                      />
                    )}
                  </>
                }
                rightActions={batchMode ? (
                  <div className="flex items-center gap-1">
                    <ToolbarButton
                      icon={<Trash2 size={15} />}
                      tooltip={`${t("appManager.batchUninstall")} (${selectedUninstallable})`}
                      disabled={selectedUninstallable === 0 || batchRunning}
                      onClick={handleBatchUninstall}
                    />
                    <ToolbarButton
                      icon={<X size={15} />}
                      tooltip={t("appManager.batchClear")}
                      onClick={clearSelectedApps}
                    />
                  </div>
                ) : undefined}
                getRowAttributes={getRowAttributes}
              />
              </motion.div>
            )}
            </AnimatePresence>
          </div>

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

          {/* v1.2: in-place install progress + interactive checkpoints. Both
              dialogs read state from the store keyed by `inProgressUpdate.appId`. */}
          <UpdateProgressDialog
            update={inProgressUpdate}
            onClose={handleCloseInstallDialog}
          />
          <UpdateBlockingDialogs
            update={inProgressUpdate}
            onClose={handleCloseInstallDialog}
          />
        </div>
      </RuntimeFeatureGate>
    </AppManagerErrorBoundary>
  );
}

export default AppManager;
