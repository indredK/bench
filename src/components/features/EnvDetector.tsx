import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import i18n from "@/i18n/config";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import FilterBar, { type FilterGroup } from "@/components/features/FilterBar";
import {
  StickyTable,
  StickyTableHeader,
  StickyTableBody,
  StickyTableRow,
  StickyTableHead,
  StickyTableCell,
} from "@/components/ui/StickyTable";

export interface EnvTool {
  name: string;
  version: string;
  path: string;
  size_bytes: number;
  size_display: string;
  install_time: string;
  available: boolean;
}

type EnvFilterKey = "category" | "source" | "kind";

interface EnvToolFacets {
  category: string;
  source: string;
  kind: string;
}

interface ClassifiedEnvTool {
  tool: EnvTool;
  facets: EnvToolFacets;
}

interface EnvFilterRow {
  id: string;
  model: string;
  category: string;
  source: string;
  kind: string;
}

const ENV_FILTER_GROUPS: FilterGroup<EnvFilterRow>[] = [
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
];

const CATEGORY_NAME_RULES = [
  {
    category: "ai",
    names: ["claude", "codex", "cursor", "gemini", "ollama", "opencode", "windsurf"],
  },
  {
    category: "javascript",
    names: ["bun", "corepack", "deno", "node", "npm", "npx", "pnpm", "yarn"],
  },
  {
    category: "rust",
    names: ["cargo", "clippy-driver", "cross", "rustc", "rustfmt", "rustup"],
    prefixes: ["cargo-"],
  },
  {
    category: "python",
    names: [
      "conda", "ipython", "jupyter", "pip", "pip3", "pipx", "poetry", "py",
      "pyenv", "python", "python3", "uv", "virtualenv",
    ],
  },
  {
    category: "container",
    names: ["docker", "docker-compose", "helm", "k9s", "kind", "kubectl", "minikube", "podman"],
  },
  {
    category: "cloud",
    names: [
      "ansible", "aws", "az", "doctl", "fly", "gcloud", "gh", "netlify",
      "pulumi", "terraform", "vercel", "wrangler",
    ],
  },
  {
    category: "database",
    names: ["duckdb", "mariadb", "mongosh", "mysql", "psql", "redis-cli", "sqlite3"],
  },
  {
    category: "editor",
    names: ["code", "code-insiders", "emacs", "nano", "nvim", "subl", "vim"],
  },
  {
    category: "network",
    names: ["curl", "dig", "ngrok", "nslookup", "openssl", "rsync", "scp", "sftp", "ssh", "wget"],
  },
  {
    category: "packageManager",
    names: ["apt", "apt-get", "brew", "choco", "dnf", "pacman", "scoop", "winget", "yum", "zypper"],
  },
  {
    category: "runtime",
    names: [
      "bundle", "composer", "dart", "dotnet", "flutter", "gem", "go", "gofmt",
      "gradle", "java", "javac", "kotlin", "kotlinc", "lua", "mvn", "perl",
      "php", "ruby", "swift", "swiftc",
    ],
  },
  {
    category: "build",
    names: [
      "ar", "bazel", "clang", "clang++", "cmake", "g++", "gcc", "gdb", "ld",
      "lldb", "make", "meson", "ninja", "ranlib", "xcodebuild",
    ],
  },
] as const;

/** 检测是否在 Tauri 运行时环境 */
function isTauriEnv(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

function EnvDetector({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const [tools, setTools] = useState<EnvTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<"name" | "size" | "installTime">("name");
  const [sortDesc, setSortDesc] = useState(false);
  const [scanned, setScanned] = useState(false);
  const unlistenersRef = useRef<UnlistenFn[]>([]);
  const scanningRef = useRef(false);
  const triggeredRef = useRef(false);

  const cleanupListeners = useCallback(() => {
    for (const unlisten of unlistenersRef.current) {
      unlisten();
    }
    unlistenersRef.current = [];
  }, []);

  const loadTools = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;

    setLoading(true);
    setScanning(true);
    setError("");
    setTools([]);

    cleanupListeners();

    try {
      if (!isTauriEnv()) {
        setScanned(true);
        return;
      }

      const unlisten1 = await listen<EnvTool>("env-tool-found", (event) => {
        setTools((prev) => [...prev, event.payload]);
      });
      const unlisten2 = await listen<{ unavailable: EnvTool[] }>("env-scan-done", (event) => {
        setTools((prev) => [...prev, ...event.payload.unavailable]);
        setScanning(false);
        scanningRef.current = false;
        setScanned(true);
        cleanupListeners();
      });

      unlistenersRef.current = [unlisten1, unlisten2];

      await invoke("detect_env_tools");
      setScanned(true);
    } catch (e) {
      console.warn("[EnvDetector] Failed to detect tools:", e);
      setTools([]);
      setError(t("envDetector.loadFailed"));
      setScanned(true);
      cleanupListeners();
    } finally {
      setLoading(false);
      setScanning(false);
      scanningRef.current = false;
    }
  }, [cleanupListeners, t]);

  useEffect(() => {
    if (active && isTauriEnv() && !scanned && !triggeredRef.current) {
      triggeredRef.current = true;
      loadTools();
    }
    return () => {
      cleanupListeners();
    };
  }, [active, loadTools, scanned, cleanupListeners]);

  const statusCounts = {
    total: tools.length,
    available: tools.filter((t) => t.available).length,
    unavailable: tools.filter((t) => !t.available).length,
  };

  const classifiedTools = useMemo<ClassifiedEnvTool[]>(
    () => tools.map((tool) => ({ tool, facets: classifyEnvTool(tool) })),
    [tools]
  );

  const filterRows = useMemo<EnvFilterRow[]>(
    () =>
      classifiedTools.map(({ tool, facets }) => ({
        id: tool.name,
        model: tool.name,
        ...facets,
      })),
    [classifiedTools]
  );

  const filteredTools = classifiedTools
    .filter(({ tool, facets }) => {
      const matchesSearch =
        !searchQuery ||
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.path.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilters = Object.entries(filters).every(
        ([key, value]) => !value || facets[key as EnvFilterKey] === value
      );

      return matchesSearch && matchesFilters;
    })
    .map(({ tool }) => tool)
    .sort((a, b) => {
      const dir = sortDesc ? -1 : 1;
      if (sortBy === "size") {
        return (a.size_bytes - b.size_bytes) * dir;
      }
      if (sortBy === "installTime") {
        return a.install_time.localeCompare(b.install_time) * dir;
      }
      return a.name.localeCompare(b.name) * dir;
    });

  const hasActiveResultFilter =
    searchQuery.trim().length > 0 || Object.keys(filters).length > 0;

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      const filterKey = key as EnvFilterKey;
      if (next[filterKey] === value) {
        delete next[filterKey];
      } else {
        next[filterKey] = value;
      }
      return next;
    });
  };

  const clearFilters = () => setFilters({});

  const handleSort = (field: "name" | "size" | "installTime") => {
    if (sortBy === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(field);
      setSortDesc(field === "size" || field === "installTime");
    }
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0">
          <CardTitle>{t("envDetector.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 flex flex-col">
          {error && (
            <Alert variant="destructive" className="mb-4 shrink-0">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!isTauriEnv() && !loading && tools.length === 0 && (
            <Alert className="mb-4 shrink-0 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800">
              <AlertDescription className="text-indigo-700 dark:text-indigo-300">
                {t("envDetector.browserInfo")}
              </AlertDescription>
            </Alert>
          )}

          {/* Search & Filter Bar - always visible */}
          <div className="mb-3 shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="relative flex-1 min-w-[200px]">
                <Input
                  placeholder={t("envDetector.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-3"
                  disabled={loading}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadTools}
                disabled={scanning}
              >
                {scanning ? (
                  <>
                    <span className="mr-1.5 size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {t("envDetector.scanning")}
                  </>
                ) : (
                  t("envDetector.refresh")
                )}
              </Button>
            </div>
            <div className="mb-2">
              <FilterBar
                filterGroups={ENV_FILTER_GROUPS}
                data={filterRows}
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={clearFilters}
                resultCount={filteredTools.length}
                filterTitleKey="envDetector.filters"
                clearFiltersKey="envDetector.clearFilters"
                filteredCountKey="envDetector.filteredCount"
                autoExpandHintKey="envDetector.autoExpandHint"
                pinnedHintKey="envDetector.pinnedHint"
              />
            </div>
            <div className="flex items-center justify-end">
              {scanning && (
                <span className="mr-2 size-2 animate-pulse rounded-full bg-primary" />
              )}
              <p className="text-sm text-muted-foreground">
                {t(
                  hasActiveResultFilter
                    ? "envDetector.filteredSummary"
                    : "envDetector.summary",
                  {
                    available: statusCounts.available,
                    total: statusCounts.total,
                    visible: filteredTools.length,
                  }
                )}
              </p>
            </div>
          </div>

          {/* Table Area */}
          <div className="flex-1 min-h-0">
            {loading && tools.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground rounded-lg border">
                <div className="size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
                <p>{t("envDetector.scanning")}</p>
              </div>
            ) : tools.length > 0 ? (
              <StickyTable containerClassName="h-full min-h-0 rounded-lg border">
                <StickyTableHeader>
                  <StickyTableRow>
                    <StickyTableHead isFirstColumn isFirstRow onClick={() => handleSort("name")}>
                      {t("envDetector.toolName")}
                      {sortBy === "name" ? (
                        <span className="ml-1">{sortDesc ? "↓" : "↑"}</span>
                      ) : (
                        <span className="ml-1 opacity-40">⇅</span>
                      )}
                    </StickyTableHead>
                    <StickyTableHead isFirstRow>{t("envDetector.version")}</StickyTableHead>
                    <StickyTableHead isFirstRow>{t("envDetector.path")}</StickyTableHead>
                    <StickyTableHead isFirstRow onClick={() => handleSort("size")} className="text-right">
                      {t("envDetector.size")}
                      {sortBy === "size" ? (
                        <span className="ml-1">{sortDesc ? "↓" : "↑"}</span>
                      ) : (
                        <span className="ml-1 opacity-40">⇅</span>
                      )}
                    </StickyTableHead>
                    <StickyTableHead isFirstRow onClick={() => handleSort("installTime")} className="text-right">
                      {t("envDetector.installTime")}
                      {sortBy === "installTime" ? (
                        <span className="ml-1">{sortDesc ? "↓" : "↑"}</span>
                      ) : (
                        <span className="ml-1 opacity-40">⇅</span>
                      )}
                    </StickyTableHead>
                    <StickyTableHead isFirstRow className="text-center">{t("envDetector.status")}</StickyTableHead>
                  </StickyTableRow>
                </StickyTableHeader>
                <StickyTableBody>
                  {filteredTools.map((tool) => (
                    <StickyTableRow key={tool.name}>
                      <StickyTableCell isFirstColumn>{tool.name}</StickyTableCell>
                      <StickyTableCell className="max-w-[200px] truncate text-muted-foreground">
                        {tool.available ? tool.version || "—" : t("envDetector.notFound")}
                      </StickyTableCell>
                      <StickyTableCell className="max-w-[280px] truncate font-mono text-xs text-muted-foreground">
                        {tool.available ? tool.path : "—"}
                      </StickyTableCell>
                      <StickyTableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                        {tool.available ? tool.size_display : "—"}
                      </StickyTableCell>
                      <StickyTableCell className="whitespace-nowrap text-right text-muted-foreground">
                        {tool.available ? tool.install_time : "—"}
                      </StickyTableCell>
                      <StickyTableCell className="text-center">
                        {tool.available ? (
                          <Badge
                            variant="default"
                            className="bg-green-600/20 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                          >
                            ✓
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-muted/50 text-muted-foreground"
                          >
                            ✕
                          </Badge>
                        )}
                      </StickyTableCell>
                    </StickyTableRow>
                  ))}
                </StickyTableBody>
              </StickyTable>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground rounded-lg border">
                <p>{scanned ? t("envDetector.empty") : t("envDetector.startHint")}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function classifyEnvTool(tool: EnvTool): EnvToolFacets {
  const source = classifySource(tool.path);
  return {
    category: classifyCategory(tool.name, source),
    source,
    kind: classifyKind(tool.path),
  };
}

function classifyCategory(name: string, source: string): string {
  const normalized = name.toLowerCase();

  for (const rule of CATEGORY_NAME_RULES) {
    if ((rule.names as readonly string[]).includes(normalized)) {
      return rule.category;
    }

    if (
      "prefixes" in rule &&
      (rule.prefixes as readonly string[] | undefined)?.some((prefix) =>
        normalized.startsWith(prefix)
      )
    ) {
      return rule.category;
    }
  }

  if (source === "node" || source === "volta") return "javascript";
  if (source === "cargo") return "rust";
  if (source === "go") return "runtime";

  return "other";
}

function classifySource(path: string): string {
  const normalized = normalizeToolPath(path);

  if (normalized.includes("/node_modules/") || normalized.endsWith("/npm")) return "node";
  if (normalized.includes("/.cargo/bin") || normalized.includes("/.rustup/")) return "cargo";
  if (normalized.includes("/opt/homebrew/") || normalized.includes("/homebrew/")) return "homebrew";
  if (normalized.includes("/.volta/")) return "volta";
  if (normalized.includes("/.asdf/")) return "asdf";
  if (normalized.includes("/mise/")) return "mise";
  if (normalized.includes("/scoop/")) return "scoop";
  if (normalized.includes("/chocolatey/")) return "chocolatey";
  if (normalized.includes("/go/bin")) return "go";
  if (normalized.includes("/.local/bin")) return "local";

  return "path";
}

function classifyKind(path: string): string {
  const normalized = normalizeToolPath(path);
  const extension = normalized.split(".").pop();

  if (extension && ["cmd", "bat", "ps1"].includes(extension)) return "shim";
  if (extension && ["js", "mjs", "cjs", "ts", "py", "rb", "sh"].includes(extension)) return "script";
  return "executable";
}

function normalizeToolPath(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

function formatEnvFilterValue(
  key: EnvFilterKey,
  value: string
): string {
  return i18n.t(`envDetector.filterValues.${key}.${value}`);
}

export default EnvDetector;
