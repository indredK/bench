import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  getDataTableSortDirection,
  getNextDataTableSorting,
} from "@/components/ui/DataTable";
import {
  cleanupProjects as runCleanupProjects,
  scanDevProjects,
  stopDevProjectScan,
} from "@/lib/tauri/commands";
import { createDevCleanerColumns } from "@/features/dev-cleaner/columns";
import type { ProjectInfo, ScanResult } from "@/lib/tauri/types";
import { formatSize } from "@/lib/utils";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Loader2,
  StopCircle,
  Trash2,
} from "lucide-react";

type FilterType = "all" | "nodejs" | "python" | "rust" | "go";

const filterOptions: FilterType[] = ["all", "nodejs", "python", "rust", "go"];
const filterTypeMap: Record<Exclude<FilterType, "all">, ProjectInfo["project_type"]> = {
  nodejs: "NodeJs",
  python: "Python",
  rust: "Rust",
  go: "Go",
};
function formatScanTime(scanTimeMs: number) {
  if (scanTimeMs < 1000) {
    return `${scanTimeMs} ms`;
  }

  return `${(scanTimeMs / 1000).toFixed(1)} s`;
}

export default function DevCleaner() {
  const { t } = useTranslation();
  const [selectedPath, setSelectedPath] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<RowSelectionState>({});
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "cleanupSize", desc: true },
  ]);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showFilterOptions, setShowFilterOptions] = useState(true);
  const [scanTrigger, setScanTrigger] = useState(0);
  const selectedPathRef = useRef(selectedPath);
  const rescanTimeoutRef = useRef<number | null>(null);

  selectedPathRef.current = selectedPath;

  const handleSelectPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Directory to Scan",
      });

      if (selected && typeof selected === "string") {
        setSelectedPath(selected);
      }
    } catch (error) {
      alert(`Failed to open directory dialog: ${error}`);
    }
  };

  const handleScan = async () => {
    if (!selectedPath) {
      alert(t("devCleaner.enterPath"));
      return;
    }

    setIsScanning(true);
    setShowConfirm(false);
    setShowFilterOptions(true);
    setScanTrigger((n) => n + 1);
  };

  useEffect(() => {
    if (scanTrigger === 0) return;

    let cancelled = false;

    const doScan = async () => {
      if (!isTauri()) {
        setCleanupMessage({
          type: "error",
          text: "Scanning is only available in the desktop app",
        });
        setIsScanning(false);
        return;
      }

      try {
        const result = await scanDevProjects(selectedPathRef.current);

        if (cancelled) return;

        setScanResult(result);
        setSelectedProjects({});

        if (result.aborted) {
          setCleanupMessage({
            type: "success",
            text: t("devCleaner.scanStopped", {
              count: result.total_projects,
              size: formatSize(result.total_cleanup_size),
            }),
          });
        } else {
          setCleanupMessage(null);
        }
      } catch (error) {
        if (cancelled) return;

        setCleanupMessage({
          type: "error",
          text: `Scan failed: ${error}`,
        });
      } finally {
        if (!cancelled) setIsScanning(false);
      }
    };

    doScan();

    return () => {
      cancelled = true;
    };
  }, [scanTrigger, t]);

  const handleStopScan = async () => {
    try {
      await stopDevProjectScan();
    } catch (error) {
      console.error("Failed to stop scan:", error);
    }
  };

  const filteredProjects = useMemo(() => {
    if (!scanResult) return [];

    let filtered = scanResult.projects;

    if (filterType !== "all") {
      filtered = filtered.filter((project) => project.project_type === filterTypeMap[filterType]);
    }

    return filtered;
  }, [filterType, scanResult]);

  const projectsByPath = useMemo(
    () =>
      new Map(
        scanResult?.projects.map((project) => [
          project.path,
          project,
        ]) ?? []
      ),
    [scanResult]
  );
  const filteredCleanupSize = useMemo(
    () => filteredProjects.reduce((sum, project) => sum + project.cleanup_potential, 0),
    [filteredProjects]
  );
  const visibleProjectPathSet = useMemo(
    () => new Set(filteredProjects.map((project) => project.path)),
    [filteredProjects]
  );
  const selectedProjectPaths = useMemo(
    () =>
      Object.entries(selectedProjects)
        .filter(([, selected]) => selected)
        .map(([path]) => path),
    [selectedProjects]
  );
  const selectedCount = selectedProjectPaths.length;
  const selectedSize = useMemo(
    () =>
      selectedProjectPaths.reduce(
        (sum, path) => sum + (projectsByPath.get(path)?.cleanup_potential || 0),
        0
      ),
    [projectsByPath, selectedProjectPaths]
  );
  const activeScanResult = scanResult;

  const handleCleanup = async () => {
    if (selectedCount === 0) {
      alert("Please select projects to clean up");
      return;
    }

    setShowConfirm(false);
    setIsCleaningUp(true);
    setCleanupMessage(null);

    try {
      const projectsToCleanup =
        activeScanResult?.projects.filter((project) => selectedProjects[project.path]) ?? [];
      const result = await runCleanupProjects(projectsToCleanup);

      if (result.success) {
        setCleanupMessage({
          type: "success",
          text: t("devCleaner.cleanupSuccess", {
            size: formatSize(result.cleaned_size),
          }),
        });
        setSelectedProjects({});
        if (rescanTimeoutRef.current !== null) {
          window.clearTimeout(rescanTimeoutRef.current);
        }
        rescanTimeoutRef.current = window.setTimeout(() => {
          rescanTimeoutRef.current = null;
          handleScan();
        }, 1000);
      } else {
        setCleanupMessage({
          type: "error",
          text: t("devCleaner.cleanupError", {
            error: result.errors?.join(", ") || "Unknown error",
          }),
        });
      }
    } catch (error) {
      setCleanupMessage({
        type: "error",
        text: t("devCleaner.cleanupError", { error: String(error) }),
      });
    } finally {
      setIsCleaningUp(false);
    }
  };

  useEffect(() => {
    setSelectedProjects((current) => {
      if (Object.keys(current).length === 0) {
        return current;
      }

      const next = Object.fromEntries(
        Object.entries(current).filter(([path, selected]) => selected && visibleProjectPathSet.has(path))
      );

      if (Object.keys(next).length === Object.keys(current).length) {
        return current;
      }

      return next;
    });
  }, [visibleProjectPathSet]);

  useEffect(() => {
    if (selectedCount === 0 && showConfirm) {
      setShowConfirm(false);
    }
  }, [selectedCount, showConfirm]);

  useEffect(() => {
    return () => {
      if (rescanTimeoutRef.current !== null) {
        window.clearTimeout(rescanTimeoutRef.current);
      }
    };
  }, []);

  const projectColumns = useMemo(() => createDevCleanerColumns(t), [t]);

  const updateSorting = (field: string, sortDescFirst = false) => {
    setSorting((current) =>
      getNextDataTableSorting(current, field, sortDescFirst)
    );
  };

  const activeSortId = sorting[0]?.id;

  return (
    <div className="h-full flex flex-col gap-4">
      <Card className="shrink-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Trash2 size={20} />
            {t("devCleaner.title")}
          </CardTitle>
          {activeScanResult && (
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              onClick={() => setShowFilterOptions((current) => !current)}
            >
              <span>{t("devCleaner.filterLabel")}</span>
              {showFilterOptions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              placeholder={t("devCleaner.enterPath")}
              value={selectedPath}
              onChange={(e) => setSelectedPath(e.target.value)}
              readOnly
              className="flex-1 min-w-0"
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
                    <Loader2 size={18} className="animate-spin mr-1" />
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

          {activeScanResult && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{t("devCleaner.projectsLabel")}</span>
                  <span className="font-semibold">{activeScanResult.total_projects}</span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{t("devCleaner.totalSize")}</span>
                  <span className="font-semibold">{formatSize(activeScanResult.total_size)}</span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-orange-700/80">{t("devCleaner.cleanupSize")}</span>
                  <span className="font-semibold text-orange-600">
                    {formatSize(activeScanResult.total_cleanup_size)}
                  </span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{t("devCleaner.scanTime")}</span>
                  <span className="font-semibold">{formatScanTime(activeScanResult.scan_time_ms)}</span>
                </div>
                <div className="h-4 w-px bg-border" />
                <span className="text-xs text-muted-foreground">
                  {t("devCleaner.filteredCleanup")}: {formatSize(filteredCleanupSize)}
                </span>
              </div>

              {showFilterOptions && (
                <div className="flex flex-wrap gap-2 pt-3 border-t">
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

      {activeScanResult && (
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          <Card className="flex-1 min-h-[200px] flex flex-col overflow-hidden">
            <CardHeader className="pb-2 shrink-0">
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
                    {t("devCleaner.sorting.current")}: {t(`devCleaner.sorting.${activeSortId ?? "name"}`)}
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
            <CardContent className={`relative flex-1 min-h-0 px-4 pb-2 ${isScanning ? "opacity-50 pointer-events-none" : ""}`}>
              {isScanning && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-muted-foreground" />
                </div>
              )}
              {filteredProjects.length > 0 ? (
                <div className="space-y-2 flex flex-col h-full">
                  <div className="flex flex-wrap gap-2 mb-2 md:hidden shrink-0">
                    <Button
                      variant={activeSortId === "cleanupSize" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateSorting("cleanupSize", true)}
                    >
                      {t("devCleaner.cleanupSize")}
                      {getDataTableSortDirection(sorting, "cleanupSize") === "asc" ? "↑" : getDataTableSortDirection(sorting, "cleanupSize") === "desc" ? "↓" : "⇅"}
                    </Button>
                    <Button
                      variant={activeSortId === "modified" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateSorting("modified", true)}
                    >
                      {t("devCleaner.lastModified")}
                      {getDataTableSortDirection(sorting, "modified") === "asc" ? "↑" : getDataTableSortDirection(sorting, "modified") === "desc" ? "↓" : "⇅"}
                    </Button>
                    <Button
                      variant={activeSortId === "name" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateSorting("name")}
                    >
                      {t("devCleaner.sorting.name")}
                      {getDataTableSortDirection(sorting, "name") === "asc" ? "↑" : getDataTableSortDirection(sorting, "name") === "desc" ? "↓" : "⇅"}
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
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="max-w-xs text-sm text-muted-foreground">{t("devCleaner.noProjects")}</p>
                </div>
              )}
            </CardContent>

            <div className="shrink-0 space-y-2 px-4 pb-4 pt-2">
              {selectedCount > 0 && !showConfirm && (
                <>
                  <p className="text-sm font-medium text-orange-700">
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
  );
}
