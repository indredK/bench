import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";
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
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "size">("name");
  const [sortDesc, setSortDesc] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [scanned, setScanned] = useState(false);

  const loadTools = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (isTauriEnv()) {
        const result: EnvTool[] = await invoke("detect_env_tools");
        setTools(result);
      } else {
        setTools([]);
      }
      setScanned(true);
    } catch (e) {
      console.warn("[EnvDetector] Failed to detect tools:", e);
      setTools([]);
      setScanned(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const statusCounts = {
    total: tools.length,
    available: tools.filter((t) => t.available).length,
    unavailable: tools.filter((t) => !t.available).length,
  };

  const filteredTools = tools
    .filter((tool) => !searchQuery || tool.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter((tool) => showUnavailable || tool.available)
    .sort((a, b) => {
      const dir = sortDesc ? -1 : 1;
      if (sortBy === "size") {
        return (a.size_bytes - b.size_bytes) * dir;
      }
      return a.name.localeCompare(b.name) * dir;
    });

  const handleSort = (field: "name" | "size") => {
    if (sortBy === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(field);
      setSortDesc(field === "size");
    }
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 flex-row items-center justify-between">
          <div>
            <CardTitle>{t("envDetector.title")}</CardTitle>
            {!loading && tools.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("envDetector.summary", {
                  available: statusCounts.available,
                  total: statusCounts.total,
                })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadTools}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="mr-1.5 size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t("envDetector.scanning")}
                </>
              ) : (
                t("envDetector.refresh")
              )}
            </Button>
          </div>
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

          {loading ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
              <div className="size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
              <p>{t("envDetector.scanning")}</p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col min-h-0">
              {/* Search & Filter Bar */}
              {tools.length > 0 && (
                <div className="mb-3 shrink-0 flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Input
                      placeholder={t("envDetector.searchPlaceholder")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-3"
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={showUnavailable}
                      onChange={(e) => setShowUnavailable(e.target.checked)}
                      className="size-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {t("envDetector.showUnavailable")}
                  </label>
                </div>
              )}

              {/* Table */}
              {filteredTools.length > 0 ? (
                <div className="flex-1 min-h-0 overflow-auto rounded-lg border">
                  <table className="w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th
                          className="cursor-pointer px-4 py-3 text-left font-semibold text-muted-foreground hover:text-foreground"
                          onClick={() => handleSort("name")}
                        >
                          {t("envDetector.toolName")}
                          {sortBy === "name" && (
                            <span className="ml-1">{sortDesc ? "↓" : "↑"}</span>
                          )}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                          {t("envDetector.version")}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                          {t("envDetector.path")}
                        </th>
                        <th
                          className="cursor-pointer px-4 py-3 text-right font-semibold text-muted-foreground hover:text-foreground"
                          onClick={() => handleSort("size")}
                        >
                          {t("envDetector.size")}
                          {sortBy === "size" && (
                            <span className="ml-1">{sortDesc ? "↓" : "↑"}</span>
                          )}
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                          {t("envDetector.installTime")}
                        </th>
                        <th className="px-4 py-3 text-center font-semibold text-muted-foreground">
                          {t("envDetector.status")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredTools.map((tool) => (
                        <tr
                          key={tool.name}
                          className="transition-colors hover:bg-muted/30"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-medium">
                            {tool.name}
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">
                            {tool.available
                              ? tool.version
                              : t("envDetector.notFound")}
                          </td>
                          <td className="max-w-[280px] truncate px-4 py-3 font-mono text-xs text-muted-foreground">
                            {tool.available ? tool.path : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {tool.available ? tool.size_display : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground">
                            {tool.available ? tool.install_time : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                !loading && (
                  <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                    <p>{scanned ? t("envDetector.empty") : t("envDetector.startHint")}</p>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default EnvDetector;
