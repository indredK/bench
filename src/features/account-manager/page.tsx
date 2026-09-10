/**
 * account-manager page / 账号管理页面: thin composition over useAccountManagerController.
 * 三栏布局(站点 / 账号 / 详情) + 各类对话框都是纯展示组件,状态与编排全在控制器 hook。
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { FeatureLoadError } from "@/components/common/FeatureLoadError"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { openExternal } from "@/platform/shell"
import { useAccountManagerController } from "@/features/account-manager/hooks/useAccountManagerController"
import { useLoginRules } from "@/features/account-manager/hooks/useLoginRules"
import { useBrowserInterop } from "@/features/account-manager/hooks/useBrowserInterop"
import { useAccountExport } from "@/features/account-manager/hooks/useAccountExport"
import { StationColumn } from "@/features/account-manager/components/StationColumn"
import { AccountColumn } from "@/features/account-manager/components/AccountColumn"
import { DetailColumn } from "@/features/account-manager/components/DetailColumn"
import { StationDialog } from "@/features/account-manager/components/station-form-dialog"
import { AddAccountDialog } from "@/features/account-manager/components/add-account-dialog"
import { EditAccountDialog } from "@/features/account-manager/components/edit-account-dialog"
import { QuickLoginDialog } from "@/features/account-manager/components/quick-login-dialog"
import { DeleteConfirmDialog } from "@/features/account-manager/components/delete-confirm-dialog"
import { describeRegionError } from "@/features/account-manager/errors"
import { AuthProxyDialog } from "@/features/account-manager/components/auth-proxy-dialog"
import { ExternalAppsPanel } from "@/features/account-manager/components/external-apps-panel"
import { AccountLogDialog } from "@/features/account-manager/components/account-log-dialog"
import { FingerprintConfirmDialog } from "@/features/account-manager/components/fingerprint-confirm-dialog"
import { FingerprintDetailDialog } from "@/features/account-manager/components/fingerprint-detail-dialog"
import { LoginRulesDialog } from "@/features/account-manager/components/login-rules-dialog"
import { BrowserInteropDialog } from "@/features/account-manager/components/browser-interop-dialog"
import { AccountExportDialog } from "@/features/account-manager/components/account-export-dialog"
import { useAccountManagerStore } from "@/features/account-manager/store"
import { useNotificationCenterStore } from "@/components/layout/notification-center/store"
import { cn } from "@/lib/utils"
import {
  getCapabilityReason,
  isCapabilityUsable,
} from "@/features/account-manager/model/capabilities"

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
  const { t, i18n } = useTranslation()
  const c = useAccountManagerController()
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)
  const isAccountLogOpen = useAccountManagerStore((s) => s.isAccountLogOpen)
  const setAccountLogOpen = useAccountManagerStore((s) => s.setAccountLogOpen)
  const accountLogTarget = useAccountManagerStore((s) => s.accountLogTarget)
  const keeperLogs = c.sessionKeeper.logs

  /** 账号快照导出弹窗（导出按钮 → openDialog 生成快照,出口为复制/保存）。 */
  const accountExport = useAccountExport()
  const isAccountExportOpen = useAccountManagerStore((s) => s.isAccountExportOpen)
  const setAccountExportOpen = useAccountManagerStore((s) => s.setAccountExportOpen)
  const accountExportTarget = useAccountManagerStore((s) => s.accountExportTarget)

  /** 指纹确认弹窗展示的账号名:取自采样目标(而非当前选中,避免选中被重置后文案错位)。 */
  const fingerprintUsername = useMemo(() => {
    const target = c.fingerprintTarget
    if (!target) return ""
    return c.accounts.find((account) => account.id === target.accountId)?.username ?? ""
  }, [c.fingerprintTarget, c.accounts])

  /** 日志对话框展示模型:计划摘要 + 下次执行时间(本地化)。 */
  const accountLogView = useMemo(() => {
    if (!keeperLogs) return null
    const schedule = keeperLogs.schedule
    let scheduleLabel: string | null = null
    if (schedule) {
      if (!schedule.enabled) {
        scheduleLabel = t("accountManager.sessionKeeper.summary.paused")
      } else if (schedule.mode.type === "interval") {
        scheduleLabel = t("accountManager.sessionKeeper.summary.interval", {
          hours: schedule.mode.hours,
        })
      } else {
        const minuteOfDay = schedule.mode.minuteOfDay
        const time = `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`
        scheduleLabel = t("accountManager.sessionKeeper.summary.daily", { time })
      }
    }
    let nextRunLabel: string | null = null
    if (schedule?.enabled && keeperLogs.nextRefreshAtTs != null) {
      try {
        const time = new Intl.DateTimeFormat(i18n.language, {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(keeperLogs.nextRefreshAtTs * 1000))
        nextRunLabel = t("accountManager.sessionKeeper.nextRun", { time })
      } catch {
        nextRunLabel = null
      }
    }
    return { entries: keeperLogs.entries, scheduleLabel, nextRunLabel }
  }, [keeperLogs, t, i18n.language])

  const capabilityState = useMemo(() => {
    const capabilities = c.capabilities
    if (!capabilities) {
      const reason = t("accountManager.capabilities.reasons.capabilityUnavailable")
      return {
        loginDisabledReason: reason,
        externalLoginDisabledReason: reason,
        networkProxyAvailable: false,
        networkProxyNotice: reason,
        browserInteropAvailable: false,
        browserInteropDisabledReason: reason,
        degradedCount: 0,
        blockedCount: 1,
      }
    }
    const values = [
      capabilities.credentialStore,
      capabilities.isolatedWebview,
      capabilities.cookieSession,
      capabilities.webStorage,
      capabilities.indexedDb,
      capabilities.networkProxy,
      capabilities.deepLink,
      capabilities.browserSessionOpen,
      capabilities.browserSessionCapture,
    ]
    const loginDisabledReason = isCapabilityUsable(capabilities.isolatedWebview)
      ? undefined
      : getCapabilityReason(t, capabilities.isolatedWebview)
    const externalCapability = [capabilities.isolatedWebview, capabilities.deepLink].find(
      (capability) => !isCapabilityUsable(capability),
    )
    const browserInteropCapability = [
      capabilities.browserSessionOpen,
      capabilities.browserSessionCapture,
    ].find((capability) => !isCapabilityUsable(capability))
    return {
      loginDisabledReason,
      externalLoginDisabledReason: externalCapability
        ? getCapabilityReason(t, externalCapability)
        : undefined,
      networkProxyAvailable: isCapabilityUsable(capabilities.networkProxy),
      networkProxyNotice:
        capabilities.networkProxy.status === "supported"
          ? undefined
          : getCapabilityReason(t, capabilities.networkProxy),
      browserInteropAvailable: !browserInteropCapability,
      browserInteropDisabledReason: browserInteropCapability
        ? getCapabilityReason(t, browserInteropCapability)
        : undefined,
      degradedCount: values.filter((capability) => capability.status === "partial").length,
      blockedCount: values.filter(
        (capability) => capability.status === "unsupported" || capability.status === "failed",
      ).length,
    }
  }, [c.capabilities, t])

  // 能力摘要不再内联占行，推入标题栏消息中心；条件消失时移除对应消息（id 稳定，重复推送按 upsert 处理）。
  const pushNotification = useNotificationCenterStore((s) => s.pushNotification)
  const dismissNotification = useNotificationCenterStore((s) => s.dismissNotification)
  useEffect(() => {
    if (capabilityState.degradedCount > 0 || capabilityState.blockedCount > 0) {
      pushNotification({
        id: "account-manager:capabilities",
        level: capabilityState.blockedCount > 0 ? "error" : "warning",
        titleKey: "sidebar.accountManager",
        descriptionKey: "accountManager.capabilities.summary",
        descriptionParams: {
          partial: capabilityState.degradedCount,
          blocked: capabilityState.blockedCount,
        },
      })
    } else {
      dismissNotification("account-manager:capabilities")
    }
  }, [
    capabilityState.degradedCount,
    capabilityState.blockedCount,
    pushNotification,
    dismissNotification,
  ])

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

  /** 更新登录逻辑弹窗（挂在当前选中站点上；未选中站点时打开按钮不渲染）。 */
  const loginRules = useLoginRules({ website: c.selectedStation?.website ?? null })

  /** 互通 I1/I2 — 账号 ↔ 浏览器会话互操作（注入 / 手动登录 / 回采）。 */
  const browserInterop = useBrowserInterop({
    onCaptured: () => void c.loadInitialData().catch(() => undefined),
  })

  const renderDetailColumn = (className?: string) => (
    <DetailColumn
      className={className}
      station={c.selectedStation}
      account={c.selectedAccount}
      onOpenWebsite={() => c.selectedStation && void openExternal(c.selectedStation.website)}
      onOpenLoginRules={loginRules.openDialog}
      onRedetectProfile={c.handleRedetectProfile}
      onToggleProxy={c.handleToggleProxy}
      onManageExternalApps={c.handleOpenExternalApps}
      onOpenBrowserInterop={
        capabilityState.browserInteropAvailable ? browserInterop.openDialog : undefined
      }
      browserInteropDisabledReason={capabilityState.browserInteropDisabledReason}
      onRevealPassword={c.handleRevealPassword}
      onCopyPassword={c.handleCopyPassword}
      onProbeStrategyChange={c.handleProbeStrategyChange}
      onRefreshAccount={c.handleRefreshAccount}
      onScheduleChange={c.sessionKeeper.handleScheduleChange}
      onOpenAccountLogs={c.sessionKeeper.handleOpenAccountLogs}
      onCaptureFingerprint={c.handleCaptureFingerprint}
      capturingFingerprint={c.capturingFingerprint}
      savingSchedule={
        c.selectedAccount ? c.sessionKeeper.savingScheduleIds.has(c.selectedAccount.id) : false
      }
      error={c.regionErrors.detail ? describeRegionError(t, c.regionErrors.detail) : null}
      onRetryError={() => c.retryRegion("detail")}
      onDismissError={() => c.dismissRegionError("detail")}
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
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex min-h-0 flex-1 gap-4">
        <StationColumn
          stations={c.stations}
          selectedId={c.selectedStationId}
          countByStation={c.accountCountByStation}
          onSelect={(stationId) => {
            setDetailSheetOpen(false)
            c.handleSelectStation(stationId)
          }}
          onAdd={() => c.setAddStationOpen(true)}
          onQuickLogin={() => c.handleOpenQuickLogin()}
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
          quickLoginDisabledReason={capabilityState.loginDisabledReason}
          externalLoginDisabledReason={capabilityState.externalLoginDisabledReason}
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
          onExport={(account) => accountExport.openDialog(account.id, account.username)}
          onReorder={(ids) => void c.handleReorderAccounts(ids)}
          reorderDisabled={c.reorderingAccounts}
          loginDisabledReason={capabilityState.loginDisabledReason}
        />

        {renderDetailColumn()}
      </div>

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
        networkProxyAvailable={capabilityState.networkProxyAvailable}
        networkProxyNotice={capabilityState.networkProxyNotice}
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
        onMatchStations={c.sessionKeeper.matchStations}
        getStationAccounts={c.getStationAccountsForQuickLogin}
        submitting={c.quickLoginPending}
        initialUrl={c.quickLoginPrefillUrl}
      />
      <AccountLogDialog
        open={isAccountLogOpen}
        onOpenChange={setAccountLogOpen}
        accountName={accountLogTarget?.accountName ?? ""}
        logs={accountLogView}
        loading={c.sessionKeeper.logsLoading}
        error={c.sessionKeeper.logsError}
        onRetry={() => {
          const target = accountLogTarget
          if (target) void c.sessionKeeper.reloadLogs(target.accountId)
        }}
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
        initialIsAuthorize={c.authProxyIsAuthorize}
        onSwitchToQuickLogin={c.handleQuickLoginPrefill}
      />
      <FingerprintConfirmDialog
        open={c.isFingerprintConfirmOpen}
        onOpenChange={c.setFingerprintConfirmOpen}
        summary={c.fingerprintSummary}
        username={fingerprintUsername}
        onConfirm={c.handleConfirmFingerprint}
        confirming={c.confirmingFingerprint}
        onViewDetail={() => void c.handleViewFingerprintDetail()}
      />
      <FingerprintDetailDialog
        open={c.isFingerprintDetailOpen}
        onOpenChange={c.setFingerprintDetailOpen}
        detail={c.fingerprintDetail}
        loading={c.loadingFingerprintDetail}
      />
      <LoginRulesDialog
        open={loginRules.open}
        onOpenChange={(next) => (next ? loginRules.openDialog() : loginRules.closeDialog())}
        website={c.selectedStation?.website ?? null}
        overview={loginRules.overview}
        checking={loginRules.checking}
        updatingScope={loginRules.updatingScope}
        onUpdate={loginRules.handleUpdate}
      />
      <BrowserInteropDialog
        open={browserInterop.open}
        onOpenChange={(next) => {
          if (!next) browserInterop.closeDialog()
        }}
        account={browserInterop.account}
        browsers={browserInterop.browsers}
        browserId={browserInterop.browserId}
        onBrowserIdChange={browserInterop.setBrowserId}
        status={browserInterop.status}
        busy={browserInterop.busy}
        conflict={browserInterop.conflict}
        lastOpen={browserInterop.lastOpen}
        probe={browserInterop.probe}
        onOpenBrowser={browserInterop.handleOpen}
        onCapture={browserInterop.handleCapture}
        onCloseInstance={browserInterop.handleCloseInstance}
        onClearProfile={browserInterop.handleClearProfile}
        onProbe={browserInterop.handleProbe}
      />
      <AccountExportDialog
        open={isAccountExportOpen}
        onOpenChange={setAccountExportOpen}
        accountName={accountExportTarget?.accountName ?? ""}
        stationName={c.selectedStation?.remark ?? ""}
        loading={accountExport.loading}
        saving={accountExport.saving}
        ready={accountExport.ready}
        onCopy={() => void accountExport.copyToClipboard()}
        onSave={() => void accountExport.saveAsJson()}
      />
    </div>
  )
}

export default AccountManagerPage
