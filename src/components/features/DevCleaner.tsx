import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  StickyDataTable,
  getNextStickyDataTableSortState,
  getStickyDataTableSortDirection,
  type StickyDataTableColumn,
  type StickyDataTableSortState,
} from "@/components/ui/StickyDataTable";
import {
  StickyTableText,
} from "@/components/ui/StickyTable";
import { formatDate, formatSize } from "@/lib/utils";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Loader2,
  StopCircle,
  Trash2,
} from "lucide-react";

interface ProjectInfo {
  path: string;
  name: string;
  total_size: number;
  target_size: number;
  last_modified: number;
  dependencies_count: number;
  project_type: "NodeJs" | "Python" | "Rust" | "Go" | "General";
  cleanup_potential: number;
  cleanup_paths?: string[];
}

interface CleanupResult {
  success: boolean;
  cleaned_size: number;
  errors: string[];
}

interface ScanResult {
  total_projects: number;
  total_size: number;
  total_cleanup_size: number;
  projects: ProjectInfo[];
  scan_time_ms: number;
  aborted: boolean;
}

type SortBy = "name" | "totalSize" | "cleanupSize" | "modified";
type FilterType = "all" | "nodejs" | "python" | "rust" | "go";

const filterOptions: FilterType[] = ["all", "nodejs", "python", "rust", "go"];
const filterTypeMap: Record<Exclude<FilterType, "all">, ProjectInfo["project_type"]> = {
  nodejs: "NodeJs",
  python: "Python",
  rust: "Rust",
  go: "Go",
};
const projectTypeMap: Partial<Record<ProjectInfo["project_type"], Exclude<FilterType, "all">>> = {
  NodeJs: "nodejs",
  Python: "python",
  Rust: "rust",
  Go: "go",
};
const naturalTextComparator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
const MAX_VISIBLE_PATH_LENGTH = 56;

function compareProjectIdentity(left: ProjectInfo, right: ProjectInfo) {
  return (
    naturalTextComparator.compare(left.name, right.name) ||
    naturalTextComparator.compare(left.path, right.path)
  );
}

function compactPath(path: string, maxLength = MAX_VISIBLE_PATH_LENGTH) {
  const separator = path.includes("\\") ? "\\" : "/";
  const parts = path.split(/[/\\]+/).filter(Boolean);
  const hasDrivePrefix = /^[A-Za-z]:/.test(path);
  const hasRootPrefix = separator === "/" && path.startsWith("/");

  if (path.length <= maxLength || parts.length <= 4) {
    return path;
  }

  const prefix = hasDrivePrefix
    ? `${parts[0]}${separator}`
    : hasRootPrefix
      ? separator
      : `${parts[0]}${separator}`;
  const maxTailSegments = Math.min(4, parts.length - 1);

  for (let tailSegments = maxTailSegments; tailSegments >= 2; tailSegments -= 1) {
    const tail = parts.slice(-tailSegments).join(separator);
    const candidate = `${prefix}...${separator}${tail}`;

    if (candidate.length <= maxLength || tailSegments === 2) {
      return candidate;
    }
  }

  return path;
}

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
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [sorting, setSorting] = useState<StickyDataTableSortState<SortBy>>({
    columnId: "cleanupSize",
    direction: "desc",
  });
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
        const result: ScanResult = await invoke("scan_dev_projects", {
          rootPath: selectedPathRef.current,
        });

        if (cancelled) return;

        setScanResult(result);
        setSelectedProjects(new Set());

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
      await invoke("stop_scan");
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
  const visibleProjectPaths = useMemo(
    () => filteredProjects.map((project) => project.path),
    [filteredProjects]
  );
  const visibleProjectPathSet = useMemo(
    () => new Set(visibleProjectPaths),
    [visibleProjectPaths]
  );
  const selectedCount = selectedProjects.size;
  const selectedSize = useMemo(
    () =>
      Array.from(selectedProjects).reduce(
        (sum, path) => sum + (projectsByPath.get(path)?.cleanup_potential || 0),
        0
      ),
    [projectsByPath, selectedProjects]
  );
  const activeScanResult = scanResult;

  const handleCleanup = async () => {
    if (selectedProjects.size === 0) {
      alert("Please select projects to clean up");
      return;
    }

    setShowConfirm(false);
    setIsCleaningUp(true);
    setCleanupMessage(null);

    try {
      const cleanupProjects =
        activeScanResult?.projects.filter((project) => selectedProjects.has(project.path)) ?? [];
      const result: CleanupResult = await invoke("cleanup_projects", {
        projects: cleanupProjects,
      });

      if (result.success) {
        setCleanupMessage({
          type: "success",
          text: t("devCleaner.cleanupSuccess", {
            size: formatSize(result.cleaned_size),
          }),
        });
        setSelectedProjects(new Set());
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
      if (current.size === 0) {
        return current;
      }

      const next = new Set(
        Array.from(current).filter((path) => visibleProjectPathSet.has(path))
      );

      if (next.size === current.size) {
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

  const projectColumns = useMemo<StickyDataTableColumn<ProjectInfo, SortBy>[]>(() => [
    {
      id: "name",
      header: t("devCleaner.column.project"),
      width: "44%",
      minWidth: "280px",
      sortable: true,
      renderCell: (project) => (
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <StickyTableText className="font-medium">
              {project.name}
            </StickyTableText>
            <Badge variant="outline" className="shrink-0 text-xs">
              {projectTypeMap[project.project_type]
                ? t(`devCleaner.filter.${projectTypeMap[project.project_type]}`)
                : project.project_type}
            </Badge>
          </div>
          <StickyTableText
            className="text-xs text-muted-foreground"
            title={project.path}
          >
            {compactPath(project.path)}
          </StickyTableText>
          {project.dependencies_count > 0 && (
            <span className="text-xs text-muted-foreground">
              {t("devCleaner.dependencies")}: {project.dependencies_count}
            </span>
          )}
        </div>
      ),
      compareFn: compareProjectIdentity,
    },
    {
      id: "totalSize",
      header: t("devCleaner.totalSize"),
      width: "120px",
      align: "right",
      sortable: true,
      renderCell: (project) => <span className="text-sm">{formatSize(project.total_size)}</span>,
      compareFn: (left, right) =>
        left.total_size - right.total_size || compareProjectIdentity(left, right),
      sortDescFirst: true,
    },
    {
      id: "cleanupSize",
      header: t("devCleaner.cleanupSize"),
      width: "150px",
      align: "right",
      sortable: true,
      renderCell: (project) => (
        <div className="inline-block rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-1.5">
          <p className="text-[10px] text-orange-700/80">
            {t("devCleaner.cleanupSize")}
          </p>
          <p className="text-sm font-semibold text-orange-600">
            {formatSize(project.cleanup_potential)}
          </p>
        </div>
      ),
      compareFn: (left, right) =>
        left.cleanup_potential - right.cleanup_potential || compareProjectIdentity(left, right),
      sortDescFirst: true,
    },
    {
      id: "modified",
      header: t("devCleaner.lastModified"),
      width: "170px",
      align: "right",
      sortable: true,
      renderCell: (project) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(project.last_modified)}
        </span>
      ),
      compareFn: (left, right) =>
        left.last_modified - right.last_modified || compareProjectIdentity(left, right),
      sortDescFirst: true,
    },
  ], [t]);

  const updateSorting = (field: SortBy, sortDescFirst = false) => {
    setSorting((current) =>
      getNextStickyDataTableSortState(current, field, sortDescFirst)
    );
  };

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
                    {t("devCleaner.sorting.current")}: {t(`devCleaner.sorting.${sorting.columnId}`)}
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
                      variant={sorting.columnId === "cleanupSize" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateSorting("cleanupSize", true)}
                    >
                      {t("devCleaner.cleanupSize")}
                      {getStickyDataTableSortDirection(sorting, "cleanupSize") === "asc" ? "↑" : getStickyDataTableSortDirection(sorting, "cleanupSize") === "desc" ? "↓" : "⇅"}
                    </Button>
                    <Button
                      variant={sorting.columnId === "modified" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateSorting("modified", true)}
                    >
                      {t("devCleaner.lastModified")}
                      {getStickyDataTableSortDirection(sorting, "modified") === "asc" ? "↑" : getStickyDataTableSortDirection(sorting, "modified") === "desc" ? "↓" : "⇅"}
                    </Button>
                    <Button
                      variant={sorting.columnId === "name" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateSorting("name")}
                    >
                      {t("devCleaner.sorting.name")}
                      {getStickyDataTableSortDirection(sorting, "name") === "asc" ? "↑" : getStickyDataTableSortDirection(sorting, "name") === "desc" ? "↓" : "⇅"}
                    </Button>
                  </div>
                  <StickyDataTable
                    data={filteredProjects}
                    columns={projectColumns}
                    getRowId={(project) => project.path}
                    sorting={{
                      state: sorting,
                      onChange: setSorting,
                    }}
                    selection={{
                      selectedRowIds: selectedProjects,
                      onChange: setSelectedProjects,
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
                      onClick={() => setSelectedProjects(new Set())}
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
