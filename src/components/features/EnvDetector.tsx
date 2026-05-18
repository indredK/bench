import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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

/** 检测是否在 Tauri 运行时环境 */
function isTauriEnv(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

function EnvDetector({ active: _active }: { active: boolean }) {
  const { t } = useTranslation();
  const [tools, setTools] = useState<EnvTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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
      if (isTauriEnv()) {
        const unlisten1 = await listen<EnvTool>("env-tool-found", (event) => {
          setTools((prev) => [...prev, event.payload]);
        });
        const unlisten2 = await listen<{ unavailable: EnvTool[] }>("env-scan-done", (event) => {
          setTools((prev) => [...prev, ...event.payload.unavailable]);
          setScanning(false);
          scanningRef.current = false;
          cleanupListeners();
        });

        unlistenersRef.current = [unlisten1, unlisten2];

        await invoke("detect_env_tools");
      }
      setScanned(true);
    } catch (e) {
      console.warn("[EnvDetector] Failed to detect tools:", e);
      setTools([]);
      setScanning(false);
      scanningRef.current = false;
      setScanned(true);
    } finally {
      setLoading(false);
    }
  }, [cleanupListeners]);

  useEffect(() => {
    if (isTauriEnv() && !scanned && !triggeredRef.current) {
      triggeredRef.current = true;
      loadTools();
    }
    return () => {
      cleanupListeners();
    };
  }, [loadTools, scanned, cleanupListeners]);

  const statusCounts = {
    total: tools.length,
    available: tools.filter((t) => t.available).length,
    unavailable: tools.filter((t) => !t.available).length,
  };

  const filteredTools = tools
    .filter((tool) => !searchQuery || tool.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
            <div className="flex items-center justify-end">
              {scanning && (
                <span className="mr-2 size-2 animate-pulse rounded-full bg-primary" />
              )}
              <p className="text-sm text-muted-foreground">
                {t("envDetector.summary", {
                  available: statusCounts.available,
                  total: statusCounts.total,
                })}
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
                        {tool.available ? tool.version : t("envDetector.notFound")}
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

export default EnvDetector;
