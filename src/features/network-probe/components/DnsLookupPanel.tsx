/**
 * Feature UI / 功能界面: DNS lookup panel for test L1.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DnsLookupResult } from "@/lib/tauri/types/network-probe"

const RR_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT"] as const

interface DnsLookupPanelProps {
  loading: boolean
  result: DnsLookupResult | null
  dnsPresets?: { id: string; address: string }[]
  onRun: (domain: string, rrType: string, resolver?: string) => void
}

export function DnsLookupPanel({ loading, result, dnsPresets, onRun }: DnsLookupPanelProps) {
  const { t } = useTranslation()
  const [domain, setDomain] = useState("example.com")
  const [rrType, setRrType] = useState<string>("A")
  const [resolver, setResolver] = useState("")

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("networkProbe.dns.hint")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <label className="text-xs font-medium" htmlFor="np-dns-domain">
            {t("networkProbe.dns.domain")}
          </label>
          <Input
            id="np-dns-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="w-28 space-y-1">
          <label className="text-xs font-medium" htmlFor="np-dns-rr">
            {t("networkProbe.dns.rrType")}
          </label>
          <select
            id="np-dns-rr"
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            value={rrType}
            onChange={(e) => setRrType(e.target.value)}
          >
            {RR_TYPES.map((rt) => (
              <option key={rt} value={rt}>
                {rt}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[10rem] flex-1 space-y-1">
          <label className="text-xs font-medium" htmlFor="np-dns-resolver">
            {t("networkProbe.dns.resolver")}
          </label>
          <Input
            id="np-dns-resolver"
            value={resolver}
            onChange={(e) => setResolver(e.target.value)}
            placeholder={t("networkProbe.dns.resolverPlaceholder")}
            list="np-dns-presets"
            autoComplete="off"
          />
          {dnsPresets && dnsPresets.length > 0 ? (
            <datalist id="np-dns-presets">
              {dnsPresets.map((p) => (
                <option key={p.id} value={p.address}>
                  {p.id}
                </option>
              ))}
            </datalist>
          ) : null}
        </div>
        <CommandHint
          hint={t("networkProbe.cmd.dnsLookup", {
            domain: domain.trim() || "…",
            rrType,
            resolver: resolver.trim() || "system",
          })}
        >
          <Button
            type="button"
            disabled={loading || !domain.trim()}
            onClick={() => onRun(domain, rrType, resolver.trim() || undefined)}
          >
            {loading ? t("networkProbe.dns.running") : t("networkProbe.dns.run")}
          </Button>
        </CommandHint>
      </div>
      {result ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.dns.meta", {
              rrType: result.rrType,
              resolver: result.resolver,
              ms: result.elapsedMs.toFixed(0),
            })}
          </div>
          {result.records.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("networkProbe.dns.empty")}</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-auto font-mono text-xs">
              {result.records.map((r, i) => (
                <li key={`${r.name}-${r.rrType}-${i}`}>
                  <span className="text-muted-foreground">{r.rrType}</span> {r.data}{" "}
                  <span className="text-muted-foreground">
                    {t("networkProbe.dns.ttl", { ttl: r.ttl })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </div>
  )
}
