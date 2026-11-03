/**
 * Browser Extension Section / 浏览器扩展: 只做渲染.
 *
 * bench-companion 扩展导出 + Native Messaging 注册状态；扩展把浏览器会话交回 Bench 的唯一通道。
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Copy, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { BrowserExtensionExport, BrowserExtensionStatus } from "@/lib/tauri/types/browser-ext"

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
      <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1 font-mono" title={value}>
        {value}
      </code>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t("integrations.copy")}
        title={t("integrations.copy")}
        onClick={() => {
          void navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </Button>
    </div>
  )
}

export function BrowserExtensionSection({
  status,
  exportResult,
  exporting,
  onExport,
  onOpenExtensionsPage,
}: {
  status: BrowserExtensionStatus | null
  exportResult: BrowserExtensionExport | null
  exporting: boolean
  onExport: () => void
  onOpenExtensionsPage: (browserId: string) => void
}) {
  const { t } = useTranslation()
  const dir = exportResult?.extensionDir ?? status?.extensionDir ?? ""
  const version = exportResult?.extensionVersion ?? status?.extensionVersion
  const registrations = exportResult?.nmRegistrations ?? status?.nmRegistrations ?? []
  const installedBrowsers = status?.browsers.filter((b) => b.installed) ?? []

  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {t("integrations.browser.title")}
          {version ? (
            <Badge
              variant="outline"
              className="font-mono"
              title={t("integrations.browser.extVersion")}
            >
              v{version}
            </Badge>
          ) : null}
        </h2>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              status?.exported
                ? "border-green-300 text-green-700 dark:text-green-300"
                : "border-amber-300 text-amber-700 dark:text-amber-300"
            }
          >
            {status?.exported
              ? t("integrations.browser.exported")
              : t("integrations.browser.notExported")}
          </Badge>
          <Button
            size="sm"
            disabled={exporting || (status !== null && !status.hostBinFound)}
            onClick={onExport}
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : null}
            {exporting ? t("integrations.browser.exporting") : t("integrations.browser.export")}
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">{t("integrations.browser.locationHint")}</p>

      {dir ? (
        <div className="grid gap-1">
          <CopyRow label={t("integrations.browser.extDir")} value={dir} />
          <CopyRow label={t("integrations.browser.extId")} value={status?.extensionId ?? ""} />
        </div>
      ) : null}

      <div className="rounded border border-dashed p-3">
        <p className="text-xs font-medium">{t("integrations.browser.stepsTitle")}</p>
        <ol className="text-muted-foreground mt-1 grid gap-0.5 text-xs">
          {(["step1", "step2", "step3", "step4"] as const).map((k) => (
            <li key={k}>{t(`integrations.browser.${k}`)}</li>
          ))}
        </ol>
      </div>

      {installedBrowsers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {t("integrations.browser.browsers")}
          </span>
          {installedBrowsers.map((b) => (
            <Button
              key={b.id}
              size="sm"
              variant="outline"
              onClick={() => onOpenExtensionsPage(b.id)}
            >
              {b.name} · {t("integrations.browser.openExtensionsPage")}
            </Button>
          ))}
        </div>
      ) : null}

      {registrations.length > 0 ? (
        <div className="min-h-0 min-w-0">
          <p className="text-muted-foreground text-xs">{t("integrations.browser.nmTitle")}</p>
          <div className="mt-1 grid gap-0.5">
            {registrations.map((r) => (
              <div key={r.browser} className="flex min-w-0 items-center gap-2 text-xs">
                <span className={r.registered ? "text-green-600" : "text-muted-foreground"}>
                  {r.registered ? "●" : "○"}
                </span>
                <span className="w-14 shrink-0">{r.browser}</span>
                <code
                  className="text-muted-foreground min-w-0 truncate font-mono"
                  title={r.manifestPath}
                >
                  {r.manifestPath}
                </code>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
