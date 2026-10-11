import { useTranslation } from "react-i18next"
import type { PublicIpInfo } from "@/lib/tauri/types/network-probe"

interface PublicIpResultProps {
  result: PublicIpInfo
  embedded?: boolean
}

export function PublicIpResult({ result, embedded = false }: PublicIpResultProps) {
  const { t } = useTranslation()
  const ip = result.ip?.trim()

  return (
    <div
      className={embedded ? "space-y-1 text-sm" : "space-y-1 rounded-lg border px-3 py-2 text-sm"}
    >
      {ip ? (
        <>
          <div>
            {t("networkProbe.offline.ip")}: <span className="font-mono font-medium">{ip}</span>
          </div>
          {result.asn ? (
            <div className="text-muted-foreground text-xs">
              {t("networkProbe.egress.asn", {
                asn: result.asn,
                org: result.org ? ` · ${result.org}` : "",
              })}
            </div>
          ) : null}
        </>
      ) : (
        <p role="status" className="text-muted-foreground">
          {t("networkProbe.egress.failed")}
        </p>
      )}

      <details className="text-muted-foreground text-xs">
        <summary className="cursor-pointer select-none">
          {t("networkProbe.egress.technicalDetails")}
        </summary>
        <dl className="mt-2 space-y-1 break-all">
          {result.source ? (
            <div>
              <dt className="inline font-medium">{t("networkProbe.egress.source")}: </dt>
              <dd className="inline font-mono">{result.source}</dd>
            </div>
          ) : null}
          {result.detail ? (
            <div>
              <dt className="inline font-medium">{t("networkProbe.egress.response")}: </dt>
              <dd className="inline font-mono">{result.detail}</dd>
            </div>
          ) : null}
          <div>
            <dt className="inline font-medium">{t("networkProbe.egress.command")}: </dt>
            <dd className="inline font-mono">{result.commandHint}</dd>
          </div>
        </dl>
      </details>
    </div>
  )
}
