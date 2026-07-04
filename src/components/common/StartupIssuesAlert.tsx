/**
 * Common UI / 通用 UI: surface startup diagnostics; 只展示启动诊断.
 */
import { AlertTriangle } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { StartupIssue } from "@/lib/tauri/types/bootstrap"

interface StartupIssuesAlertProps {
  issues: StartupIssue[]
}

export function StartupIssuesAlert({ issues }: StartupIssuesAlertProps) {
  const { t } = useTranslation()

  const description = useMemo(
    () =>
      issues
        .map((issue) =>
          t(`startupIssues.features.${issue.feature}`, {
            defaultValue: issue.feature,
          }),
        )
        .join(", "),
    [issues, t],
  )

  if (issues.length === 0) return null

  return (
    <Alert variant="destructive" className="mb-4 shrink-0">
      <AlertTriangle className="size-4" />
      <AlertTitle>{t("startupIssues.title")}</AlertTitle>
      <AlertDescription>
        {t("startupIssues.description", { features: description })}
      </AlertDescription>
    </Alert>
  )
}
