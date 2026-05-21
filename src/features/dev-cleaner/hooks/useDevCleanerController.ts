import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getNextDataTableSorting } from "@/components/ui/DataTable";
import { createDevCleanerColumns } from "@/features/dev-cleaner/columns";
import { devCleanerOperations } from "@/features/dev-cleaner/operations";
import { useContextMenuRegistration } from "@/shared/context-menu/useContextMenuRegistration";
import type { ContextMenuConfig, ContextMenuRegistration } from "@/shared/context-menu/types";
import { useDevCleanerStore, filterTypeMap } from "@/features/dev-cleaner/store";
import type { ProjectInfo } from "@/lib/tauri/types";
import { canUseDesktopFeatures } from "@/platform/capabilities";

export function useDevCleanerController() {
  const { t } = useTranslation();
  const canUsePlatformFeatures = canUseDesktopFeatures();

  const selectedPath = useDevCleanerStore((s) => s.selectedPath);
  const isScanning = useDevCleanerStore((s) => s.isScanning);
  const scanResult = useDevCleanerStore((s) => s.scanResult);
  const selectedProjects = useDevCleanerStore((s) => s.selectedProjects);
  const isCleaningUp = useDevCleanerStore((s) => s.isCleaningUp);
  const cleanupMessage = useDevCleanerStore((s) => s.cleanupMessage);
  const sorting = useDevCleanerStore((s) => s.sorting);
  const filterType = useDevCleanerStore((s) => s.filterType);
  const showConfirm = useDevCleanerStore((s) => s.showConfirm);
  const showFilterOptions = useDevCleanerStore((s) => s.showFilterOptions);

  const setSelectedPath = useDevCleanerStore((s) => s.setSelectedPath);
  const setFilterType = useDevCleanerStore((s) => s.setFilterType);
  const setShowConfirm = useDevCleanerStore((s) => s.setShowConfirm);
  const setShowFilterOptions = useDevCleanerStore((s) => s.setShowFilterOptions);
  const setSorting = useDevCleanerStore((s) => s.setSorting);
  const setSelectedProjects = useDevCleanerStore((s) => s.setSelectedProjects);
  const handleSelectPath = devCleanerOperations.selectPath;
  const handleScan = devCleanerOperations.scan;
  const handleStopScan = devCleanerOperations.stopScan;
  const handleCleanup = devCleanerOperations.cleanup;

  const filteredProjects = useMemo(() => {
    if (!scanResult) return [];
    let filtered = scanResult.projects;
    if (filterType !== "all") {
      filtered = filtered.filter((project) => project.project_type === filterTypeMap[filterType]);
    }
    return filtered;
  }, [filterType, scanResult]);

  const projectsByPath = useMemo(
    () => new Map(scanResult?.projects.map((project) => [project.path, project]) ?? []),
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

  useEffect(() => {
    setSelectedProjects((current) => {
      if (Object.keys(current).length === 0) return current;
      const next = Object.fromEntries(
        Object.entries(current).filter(([path, selected]) => selected && visibleProjectPathSet.has(path))
      );
      if (Object.keys(next).length === Object.keys(current).length) return current;
      return next;
    });
  }, [visibleProjectPathSet, setSelectedProjects]);

  useEffect(() => {
    if (selectedCount === 0 && showConfirm) {
      setShowConfirm(false);
    }
  }, [selectedCount, showConfirm, setShowConfirm]);

  const projectColumns = useMemo(() => createDevCleanerColumns(t), [t]);

  const updateSorting = useCallback(
    (field: string, sortDescFirst = false) => {
      setSorting((current) => getNextDataTableSorting(current, field, sortDescFirst));
    },
    [setSorting]
  );

  const activeSortId = sorting[0]?.id;

  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      // clipboard write may fail in some environments
    }
  }, []);

  const getRowAttributes = useCallback(
    (project: ProjectInfo) => ({
      "data-context-type": "dev-cleaner-row",
      "data-row-id": project.path,
    }),
    []
  );

  const devRegistration = useMemo(
    () => ({
      id: "dev-cleaner-row",
      selector: '[data-context-type="dev-cleaner-row"]',
      resolveContext: (target: HTMLElement) => target.dataset.rowId || null,
      buildMenu: (ctx: unknown): ContextMenuConfig | null => {
        const path = ctx as string;
        if (!path) return null;
        const project = projectsByPath.get(path);
        if (!project) return null;
        return {
          id: "dev-cleaner-menu",
          items: [
            {
              id: "copy-path",
              label: t("devCleaner.copyPath"),
              icon: undefined,
              onClick: () => handleCopyPath(project.path),
            },
          ],
        };
      },
    } satisfies ContextMenuRegistration),
    [projectsByPath, t, handleCopyPath]
  );

  useContextMenuRegistration(devRegistration);

  return {
    t,
    canUsePlatformFeatures,
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
  };
}

export type DevCleanerController = ReturnType<typeof useDevCleanerController>;
