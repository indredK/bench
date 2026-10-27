import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, RotateCcw, Trash2 } from "lucide-react"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type {
  CaptiveProbe,
  DefaultsOverride,
  DnsPreset,
  MtuTarget,
  NetworkProbeDefaultsCatalog,
  PublicIpApi,
  ReachTarget,
  SitePreset,
} from "@/lib/tauri/types/network-probe"

type DefaultsCategory = keyof DefaultsOverride
type Entry = { id: string }
const MAX_TEXT_BYTES = 256
const MAX_FAILOVER_PROBES = 3
const MAX_REACH_TARGETS = MAX_FAILOVER_PROBES * 2
type Field<T> = {
  key: keyof T & string
  labelKey: string
  type?: "text" | "url" | "number" | "select"
  options?: readonly string[]
  optionLabelPrefix?: string
  min?: number
  max?: number
}

const CATEGORIES: DefaultsCategory[] = [
  "dnsPresets",
  "sitePacks",
  "reachTargets",
  "captiveProbes",
  "publicIpApis",
  "mtuTargets",
]

const CATEGORY_LABELS: Record<DefaultsCategory, string> = {
  dnsPresets: "networkProbe.defaults.categories.dnsPresets",
  sitePacks: "networkProbe.defaults.categories.sitePacks",
  reachTargets: "networkProbe.defaults.categories.reachTargets",
  captiveProbes: "networkProbe.defaults.categories.captiveProbes",
  publicIpApis: "networkProbe.defaults.categories.publicIpApis",
  mtuTargets: "networkProbe.defaults.categories.mtuTargets",
}

function copyCatalog(source: NetworkProbeDefaultsCatalog): NetworkProbeDefaultsCatalog {
  return {
    schemaVersion: source.schemaVersion,
    dnsPresets: source.dnsPresets.map((item) => ({ ...item })),
    reachTargets: source.reachTargets.map((item) => ({ ...item })),
    captiveProbes: source.captiveProbes.map((item) => ({ ...item })),
    publicIpApis: source.publicIpApis.map((item) => ({ ...item })),
    sitePacks: Object.fromEntries(
      Object.entries(source.sitePacks).map(([id, items]) => [
        id,
        items.map((item) => ({ ...item })),
      ]),
    ),
    mtuTargets: source.mtuTargets.map((item) => ({ ...item })),
  }
}

function nextId(ids: string[], prefix: string): string {
  let suffix = ids.length + 1
  while (ids.includes(`${prefix}-${suffix}`)) suffix += 1
  return `${prefix}-${suffix}`
}

function isValidId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)
}

function isValidText(value: string): boolean {
  return (
    value.trim().length > 0 &&
    new TextEncoder().encode(value).byteLength <= MAX_TEXT_BYTES &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}

function isValidIp(value: string): boolean {
  const parts = value.split(".")
  if (
    parts.length === 4 &&
    parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
  ) {
    return true
  }
  if (!value.includes(":") || !/^[0-9a-f:]+$/i.test(value)) return false
  try {
    return new URL(`http://[${value}]/`).hostname.length > 0
  } catch {
    return false
  }
}

function isValidHost(value: string): boolean {
  if (!isValidText(value) || /\s/.test(value)) return false
  if (isValidIp(value)) return true
  try {
    const url = new URL(`https://${value}`)
    return url.hostname.length > 0 && url.pathname === "/" && !url.port && !url.username
  } catch {
    return false
  }
}

function isValidHttpUrl(value: string, httpsOnly = false): boolean {
  if (!isValidText(value)) return false
  try {
    const url = new URL(value)
    return (
      (url.protocol === "https:" || (!httpsOnly && url.protocol === "http:")) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

function validateCategory(
  category: DefaultsCategory,
  draft: NetworkProbeDefaultsCatalog,
): string | null {
  if (category === "sitePacks") {
    const packIds = Object.keys(draft.sitePacks)
    if (
      packIds.length === 0 ||
      Object.values(draft.sitePacks).some((sites) => sites.length === 0)
    ) {
      return "networkProbe.defaults.validation.required"
    }
    if (packIds.some((id) => !isValidId(id))) return "networkProbe.defaults.validation.invalidId"
    if (new Set(packIds).size !== packIds.length)
      return "networkProbe.defaults.validation.duplicateId"
    for (const sites of Object.values(draft.sitePacks)) {
      const ids = sites.map((site) => site.id)
      if (ids.some((id) => !isValidId(id))) return "networkProbe.defaults.validation.invalidId"
      if (new Set(ids).size !== ids.length) return "networkProbe.defaults.validation.duplicateId"
      for (const site of sites) {
        if (
          site.channel === "http"
            ? !isValidHttpUrl(site.target)
            : site.channel !== "icmp" || !isValidHost(site.target)
        ) {
          return "networkProbe.defaults.validation.invalidValue"
        }
      }
    }
  } else {
    const items: Entry[] = draft[category] as Entry[]
    if (items.length === 0) return "networkProbe.defaults.validation.required"
    if (
      (category === "captiveProbes" || category === "publicIpApis") &&
      items.length > MAX_FAILOVER_PROBES
    ) {
      return "networkProbe.defaults.validation.limitExceeded"
    }
    const ids = items.map((item) => item.id)
    if (ids.some((id) => !isValidId(id))) return "networkProbe.defaults.validation.invalidId"
    if (new Set(ids).size !== ids.length) return "networkProbe.defaults.validation.duplicateId"
  }

  if (
    category === "reachTargets" &&
    ["ipv4", "name"].some(
      (kind) =>
        draft.reachTargets.filter((target) => target.kind === kind).length > MAX_FAILOVER_PROBES,
    )
  ) {
    return "networkProbe.defaults.validation.limitExceeded"
  }

  if (
    category === "dnsPresets" &&
    !draft.dnsPresets.every((item) => isValidIp(item.address) && isValidText(item.region))
  ) {
    return "networkProbe.defaults.validation.invalidValue"
  }
  if (
    category === "reachTargets" &&
    !draft.reachTargets.every((item) =>
      item.kind === "ipv4"
        ? isValidIp(item.target) && !item.target.includes(":")
        : item.kind === "name" && isValidHost(item.target),
    )
  ) {
    return "networkProbe.defaults.validation.invalidValue"
  }
  if (
    category === "captiveProbes" &&
    !draft.captiveProbes.every(
      (item) => isValidHttpUrl(item.url) && item.expectStatus >= 100 && item.expectStatus <= 599,
    )
  ) {
    return "networkProbe.defaults.validation.invalidValue"
  }
  if (
    category === "publicIpApis" &&
    !draft.publicIpApis.every(
      (item) => isValidHttpUrl(item.url, true) && ["json-ip", "text"].includes(item.format),
    )
  ) {
    return "networkProbe.defaults.validation.invalidValue"
  }
  if (
    category === "mtuTargets" &&
    !draft.mtuTargets.every((item) => item.target === "gateway" || isValidHost(item.target))
  ) {
    return "networkProbe.defaults.validation.invalidValue"
  }
  return null
}

function updateArrayField<T extends Entry>(
  items: T[],
  index: number,
  key: keyof T & string,
  raw: string,
  numeric: boolean,
): T[] {
  return items.map((item, itemIndex) =>
    itemIndex === index ? ({ ...item, [key]: numeric ? Number(raw) : raw } as T) : item,
  )
}

function EntryList<T extends Entry>({
  items,
  fields,
  onChange,
  onAdd,
  addLabel,
  maxItems = 128,
}: {
  items: T[]
  fields: Field<T>[]
  onChange: (items: T[]) => void
  onAdd: () => void
  addLabel: string
  maxItems?: number
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={index}
              className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]"
            >
              {fields.map((field) => (
                <label key={field.key} className="text-muted-foreground grid min-w-0 gap-1 text-xs">
                  {t(field.labelKey)}
                  {field.type === "select" ? (
                    <select
                      className="border-input bg-background text-foreground focus-visible:ring-ring/50 h-8 min-w-0 rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
                      value={String(item[field.key] ?? "")}
                      aria-label={t("networkProbe.defaults.rowField", {
                        index: index + 1,
                        field: t(field.labelKey),
                      })}
                      onChange={(event) =>
                        onChange(
                          updateArrayField(items, index, field.key, event.target.value, false),
                        )
                      }
                    >
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {field.optionLabelPrefix
                            ? t(`${field.optionLabelPrefix}.${option}`)
                            : option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type={field.type === "number" ? "number" : (field.type ?? "text")}
                      maxLength={field.key === "id" ? 64 : MAX_TEXT_BYTES}
                      min={field.min}
                      max={field.max}
                      value={String(item[field.key] ?? "")}
                      aria-label={t("networkProbe.defaults.rowField", {
                        index: index + 1,
                        field: t(field.labelKey),
                      })}
                      onChange={(event) =>
                        onChange(
                          updateArrayField(
                            items,
                            index,
                            field.key,
                            event.target.value,
                            field.type === "number",
                          ),
                        )
                      }
                    />
                  )}
                </label>
              ))}
              <div className="flex items-end justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("networkProbe.defaults.removeItem", { index: index + 1 })}
                  onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-5 text-center text-sm">
          {t("networkProbe.defaults.empty")}
        </p>
      )}
      {items.length >= maxItems ? (
        <p className="text-muted-foreground text-xs">
          {t("networkProbe.defaults.limitReached", { max: maxItems })}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={items.length >= maxItems}
        onClick={onAdd}
      >
        <Plus aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  )
}

export function DefaultsEditorDialog({
  open,
  defaults,
  busy,
  error,
  onOpenChange,
  onSave,
  onReset,
}: {
  open: boolean
  defaults: NetworkProbeDefaultsCatalog | null
  busy: boolean
  error?: string | null
  onOpenChange: (open: boolean) => void
  onSave: (patch: DefaultsOverride) => Promise<boolean>
  onReset: () => Promise<NetworkProbeDefaultsCatalog | null>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<NetworkProbeDefaultsCatalog | null>(null)
  const [category, setCategory] = useState<DefaultsCategory>("dnsPresets")
  const [selectedPack, setSelectedPack] = useState("")
  const [resetOpen, setResetOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (!open) {
      wasOpen.current = false
      return
    }
    if (wasOpen.current && draft) return
    wasOpen.current = true
    if (!defaults) return
    setDraft(copyCatalog(defaults))
    setCategory("dnsPresets")
    setSelectedPack(Object.keys(defaults.sitePacks).sort()[0] ?? "")
    setSaved(false)
  }, [open, defaults, draft])

  const packs = useMemo(() => Object.keys(draft?.sitePacks ?? {}).sort(), [draft?.sitePacks])
  const validationKey = draft ? validateCategory(category, draft) : null
  const dirty = useMemo(() => {
    if (!draft || !defaults) return false
    return JSON.stringify(draft[category]) !== JSON.stringify(defaults[category])
  }, [category, defaults, draft])

  const patch = useMemo<DefaultsOverride | null>(() => {
    if (!draft) return null
    switch (category) {
      case "dnsPresets":
        return { dnsPresets: draft.dnsPresets }
      case "sitePacks":
        return { sitePacks: draft.sitePacks }
      case "reachTargets":
        return { reachTargets: draft.reachTargets }
      case "captiveProbes":
        return { captiveProbes: draft.captiveProbes }
      case "publicIpApis":
        return { publicIpApis: draft.publicIpApis }
      case "mtuTargets":
        return { mtuTargets: draft.mtuTargets }
    }
  }, [category, draft])

  const update = <K extends keyof NetworkProbeDefaultsCatalog>(
    key: K,
    value: NetworkProbeDefaultsCatalog[K],
  ) => {
    setSaved(false)
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  const addSimple = <
    K extends "dnsPresets" | "reachTargets" | "captiveProbes" | "publicIpApis" | "mtuTargets",
  >(
    key: K,
    item: NetworkProbeDefaultsCatalog[K][number],
    prefix: string,
  ) => {
    const current = draft?.[key]
    if (!current || !Array.isArray(current)) return
    const ids = current.map((entry) => (entry as Entry).id)
    update(key, [
      ...current,
      { ...item, id: nextId(ids, prefix) },
    ] as NetworkProbeDefaultsCatalog[K])
  }

  const selectedSites = draft?.sitePacks[selectedPack] ?? []
  const selectedCategoryError = error && error.length ? error : null

  const submit = async () => {
    if (!patch || validationKey || !dirty || saving || busy) return
    setSaving(true)
    const succeeded = await onSave(patch)
    setSaving(false)
    setSaved(succeeded)
  }

  const renderEditor = () => {
    if (!draft)
      return <p className="text-muted-foreground py-10 text-center">{t("common.loading")}</p>
    switch (category) {
      case "dnsPresets":
        return (
          <EntryList<DnsPreset>
            items={draft.dnsPresets}
            fields={[
              { key: "id", labelKey: "networkProbe.defaults.fields.id" },
              { key: "address", labelKey: "networkProbe.defaults.fields.address" },
              { key: "region", labelKey: "networkProbe.defaults.fields.region" },
            ]}
            onChange={(items) => update("dnsPresets", items)}
            onAdd={() => addSimple("dnsPresets", { id: "", address: "", region: "global" }, "dns")}
            addLabel={t("networkProbe.defaults.add")}
          />
        )
      case "sitePacks":
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-muted-foreground grid min-w-48 flex-1 gap-1 text-xs">
                {t("networkProbe.defaults.fields.pack")}
                <select
                  className="border-input bg-background text-foreground focus-visible:ring-ring/50 h-8 rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
                  value={selectedPack}
                  aria-label={t("networkProbe.defaults.fields.pack")}
                  onChange={(event) => setSelectedPack(event.target.value)}
                >
                  {packs.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={packs.length >= 32}
                onClick={() => {
                  const id = nextId(packs, "custom")
                  update("sitePacks", { ...draft.sitePacks, [id]: [] })
                  setSelectedPack(id)
                }}
              >
                <Plus aria-hidden="true" />
                {t("networkProbe.defaults.addPack")}
              </Button>
              {packs.length >= 32 ? (
                <p className="text-muted-foreground text-xs">
                  {t("networkProbe.defaults.packLimitReached")}
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={packs.length <= 1 || !selectedPack}
                onClick={() => {
                  const next = { ...draft.sitePacks }
                  delete next[selectedPack]
                  update("sitePacks", next)
                  setSelectedPack(Object.keys(next).sort()[0] ?? "")
                }}
              >
                <Trash2 aria-hidden="true" />
                {t("networkProbe.defaults.removePack")}
              </Button>
            </div>
            {selectedPack ? (
              <EntryList<SitePreset>
                items={selectedSites}
                fields={[
                  { key: "id", labelKey: "networkProbe.defaults.fields.id" },
                  { key: "target", labelKey: "networkProbe.defaults.fields.target" },
                  {
                    key: "channel",
                    labelKey: "networkProbe.defaults.fields.channel",
                    type: "select",
                    options: ["http", "icmp"],
                    optionLabelPrefix: "networkProbe.defaults.options.probeMethod",
                  },
                ]}
                onChange={(items) =>
                  update("sitePacks", { ...draft.sitePacks, [selectedPack]: items })
                }
                onAdd={() =>
                  update("sitePacks", {
                    ...draft.sitePacks,
                    [selectedPack]: [
                      ...selectedSites,
                      {
                        id: nextId(
                          selectedSites.map((item) => item.id),
                          "site",
                        ),
                        target: "",
                        channel: "http",
                      },
                    ],
                  })
                }
                addLabel={t("networkProbe.defaults.add")}
              />
            ) : null}
          </div>
        )
      case "reachTargets":
        return (
          <EntryList<ReachTarget>
            items={draft.reachTargets}
            fields={[
              { key: "id", labelKey: "networkProbe.defaults.fields.id" },
              {
                key: "kind",
                labelKey: "networkProbe.defaults.fields.kind",
                type: "select",
                options: ["ipv4", "name"],
                optionLabelPrefix: "networkProbe.defaults.options.targetType",
              },
              { key: "target", labelKey: "networkProbe.defaults.fields.target" },
            ]}
            onChange={(items) => update("reachTargets", items)}
            onAdd={() => {
              const defaultKind =
                draft.reachTargets.filter((target) => target.kind === "name").length <
                MAX_FAILOVER_PROBES
                  ? "name"
                  : "ipv4"
              addSimple("reachTargets", { id: "", kind: defaultKind, target: "" }, "target")
            }}
            addLabel={t("networkProbe.defaults.add")}
            maxItems={MAX_REACH_TARGETS}
          />
        )
      case "captiveProbes":
        return (
          <EntryList<CaptiveProbe>
            items={draft.captiveProbes}
            fields={[
              { key: "id", labelKey: "networkProbe.defaults.fields.id" },
              { key: "url", labelKey: "networkProbe.defaults.fields.url", type: "url" },
              {
                key: "expectStatus",
                labelKey: "networkProbe.defaults.fields.expectStatus",
                type: "number",
                min: 100,
                max: 599,
              },
            ]}
            onChange={(items) => update("captiveProbes", items)}
            onAdd={() =>
              addSimple("captiveProbes", { id: "", url: "", expectStatus: 204 }, "captive")
            }
            addLabel={t("networkProbe.defaults.add")}
            maxItems={MAX_FAILOVER_PROBES}
          />
        )
      case "publicIpApis":
        return (
          <EntryList<PublicIpApi>
            items={draft.publicIpApis}
            fields={[
              { key: "id", labelKey: "networkProbe.defaults.fields.id" },
              { key: "url", labelKey: "networkProbe.defaults.fields.url", type: "url" },
              {
                key: "format",
                labelKey: "networkProbe.defaults.fields.format",
                type: "select",
                options: ["json-ip", "text"],
                optionLabelPrefix: "networkProbe.defaults.options.format",
              },
            ]}
            onChange={(items) => update("publicIpApis", items)}
            onAdd={() => addSimple("publicIpApis", { id: "", url: "", format: "json-ip" }, "api")}
            addLabel={t("networkProbe.defaults.add")}
            maxItems={MAX_FAILOVER_PROBES}
          />
        )
      case "mtuTargets":
        return (
          <EntryList<MtuTarget>
            items={draft.mtuTargets}
            fields={[
              { key: "id", labelKey: "networkProbe.defaults.fields.id" },
              { key: "target", labelKey: "networkProbe.defaults.fields.target" },
            ]}
            onChange={(items) => update("mtuTargets", items)}
            onAdd={() => addSimple("mtuTargets", { id: "", target: "" }, "mtu")}
            addLabel={t("networkProbe.defaults.add")}
          />
        )
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !busy && !saving && onOpenChange(next)}>
        <DialogContent className="grid max-h-[min(88vh,760px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-5 pt-5 pb-3">
            <DialogTitle>{t("networkProbe.defaults.title")}</DialogTitle>
            <DialogDescription>{t("networkProbe.defaults.description")}</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 grid-cols-1 overflow-hidden sm:grid-cols-[11rem_minmax(0,1fr)]">
            <nav
              className="flex gap-1 overflow-x-auto border-b p-2 sm:flex-col sm:overflow-y-auto sm:border-r sm:border-b-0"
              aria-label={t("networkProbe.defaults.categoriesLabel")}
            >
              {CATEGORIES.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-current={category === id ? "page" : undefined}
                  className={`shrink-0 rounded-md px-3 py-2 text-left text-xs sm:text-sm ${category === id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  onClick={() => {
                    setCategory(id)
                    setSaved(false)
                  }}
                >
                  {t(CATEGORY_LABELS[id])}
                </button>
              ))}
            </nav>

            <section
              className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5"
              aria-label={t(CATEGORY_LABELS[category])}
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{t(CATEGORY_LABELS[category])}</h3>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t("networkProbe.defaults.categoryHint")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || saving}
                  onClick={() => setResetOpen(true)}
                >
                  <RotateCcw aria-hidden="true" />
                  {t("networkProbe.defaults.reset")}
                </Button>
              </div>
              {renderEditor()}
              {validationKey ? (
                <p className="text-destructive mt-3 text-xs" role="alert">
                  {t(validationKey)}
                </p>
              ) : null}
              {selectedCategoryError ? (
                <p className="text-destructive mt-3 text-xs" role="alert">
                  {selectedCategoryError}
                </p>
              ) : null}
              {saved ? (
                <p className="text-muted-foreground mt-3 text-xs" role="status" aria-live="polite">
                  {t("networkProbe.defaults.saved")}
                </p>
              ) : null}
            </section>
          </div>

          <DialogFooter className="border-t px-5 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy || saving}
              onClick={() => onOpenChange(false)}
            >
              {t("common.actions.close")}
            </Button>
            <Button
              type="button"
              disabled={!dirty || Boolean(validationKey) || busy || saving}
              onClick={() => void submit()}
            >
              {saving || busy ? t("common.loading") : t("networkProbe.defaults.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DestructiveConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t("networkProbe.defaults.resetTitle")}
        description={t("networkProbe.defaults.resetDescription")}
        confirmLabel={t("networkProbe.defaults.resetConfirm")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={async () => {
          const resetCatalog = await onReset()
          if (resetCatalog) {
            setDraft(copyCatalog(resetCatalog))
            setSaved(true)
          }
        }}
      />
    </>
  )
}
