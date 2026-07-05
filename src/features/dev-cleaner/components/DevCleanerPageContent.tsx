/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useTranslation } from "react-i18next"
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Loader2,
  StopCircle,
  Trash2,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DataTable, getDataTableSortDirection } from "@/components/ui/DataTable"
import { Input } from "@/components/ui/input"
import { filterOptions } from "@/features/dev-cleaner/store"
import { formatScanTime } from "@/features/dev-cleaner/lib/format"
import { CustomCleanupDialog } from "@/features/dev-cleaner/components/CustomCleanupDialog"
import type { DevCleanerController } from "@/features/dev-cleaner/hooks/useDevCleanerController"
import { cn, formatSize } from "@/lib/utils"

interface DevCleanerPageContentProps {
  controller: DevCleanerController
}

function sortGlyph(direction: string) {
  if (direction === "asc") return "\u2191"
  if (direction === "desc") return "\u2193"
  return "\u21c5"
}

export function DevCleanerPageContent({ controller }: DevCleanerPageContentProps) {
  const { t } = useTranslation()
  const {
    selectedPath,
    isScanning,
    scanResult,
    selectedProjects,
    isCleaningUp,
    cleanupMessage,
    sorting,
    filterType,
    showConfirm,
    showFilterOptions,
    filteredProjects,
    filteredCleanupSize,
    selectedCount,
    selectedSize,
    activeSortId,
    getRowAttributes,
    projectColumns,
    setSelectedPath,
    setFilterType,
    setShowConfirm,
    setShowFilterOptions,
    setSorting,
    setSelectedProjects,
    handleSelectPath,
    handleScan,
    handleStopScan,
    handleCleanup,
    updateSorting,
  } = controller

  return (
    <div className="flex h-full flex-col gap-4">
      <Card className="shrink-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Trash2 size={20} />
            {t("devCleaner.title")}
          </CardTitle>
          <div className="flex items-center gap-2">
            <CustomCleanupDialog />
            {scanResult && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground hover:bg-accent/50 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors"
                onClick={() => setShowFilterOptions(!showFilterOptions)}
              >
                <span>{t("devCleaner.filterLabel")}</span>
                {showFilterOptions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <InputPath
              value={selectedPath}
              placeholder={t("devCleaner.enterPath")}
              onChange={setSelectedPath}
            />
            <div className="flex items-center gap-2">
              <Button onClick={handleSelectPath} variant="outline" size="icon" className="shrink-0">
                <FolderOpen size={18} />
              </Button>
              {isScanning ? (
                <>
                  <Button
                    onClick={handleStopScan}
                    variant="destructive"
                    size="icon"
                    className="shrink-0"
                    title={t("devCleaner.stopScan")}
                  >
                    <StopCircle size={18} />
                  </Button>
                  <Button onClick={handleScan} disabled className="shrink-0">
                    <Loader2 size={18} className="mr-1 animate-spin" />
                    <span className="hidden sm:inline">{t("devCleaner.scanning")}</span>
                  </Button>
                </>
              ) : (
                <Button onClick={handleScan} disabled={!selectedPath} className="shrink-0">
                  {t("devCleaner.startScan")}
                </Button>
              )}
            </div>
          </div>

          {cleanupMessage && (
            <Alert variant={cleanupMessage.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{cleanupMessage.text}</AlertDescription>
            </Alert>
          )}

          {scanResult && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">
                    {t("devCleaner.projectsLabel")}
                  </span>
                  <span className="font-semibold">{scanResult.total_projects}</span>
                </div>
                <div className="bg-border h-4 w-px" />
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">{t("devCleaner.totalSize")}</span>
                  <span className="font-semibold">{formatSize(scanResult.total_size)}</span>
                </div>
                <div className="bg-border h-4 w-px" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-orange-700/80 dark:text-orange-300/80">
                    {t("devCleaner.cleanupSize")}
                  </span>
                  <span className="font-semibold text-orange-600 dark:text-orange-400">
                    {formatSize(scanResult.total_cleanup_size)}
                  </span>
                </div>
                <div className="bg-border h-4 w-px" />
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">{t("devCleaner.scanTime")}</span>
                  <span className="font-semibold">{formatScanTime(scanResult.scan_time_ms)}</span>
                </div>
                <div className="bg-border h-4 w-px" />
                <span className="text-muted-foreground text-xs">
                  {t("devCleaner.filteredCleanup")}: {formatSize(filteredCleanupSize)}
                </span>
              </div>

              {showFilterOptions && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {filterOptions.map((filter) => (
                    <Button
                      key={filter}
                      variant={filterType === filter ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilterType(filter)}
                    >
                      {t(`devCleaner.filter.${filter}`)}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {scanResult && (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <Card className="flex min-h-[200px] flex-1 flex-col overflow-hidden">
            <CardHeader className="shrink-0 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {filteredProjects.length > 0 ? (
                    <CardTitle className="text-base">{t("devCleaner.title")}</CardTitle>
                  ) : (
                    <CardTitle className="text-base">{t("devCleaner.selectProjects")}</CardTitle>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {t("devCleaner.sorting.current")}:{" "}
                    {t(`devCleaner.sorting.${activeSortId ?? "name"}`)}
                  </Badge>
                  <Badge variant="secondary">
                    {filteredProjects.length} {t("devCleaner.resultsLabel")}
                  </Badge>
                  <Badge variant="secondary">
                    {t("devCleaner.filteredCleanup")}: {formatSize(filteredCleanupSize)}
                  </Badge>
                  {selectedCount > 0 && (
                    <Badge variant="secondary">
                      {selectedCount} / {filteredProjects.length}
                    </Badge>
                  )}
                  {selectedCount > 0 && (
                    <Badge variant="secondary">
                      {t("devCleaner.selectedSize")}: {formatSize(selectedSize)}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent
              className={cn(
                "relative min-h-0 flex-1 px-4 pb-2",
                isScanning && "pointer-events-none opacity-50",
              )}
            >
              {isScanning && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 size={24} className="text-muted-foreground animate-spin" />
                </div>
              )}
              {filteredProjects.length > 0 ? (
                <div className="flex h-full flex-col space-y-2">
                  <div className="mb-2 flex shrink-0 flex-wrap gap-2 md:hidden">
                    <Button
                      variant={activeSortId === "cleanupSize" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateSorting("cleanupSize", true)}
                    >
                      {t("devCleaner.cleanupSize")}
                      {sortGlyph(getDataTableSortDirection(sorting, "cleanupSize"))}
                    </Button>
                    <Button
                      variant={activeSortId === "modified" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateSorting("modified", true)}
                    >
                      {t("devCleaner.lastModified")}
                      {sortGlyph(getDataTableSortDirection(sorting, "modified"))}
                    </Button>
                    <Button
                      variant={activeSortId === "name" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateSorting("name")}
                    >
                      {t("devCleaner.sorting.name")}
                      {sortGlyph(getDataTableSortDirection(sorting, "name"))}
                    </Button>
                  </div>
                  <DataTable
                    data={filteredProjects}
                    columns={projectColumns}
                    getRowId={(project) => project.path}
                    sorting={{
                      sorting,
                      onSortingChange: setSorting,
                    }}
                    selection={{
                      rowSelection: selectedProjects,
                      onRowSelectionChange: setSelectedProjects,
                      selectOnRowClick: true,
                      columnClassName: "w-12 p-2",
                      getSelectAllCheckboxLabel: (isAllSelected) =>
                        isAllSelected ? t("devCleaner.deselectAll") : t("devCleaner.selectAll"),
                      getRowCheckboxLabel: (project, isSelected) =>
                        `${isSelected ? t("devCleaner.deselectAll") : t("devCleaner.selectAll")} ${project.name}`,
                    }}
                    layout="fixed"
                    className="min-w-[760px]"
                    containerClassName="rounded-xl border shadow-xs flex-1 min-h-0"
                    getRowAttributes={getRowAttributes}
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                  <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                    <AlertTriangle className="text-muted-foreground h-8 w-8" />
                  </div>
                  <p className="text-muted-foreground max-w-xs text-sm">
                    {t("devCleaner.noProjects")}
                  </p>
                </div>
              )}
            </CardContent>

            <div className="shrink-0 space-y-2 px-4 pt-2 pb-4">
              {selectedCount > 0 && !showConfirm && (
                <>
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                    {t("devCleaner.confirmMessage", {
                      count: selectedCount,
                      size: formatSize(selectedSize),
                    })}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedProjects({})}
                      className="flex-1"
                    >
                      {t("devCleaner.clearSelection")}
                    </Button>
                    <Button
                      onClick={() => setShowConfirm(true)}
                      variant="destructive"
                      className="flex-1"
                    >
                      {t("devCleaner.cleanupButton")}
                    </Button>
                  </div>
                </>
              )}

              {showConfirm && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => setShowConfirm(false)}
                    className="flex-1"
                  >
                    {t("devCleaner.cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleCleanup}
                    disabled={isCleaningUp}
                    className="flex-1"
                  >
                    {isCleaningUp ? (
                      <>
                        <Loader2 size={18} className="mr-2 animate-spin" />
                        {t("devCleaner.cleanup")}
                      </>
                    ) : (
                      t("devCleaner.cleanup")
                    )}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function InputPath({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <Input
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      readOnly
      className="min-w-0 flex-1"
      data-testid="path-input"
    />
  )
}
