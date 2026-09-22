/**
 * DiagnosticsPanel / 网络诊断子面板: Ping / 端口连通性 / 本机 IP / WiFi.
 *
 * 从 page.tsx 拆出（planned#9），只负责渲染，状态与动作走传入的 controller。
 */
import { useTranslation } from "react-i18next"
import { SettingGroup } from "@/components/ui/setting-group"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DevToolboxController } from "@/features/dev-toolbox/hooks/useDevToolboxController"

export function DiagnosticsPanel({ controller }: { controller: DevToolboxController }) {
  const { t } = useTranslation()
  const {
    applying,
    diagnosticTarget,
    setDiagnosticTarget,
    diagnosticPort,
    setDiagnosticPort,
    diagnosticResult,
    handlePing,
    handleLocalIp,
    handleWifiInfo,
    handlePortCheck,
  } = controller

  const portValid = /^\d+$/.test(diagnosticPort) && +diagnosticPort >= 1 && +diagnosticPort <= 65535

  return (
    <div className="space-y-4">
      <SettingGroup title={t("systemSettings.diagnostics.title")}>
        <p className="text-muted-foreground py-2 text-xs">
          {t("systemSettings.diagnostics.description")}
        </p>
        <div className="flex gap-2 py-2">
          <Input
            value={diagnosticTarget}
            onChange={(e) => setDiagnosticTarget(e.target.value)}
            placeholder={t("systemSettings.diagnostics.targetPlaceholder")}
            className="flex-1"
          />
          <Input
            value={diagnosticPort}
            onChange={(e) => setDiagnosticPort(e.target.value)}
            placeholder={t("systemSettings.diagnostics.portPlaceholder")}
            inputMode="numeric"
            className="w-24 shrink-0"
          />
        </div>
        <div className="flex flex-wrap gap-2 py-2">
          <Button variant="outline" size="sm" disabled={applying} onClick={handlePing}>
            {t("systemSettings.diagnostics.ping")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={applying || !portValid}
            onClick={handlePortCheck}
          >
            {t("systemSettings.diagnostics.portCheck")}
          </Button>
          <Button variant="outline" size="sm" disabled={applying} onClick={handleLocalIp}>
            {t("systemSettings.diagnostics.localIp")}
          </Button>
          <Button variant="outline" size="sm" disabled={applying} onClick={handleWifiInfo}>
            {t("systemSettings.diagnostics.wifi")}
          </Button>
        </div>
        {diagnosticResult && (
          <pre className="bg-muted max-h-48 overflow-auto rounded p-2 text-xs">
            {diagnosticResult}
          </pre>
        )}
      </SettingGroup>
    </div>
  )
}
