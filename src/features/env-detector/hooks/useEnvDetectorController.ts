/**
 * Controller / 控制器: bind view events and use cases; 连接视图事件与用例.
 */
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import type { FilterGroup } from "@/shared/compare/FilterBar";
import { useContextMenuRegistration } from "@/shared/context-menu/useContextMenuRegistration";
import type { ContextMenuConfig, ContextMenuRegistration } from "@/shared/context-menu/types";
import { createEnvDetectorColumns } from "@/features/env-detector/columns";
import { envDetectorUseCases } from "@/features/env-detector/services/env-detector.use-cases";
import { EnvScanTimeoutError } from "@/features/env-detector/services/env-detector.repository";
import { useEnvDetectorStore } from "@/features/env-detector/store";
import { registerFeatureRefresh } from "@/features/refresh";
import type { EnvTool } from "@/lib/tauri/types";
import { canUseDesktopFeatures } from "@/platform/capabilities";
import { writeClipboardText } from "@/platform/clipboard";

type EnvFilterKey = "category" | "source" | "kind" | "status";

interface EnvFilterRow {
  id: string;
  model: string;
  category: string;
  source: string;
  kind: string;
  status: string;
}

function formatEnvFilterValue(key: EnvFilterKey, value: string): string {
  return i18n.t(`envDetector.filterValues.${key}.${value}`);
}

function isDeveloperSignal(tool: EnvTool): boolean {
  return !(tool.detector === "path-scan" && tool.category === "other");
}

export function useEnvDetectorController(active: boolean) {
  const { t } = useTranslation();
  const canUsePlatformFeatures = canUseDesktopFeatures();

  const tools = useEnvDetectorStore((s) => s.tools);
  const loading = useEnvDetectorStore((s) => s.loading);
  const scanning = useEnvDetectorStore((s) => s.scanning);
  const error = useEnvDetectorStore((s) => s.error);
  const searchQuery = useEnvDetectorStore((s) => s.searchQuery);
  const filters = useEnvDetectorStore((s) => s.filters);
  const sorting = useEnvDetectorStore((s) => s.sorting);
  const scanned = useEnvDetectorStore((s) => s.scanned);
  const showAllCommands = useEnvDetectorStore((s) => s.showAllCommands);
  const viewMode = useEnvDetectorStore((s) => s.viewMode);

  const setSearchQuery = useEnvDetectorStore((s) => s.setSearchQuery);
  const setFilters = useEnvDetectorStore((s) => s.setFilters);
  const clearFilters = useEnvDetectorStore((s) => s.clearFilters);
  const setSorting = useEnvDetectorStore((s) => s.setSorting);
  const setShowAllCommands = useEnvDetectorStore((s) => s.setShowAllCommands);
  const setViewMode = useEnvDetectorStore((s) => s.setViewMode);

  const loadTools = useCallback(async () => {
    const { scanning: currentScanning } = useEnvDetectorStore.getState();
    if (currentScanning) return;

    useEnvDetectorStore.setState({ loading: true, scanning: true, error: "", tools: [] });

    if (!envDetectorUseCases.isAvailable()) {
      useEnvDetectorStore.setState({ scanned: true, loading: false, scanning: false });
      return;
    }

    try {
      const payload = await envDetectorUseCases.scanEnvTools();
      useEnvDetectorStore.setState({
        tools: [...payload.tools, ...payload.unavailable],
        loading: false,
        scanning: false,
        scanned: true,
      });
    } catch (error) {
      console.warn("[EnvDetector] Failed to detect tools:", error);
      const errorKey =
        error instanceof EnvScanTimeoutError
          ? "envDetector.scanTimedOut"
          : "envDetector.loadFailed";
      useEnvDetectorStore.setState({
        tools: [],
        error: i18n.t(errorKey),
        loading: false,
        scanning: false,
        scanned: true,
      });
    }
  }, []);

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      setFilters((current) => {
        if (current[key] === value) {
          const next = { ...current };
          delete next[key];
          return next;
        }
        return { ...current, [key]: value };
      });
    },
    [setFilters]
  );

  const handleCopyToClipboard = useCallback(async (text: string) => {
    try {
      await writeClipboardText(text);
    } catch {
      /* clipboard may be unavailable */
    }
  }, []);

  const getRowAttributes = useCallback((tool: EnvTool) => ({
    "data-context-type": "env-detector-row",
    "data-row-id": tool.path || tool.name,
  }), []);

  const envRegistration = useMemo(() => ({
    id: "env-detector-row",
    selector: '[data-context-type="env-detector-row"]',
    resolveContext: (target: HTMLElement) => target.dataset.rowId || null,
    buildMenu: (ctx: unknown): ContextMenuConfig | null => {
      const key = ctx as string;
      if (!key) return null;
      const tool = tools.find((item) => (item.path || item.name) === key);
      if (!tool) return null;
      const items: ContextMenuConfig["items"] = [
        {
          id: "copy-path",
          label: t("envDetector.copyPath"),
          icon: undefined,
          onClick: () => handleCopyToClipboard(tool.path || tool.name),
        },
      ];
      if (tool.version) {
        items.push({
          id: "copy-version",
          label: t("envDetector.copyVersion"),
          icon: undefined,
          onClick: () => handleCopyToClipboard(tool.version),
        });
      }
      return { id: "env-detector-menu", items };
    },
  } satisfies ContextMenuRegistration), [tools, t, handleCopyToClipboard]);

  useContextMenuRegistration(envRegistration);

  useEffect(() => {
    if (active && canUsePlatformFeatures && !scanned) {
      void loadTools();
    }
  }, [active, canUsePlatformFeatures, loadTools, scanned]);

  useEffect(() => registerFeatureRefresh("env-detector", loadTools), [loadTools]);

  const filterGroups = useMemo<FilterGroup<EnvFilterRow>[]>(() => [
    {
      key: "category",
      label: "envDetector.filterGroups.category",
      format: (value) => formatEnvFilterValue("category", String(value)),
    },
    {
      key: "source",
      label: "envDetector.filterGroups.source",
      format: (value) => formatEnvFilterValue("source", String(value)),
    },
    {
      key: "kind",
      label: "envDetector.filterGroups.kind",
      format: (value) => formatEnvFilterValue("kind", String(value)),
    },
    {
      key: "status",
      label: "envDetector.filterGroups.status",
      format: (value) => formatEnvFilterValue("status", String(value)),
    },
  ], []);

  const statusCounts = useMemo(() => ({
    total: tools.length,
    available: tools.filter((tool) => tool.available).length,
    unavailable: tools.filter((tool) => !tool.available).length,
  }), [tools]);

  const filterRows = useMemo<EnvFilterRow[]>(
    () =>
      tools.map((tool) => ({
        id: tool.name,
        model: tool.name,
        category: tool.category,
        source: tool.source,
        kind: tool.kind,
        status: tool.status,
      })),
    [tools]
  );

  const matchingTools = useMemo(
    () =>
      tools.filter((tool) => {
        const matchesSearch =
          !searchQuery ||
          tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tool.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
          tool.detector.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesFilters = Object.entries(filters).every(
          ([key, value]) => !value || String(tool[key as EnvFilterKey]) === value
        );

        return matchesSearch && matchesFilters;
      }),
    [filters, searchQuery, tools]
  );

  const missingTools = useMemo(
    () => matchingTools.filter((tool) => !tool.available),
    [matchingTools]
  );

  const displayedTools = useMemo(
    () =>
      matchingTools.filter((tool) => {
        if (!tool.available) return false;
        return showAllCommands || isDeveloperSignal(tool);
      }),
    [matchingTools, showAllCommands]
  );

  const hasActiveResultFilter =
    searchQuery.trim().length > 0 || Object.keys(filters).length > 0;

  const tableColumns = useMemo(() => createEnvDetectorColumns(t), [t]);

  return {
    t,
    canUsePlatformFeatures,
    tools,
    loading,
    scanning,
    error,
    searchQuery,
    filters,
    sorting,
    scanned,
    showAllCommands,
    viewMode,
    filterGroups,
    statusCounts,
    filterRows,
    missingTools,
    displayedTools,
    hasActiveResultFilter,
    tableColumns,
    setSearchQuery,
    setSorting,
    setShowAllCommands,
    setViewMode,
    handleFilterChange,
    clearFilters,
    loadTools,
    getRowAttributes,
  };
}

export type EnvDetectorController = ReturnType<typeof useEnvDetectorController>;
