import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { getExtensionDiagnostics } from "@/lib/tauri/commands/extension-center"
import type { ExtensionDiagnostics } from "@/lib/tauri/types/extension-center"
import { parseCommandError } from "@/lib/tauri/errors"
import type { AppErrorShape } from "@/lib/tauri/errors"

function DiagnosticsList({
  title,
  lines,
  emptyText,
}: {
  title: string
  lines: string[]
  emptyText: string
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {lines.length === 0 ? (
        <p className="text-muted-foreground rounded border border-dashed p-4 text-xs">
          {emptyText}
        </p>
      ) : (
        <div className="bg-muted/30 max-h-64 overflow-auto rounded border p-2">
          {lines.map((line, index) => (
            <pre
              key={index}
              className="font-mono text-[11px] leading-5 break-all whitespace-pre-wrap"
            >
              {line}
            </pre>
          ))}
        </div>
      )}
    </section>
  )
}

/** P4 诊断面板：插件审计日志 + 运行时错误（JSONL 尾部），替代裸 JSON 文件。 */
export function DiagnosticsPanel() {
  const { t } = useTranslation()
  const [data, setData] = useState<ExtensionDiagnostics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppErrorShape | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getExtensionDiagnostics())
    } catch (rawError) {
      setError(parseCommandError(rawError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{t("extensionCenter.diagnostics.hint")}</p>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          {t("extensionCenter.refresh")}
        </Button>
      </div>
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-mono text-xs">
            [{error.code}] {error.message}
          </p>
        </div>
      ) : data ? (
        <>
          <DiagnosticsList
            title={t("extensionCenter.diagnostics.audit")}
            lines={data.audit}
            emptyText={t("extensionCenter.diagnostics.empty")}
          />
          <DiagnosticsList
            title={t("extensionCenter.diagnostics.runtime")}
            lines={data.runtime}
            emptyText={t("extensionCenter.diagnostics.empty")}
          />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("extensionCenter.loading")}</p>
      )}
    </div>
  )
}
