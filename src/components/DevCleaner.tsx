import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, FolderOpen, Trash2, AlertTriangle, StopCircle, ChevronDown, ChevronUp } from "lucide-react";

interface ProjectInfo {
  path: string;
  name: string;
  total_size: number;
  target_size: number;
  last_modified: number;
  dependencies_count: number;
  project_type: string;
  cleanup_potential: number;
}

interface ScanResult {
  total_projects: number;
  total_size: number;
  total_cleanup_size: number;
  projects: ProjectInfo[];
  scan_time_ms: number;
  aborted: boolean;
}

type SortBy = "size" | "modified" | "name";
type FilterType = "all" | "nodejs" | "python" | "rust";

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

export default function DevCleaner() {
  const { t } = useTranslation();
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("size");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [scanTrigger, setScanTrigger] = useState(0);
  const [selectAllState, setSelectAllState] = useState<"none" | "partial" | "all">("none");
  const selectedPathRef = useRef(selectedPath);
  const selectAllRef = useRef<HTMLInputElement>(null);

  selectedPathRef.current = selectedPath;

  const handleSelectPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Directory to Scan",
      });
      
      if (selected && typeof selected === 'string') {
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
    setScanTrigger((n) => n + 1);
  };

  useEffect(() => {
    if (scanTrigger === 0) return;

    let cancelled = false;

    const doScan = async () => {
      try {
        const result: ScanResult = await invoke("scan_dev_projects", {
          rootPath: selectedPathRef.current,
          maxDepth: 10,
          minSizeMb: 0,
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
  }, [scanTrigger]);

  const handleStopScan = async () => {
    try {
      await invoke("stop_scan");
    } catch (error) {
      console.error("Failed to stop scan:", error);
    }
  };

  const handleSelectAll = () => {
    const filtered = getFilteredAndSortedProjects();
    const filteredPaths = new Set(filtered.map((p) => p.path));

    if (selectAllState === "all") {
      const newSelected = new Set(selectedProjects);
      for (const path of filteredPaths) {
        newSelected.delete(path);
      }
      setSelectedProjects(newSelected);
      setSelectAllState("none");
      if (selectAllRef.current) {
        selectAllRef.current.indeterminate = false;
      }
    } else {
      const newSelected = new Set(selectedProjects);
      for (const path of filteredPaths) {
        newSelected.add(path);
      }
      setSelectedProjects(newSelected);
      setSelectAllState("all");
      if (selectAllRef.current) {
        selectAllRef.current.indeterminate = false;
      }
    }
  };

  const handleProjectToggle = (path: string) => {
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedProjects(newSelected);
  };

  const getFilteredAndSortedProjects = (): ProjectInfo[] => {
    if (!scanResult) return [];

    let filtered = scanResult.projects;

    // Apply filter
    if (filterType !== "all") {
      const typeMap: Record<FilterType, string> = {
        all: "",
        nodejs: "NodeJs",
        python: "Python",
        rust: "Rust",
      };
      filtered = filtered.filter((p) => p.project_type === typeMap[filterType]);
    }

    // Apply sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "size":
          return b.cleanup_potential - a.cleanup_potential;
        case "modified":
          return b.last_modified - a.last_modified;
        case "name":
          return a.name.localeCompare(b.name);
      }
    });

    return sorted;
  };

  const handleCleanup = async () => {
    if (selectedProjects.size === 0) {
      alert("Please select projects to clean up");
      return;
    }

    setShowConfirm(false);
    setIsCleaningUp(true);
    setCleanupMessage(null);

    try {
      const result: any = await invoke("cleanup_projects", {
        paths: Array.from(selectedProjects),
        targets: ["node_modules", "target", ".venv", "venv"],
        backup: false,
      });

      if (result.success) {
        setCleanupMessage({
          type: "success",
          text: t("devCleaner.cleanupSuccess", {
            size: formatSize(result.cleaned_size),
          }),
        });
        setSelectedProjects(new Set());
        // Re-scan to update results
        setTimeout(() => handleScan(), 1000);
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

  const filteredProjects = getFilteredAndSortedProjects();
  const selectedCount = selectedProjects.size;
  const selectedFilteredCount = filteredProjects.filter((p) => selectedProjects.has(p.path)).length;
  const selectedSize = Array.from(selectedProjects).reduce((sum, path) => {
    const project = scanResult?.projects.find((p) => p.path === path);
    return sum + (project?.cleanup_potential || 0);
  }, 0);

  useEffect(() => {
    if (!selectAllRef.current) return;

    if (filteredProjects.length === 0) {
      setSelectAllState("none");
      selectAllRef.current.indeterminate = false;
    } else if (selectedFilteredCount === filteredProjects.length) {
      setSelectAllState("all");
      selectAllRef.current.indeterminate = false;
    } else if (selectedFilteredCount > 0) {
      setSelectAllState("partial");
      selectAllRef.current.indeterminate = true;
    } else {
      setSelectAllState("none");
      selectAllRef.current.indeterminate = false;
    }
  }, [selectedFilteredCount, filteredProjects.length]);

  return (
    <div className="h-full flex flex-col gap-4 p-2 overflow-auto">
      {/* Header */}
      <Card className="shrink-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 size={20} />
            {t("devCleaner.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Path + Scan Row */}
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("devCleaner.enterPath")}
              value={selectedPath}
              onChange={(e) => setSelectedPath(e.target.value)}
              readOnly
              className="flex-1 min-w-0"
            />
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
                <Button
                  onClick={handleScan}
                  disabled
                  className="shrink-0"
                >
                  <Loader2 size={18} className="animate-spin mr-1" />
                  <span className="hidden sm:inline">{t("devCleaner.scanning")}</span>
                </Button>
              </>
            ) : (
              <Button
                onClick={handleScan}
                disabled={!selectedPath}
                className="shrink-0"
              >
                {t("devCleaner.startScan")}
              </Button>
            )}
          </div>

          {/* Messages */}
          {cleanupMessage && (
            <Alert variant={cleanupMessage.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{cleanupMessage.text}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Scan Results */}
      {scanResult && (
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {isScanning && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-accent rounded-md px-3 py-2">
              <Loader2 size={14} className="animate-spin" />
              {t("devCleaner.refreshing")}
            </div>
          )}
          {/* Summary Card */}
          <Card className="shrink-0">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="grid grid-cols-3 gap-4 flex-1">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("devCleaner.projectsFound", { count: scanResult.total_projects })}</p>
                    <p className="text-lg font-semibold">{scanResult.total_projects}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("devCleaner.totalSize")}</p>
                    <p className="text-lg font-semibold">{formatSize(scanResult.total_size)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("devCleaner.cleanupSize")}</p>
                    <p className="text-lg font-semibold text-orange-600">{formatSize(scanResult.total_cleanup_size)}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 ml-2"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </Button>
              </div>
              {showFilters && (
                <>
                  <hr />
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{t("devCleaner.sorting.size")}</span>
                      {["size", "modified", "name"].map((sort) => (
                        <Button
                          key={sort}
                          variant={sortBy === sort ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSortBy(sort as SortBy)}
                        >
                          {t(`devCleaner.sorting.${sort}`)}
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{t("devCleaner.filterLabel")}</span>
                      {["all", "nodejs", "python", "rust"].map((filter) => (
                        <Button
                          key={filter}
                          variant={filterType === filter ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFilterType(filter as FilterType)}
                        >
                          {t(`devCleaner.filter.${filter}`)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Projects List */}
          <Card className="flex-1 min-h-[200px] flex flex-col overflow-hidden">
            <CardHeader className="pb-2 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {filteredProjects.length > 0 && (
                    <div className="flex items-center gap-2 select-none">
                      <input
                        type="checkbox"
                        checked={selectAllState === "all"}
                        ref={selectAllRef}
                        onChange={handleSelectAll}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="text-sm text-muted-foreground cursor-pointer bg-transparent border-none p-0 m-0"
                      >
                        {selectAllState === "all"
                          ? t("devCleaner.deselectAll")
                          : t("devCleaner.selectAll")}
                      </button>
                    </div>
                  )}
                  {!filteredProjects.length && (
                    <CardTitle className="text-base">{t("devCleaner.selectProjects")}</CardTitle>
                  )}
                </div>
                <Badge variant="secondary">
                  {selectedCount} / {filteredProjects.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto px-4 pb-2">
              {filteredProjects.length > 0 ? (
                <div className="space-y-2">
                  {filteredProjects.map((project) => (
                    <div
                      key={project.path}
                      className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent cursor-pointer"
                      onClick={() => handleProjectToggle(project.path)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjects.has(project.path)}
                        onChange={() => handleProjectToggle(project.path)}
                        className="mt-1 w-4 h-4 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{project.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{project.path}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {project.project_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatSize(project.total_size)}
                          </span>
                          <span className="text-xs text-orange-600 font-medium">
                            {t("devCleaner.cleanupSize")}: {formatSize(project.cleanup_potential)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(project.last_modified)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">{t("devCleaner.noProjects")}</p>
                </div>
              )}
            </CardContent>

          {/* Action Bar */}
          <div className="shrink-0 px-4 pb-4 pt-2 space-y-2">
            {selectedCount > 0 && !showConfirm && (
              <>
                <p className="text-sm font-medium text-orange-700">
                  {t("devCleaner.confirmMessage", {
                    count: selectedCount,
                    size: formatSize(selectedSize),
                  })}
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
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
              <div className="flex flex-col sm:flex-row gap-2">
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
                          <Loader2 size={18} className="animate-spin mr-2" />
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
