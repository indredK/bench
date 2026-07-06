import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, X, ArrowRightLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  ModelPricing,
  PricingStandard,
} from "@/features/token-calculator/services/token-calculator.repository"
import {
  RATIO_PRESETS,
  convertPrice,
  effectiveInputPrice,
  formatCost,
  formatPrice,
  getTokenUnits,
  hasCachePricing,
  mixedPricePerMillionTokens,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  type DisplayCurrency,
} from "@/features/token-calculator/model/pricing"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type SelectedModel = {
  standardId: string
  standardName: string
  model: ModelPricing
}

type CompareMode = "workload" | "budget"

export function CompareTab({
  standards,
  displayCurrency,
  exchangeRate,
}: {
  standards: PricingStandard[]
  displayCurrency: DisplayCurrency
  exchangeRate: number
}) {
  const { t } = useTranslation()
  const tokenUnits = useMemo(() => getTokenUnits(t), [t])
  const [mode, setMode] = useState<CompareMode>("workload")
  const [selectedModels, setSelectedModels] = useState<SelectedModel[]>([])

  const [selStandardId, setSelStandardId] = useState("")
  const [selModelName, setSelModelName] = useState("")

  const [inputTokens, setInputTokens] = useState(1)
  const [inputUnit, setInputUnit] = useState("million")
  const [outputTokens, setOutputTokens] = useState(1)
  const [outputUnit, setOutputUnit] = useState("million")
  const [ratio, setRatio] = useState(1)

  const handleRatioChange = (newRatio: number) => {
    setRatio(newRatio)
    const total = actualInputTokens + actualOutputTokens
    if (total <= 0) return
    const newInputActual = Math.round((total * newRatio) / (newRatio + 1))
    const newOutputActual = total - newInputActual
    setInputTokens(Number((newInputActual / inputMultiplier).toFixed(4)))
    setOutputTokens(Number((newOutputActual / outputMultiplier).toFixed(4)))
  }

  const [budget, setBudget] = useState(100)

  const inputMultiplier = tokenUnits.find((u) => u.value === inputUnit)?.multiplier ?? 1
  const outputMultiplier = tokenUnits.find((u) => u.value === outputUnit)?.multiplier ?? 1
  const actualInputTokens = (inputTokens || 0) * inputMultiplier
  const actualOutputTokens = (outputTokens || 0) * outputMultiplier
  const ratioPresetIndex = RATIO_PRESETS.findIndex((r) => r >= ratio)
  const selectedRatioPresetIndex =
    ratioPresetIndex === -1 ? RATIO_PRESETS.length - 1 : ratioPresetIndex

  const currentStandard = standards.find((s) => s.id === selStandardId) ?? null

  const addModel = () => {
    if (!currentStandard || !selModelName) return
    const m = currentStandard.models.find((x) => x.modelName === selModelName)
    if (!m) return
    const alreadyAdded = selectedModels.some(
      (sm) => sm.standardId === currentStandard.id && sm.model.modelName === m.modelName,
    )
    if (alreadyAdded) return
    setSelectedModels([
      ...selectedModels,
      { standardId: currentStandard.id, standardName: currentStandard.name, model: m },
    ])
    setSelModelName("")
  }

  const removeModel = (idx: number) => {
    const removed = selectedModels[idx]
    setSelectedModels(selectedModels.filter((_, i) => i !== idx))
    if (removed) {
      const key = `${removed.standardId}::${removed.model.modelName}`
      setCacheHitRates((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const [cacheHitRates, setCacheHitRates] = useState<Record<string, number>>({})
  const getHitRate = (standardId: string, modelName: string): number =>
    cacheHitRates[`${standardId}::${modelName}`] ?? 90
  const setHitRate = (standardId: string, modelName: string, rate: number) => {
    setCacheHitRates((prev) => ({
      ...prev,
      [`${standardId}::${modelName}`]: Math.min(100, Math.max(0, rate || 0)),
    }))
  }

  const workloadResults = useMemo(() => {
    return selectedModels
      .map((sm) => {
        const src = sm.model.currency
        const inp = convertPrice(sm.model.inputPrice, src, displayCurrency, exchangeRate)
        const cacheWrite =
          sm.model.cachedWritePrice != null
            ? convertPrice(sm.model.cachedWritePrice, src, displayCurrency, exchangeRate)
            : null
        const cacheRead =
          sm.model.cachedReadPrice != null
            ? convertPrice(sm.model.cachedReadPrice, src, displayCurrency, exchangeRate)
            : null
        const outp = convertPrice(sm.model.outputPrice, src, displayCurrency, exchangeRate)
        const hitRate = getHitRate(sm.standardId, sm.model.modelName)
        const effInp = effectiveInputPrice(inp, cacheWrite, cacheRead, hitRate)
        const cost =
          (actualInputTokens / 1_000_000) * effInp + (actualOutputTokens / 1_000_000) * outp

        const inpUsd = convertPrice(sm.model.inputPrice, src, "USD", exchangeRate)
        const cwUsd =
          sm.model.cachedWritePrice != null
            ? convertPrice(sm.model.cachedWritePrice, src, "USD", exchangeRate)
            : null
        const crUsd =
          sm.model.cachedReadPrice != null
            ? convertPrice(sm.model.cachedReadPrice, src, "USD", exchangeRate)
            : null
        const outpUsd = convertPrice(sm.model.outputPrice, src, "USD", exchangeRate)
        const effUsd = effectiveInputPrice(inpUsd, cwUsd, crUsd, hitRate)
        const costUsd =
          (actualInputTokens / 1_000_000) * effUsd + (actualOutputTokens / 1_000_000) * outpUsd

        const inpCny = convertPrice(sm.model.inputPrice, src, "CNY", exchangeRate)
        const cwCny =
          sm.model.cachedWritePrice != null
            ? convertPrice(sm.model.cachedWritePrice, src, "CNY", exchangeRate)
            : null
        const crCny =
          sm.model.cachedReadPrice != null
            ? convertPrice(sm.model.cachedReadPrice, src, "CNY", exchangeRate)
            : null
        const outpCny = convertPrice(sm.model.outputPrice, src, "CNY", exchangeRate)
        const effCny = effectiveInputPrice(inpCny, cwCny, crCny, hitRate)
        const costCny =
          (actualInputTokens / 1_000_000) * effCny + (actualOutputTokens / 1_000_000) * outpCny

        return {
          ...sm,
          inputPriceConv: inp,
          cacheWritePriceConv: cacheWrite,
          cacheReadPriceConv: cacheRead,
          outputPriceConv: outp,
          hitRate,
          cost,
          costUsd,
          costCny,
        }
      })
      .sort((a, b) => a.cost - b.cost)
  }, [selectedModels, actualInputTokens, actualOutputTokens, displayCurrency, exchangeRate, cacheHitRates])

  const budgetResults = useMemo(() => {
    return selectedModels
      .map((sm) => {
        const inp = convertPrice(sm.model.inputPrice, sm.model.currency, displayCurrency, exchangeRate)
        const cacheWrite =
          sm.model.cachedWritePrice != null
            ? convertPrice(sm.model.cachedWritePrice, sm.model.currency, displayCurrency, exchangeRate)
            : null
        const cacheRead =
          sm.model.cachedReadPrice != null
            ? convertPrice(sm.model.cachedReadPrice, sm.model.currency, displayCurrency, exchangeRate)
            : null
        const outp = convertPrice(sm.model.outputPrice, sm.model.currency, displayCurrency, exchangeRate)
        const hitRate = getHitRate(sm.standardId, sm.model.modelName)
        const effInp = effectiveInputPrice(inp, cacheWrite, cacheRead, hitRate)
        const maxInput =
          effInp > 0 ? Math.floor((budget / effInp) * 1_000_000) : Number.MAX_SAFE_INTEGER
        const maxOutput =
          outp > 0 ? Math.floor((budget / outp) * 1_000_000) : Number.MAX_SAFE_INTEGER
        const mixedPrice = mixedPricePerMillionTokens(effInp, outp, ratio)
        const maxMixed =
          mixedPrice > 0 ? Math.floor((budget / mixedPrice) * 1_000_000) : Number.MAX_SAFE_INTEGER
        return {
          ...sm,
          inputPriceConv: inp,
          cacheWritePriceConv: cacheWrite,
          cacheReadPriceConv: cacheRead,
          outputPriceConv: outp,
          hitRate,
          maxInput,
          maxOutput,
          maxMixed,
        }
      })
      .sort((a, b) => b.maxMixed - a.maxMixed)
  }, [selectedModels, budget, ratio, displayCurrency, exchangeRate, cacheHitRates])

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("tokenCalculator.compare.subtitle")}</p>

      <Card className="space-y-3 p-4">
        <p className="text-muted-foreground text-xs font-medium">
          {t("tokenCalculator.compare.selectModels")}
        </p>
        <div className="flex gap-2">
          <Select
            value={selStandardId}
            onValueChange={(v) => {
              setSelStandardId(v)
              setSelModelName("")
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("tokenCalculator.compare.selectStandard")} />
            </SelectTrigger>
            <SelectContent>
              {standards.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selModelName} onValueChange={setSelModelName} disabled={!currentStandard}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("tokenCalculator.compare.selectModel")} />
            </SelectTrigger>
            <SelectContent>
              {currentStandard?.models.map((m, i) => (
                <SelectItem key={i} value={m.modelName}>
                  {m.modelName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="secondary"
            disabled={!currentStandard || !selModelName}
            onClick={addModel}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("tokenCalculator.compare.addModel")}
          </Button>
        </div>

        {selectedModels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedModels.map((sm, i) => (
              <Badge key={i} variant="secondary" className="gap-1 pr-1 select-none">
                <span className="text-muted-foreground text-[10px]">{sm.standardName}</span>
                <span className="font-medium">{sm.model.modelName}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeModel(i)}
                  aria-label={t("tokenCalculator.compare.removeModel")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <div className="flex items-center gap-2 select-none">
        <span className="text-muted-foreground text-xs">{t("tokenCalculator.compare.mode")}:</span>
        <div className="border-border flex rounded-md border">
          <Button
            size="xs"
            className={cn(
              "rounded-r-none border-0",
              mode === "workload"
                ? "bg-primary text-primary-foreground hover:bg-primary/80"
                : "text-muted-foreground hover:bg-muted bg-transparent",
            )}
            onClick={() => setMode("workload")}
          >
            {t("tokenCalculator.compare.modeWorkload")}
          </Button>
          <Button
            size="xs"
            className={cn(
              "rounded-l-none border-0",
              mode === "budget"
                ? "bg-primary text-primary-foreground hover:bg-primary/80"
                : "text-muted-foreground hover:bg-muted bg-transparent",
            )}
            onClick={() => setMode("budget")}
          >
            {t("tokenCalculator.compare.modeBudget")}
          </Button>
        </div>
      </div>

      {mode === "workload" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">
              {t("tokenCalculator.compare.inputTokens")}
            </label>
            <div className="flex gap-1">
              <Input
                className="w-28"
                type="number"
                min={0}
                step="any"
                value={inputTokens || ""}
                onChange={(e) => setInputTokens(parseNonNegativeNumber(e.target.value))}
              />
              <Select value={inputUnit} onValueChange={setInputUnit}>
                <SelectTrigger className="h-9 w-[72px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tokenUnits.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">
              {t("tokenCalculator.compare.outputTokens")}
            </label>
            <div className="flex gap-1">
              <Input
                className="w-28"
                type="number"
                min={0}
                step="any"
                value={outputTokens || ""}
                onChange={(e) => setOutputTokens(parseNonNegativeNumber(e.target.value))}
              />
              <Select value={outputUnit} onValueChange={setOutputUnit}>
                <SelectTrigger className="h-9 w-[72px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tokenUnits.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-muted-foreground pb-2 text-xs">
            {t("tokenCalculator.compare.totalTokens", {
              total: (actualInputTokens + actualOutputTokens).toLocaleString(),
            })}
          </p>
          <div className="flex items-center gap-3 select-none">
            <label className="text-muted-foreground text-xs whitespace-nowrap">
              {t("tokenCalculator.compare.ratioLabel")}:
            </label>
            <input
              type="range"
              min={0}
              max={7}
              step={1}
              value={selectedRatioPresetIndex}
              onChange={(e) => {
                const idx = parseNonNegativeInteger(e.target.value)
                handleRatioChange(RATIO_PRESETS[idx] ?? 1)
              }}
              className="bg-muted accent-primary [&::-webkit-slider-thumb]:bg-primary h-1.5 flex-1 cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-sm"
            />
            <span className="text-foreground min-w-[50px] text-right text-xs font-medium">
              {ratio} : 1
            </span>
          </div>
          <div className="bg-muted/50 text-muted-foreground w-full space-y-1 rounded-md px-3 py-2 text-xs leading-relaxed">
            <p>
              <strong>{t("tokenCalculator.compare.formulaInputTokens")}</strong> ={" "}
              {t("tokenCalculator.compare.formulaTotal")} × {ratio} / ({ratio} + 1) &nbsp;|&nbsp;{" "}
              <strong>{t("tokenCalculator.compare.formulaOutputTokens")}</strong> ={" "}
              {t("tokenCalculator.compare.formulaTotal")} × 1 / ({ratio} + 1)
            </p>
            <p>
              {t("tokenCalculator.compare.formulaCost")} = (
              <strong>{t("tokenCalculator.compare.formulaInputTokens")}</strong> / 1M) ×{" "}
              <strong>{t("tokenCalculator.compare.formulaEffInput")}</strong> + (
              <strong>{t("tokenCalculator.compare.formulaOutputTokens")}</strong> / 1M) ×{" "}
              <strong>{t("tokenCalculator.compare.formulaOutputPrice")}</strong>
            </p>
            <p>
              {t("tokenCalculator.compare.formulaEffInput")} = ((100 −{" "}
              {t("tokenCalculator.compare.cacheHitRate")}%) ×{" "}
              <strong>{t("tokenCalculator.compare.cacheWritePriceCol")}</strong> +{" "}
              {t("tokenCalculator.compare.cacheHitRate")}% ×{" "}
              <strong>{t("tokenCalculator.compare.cacheReadPriceCol")}</strong>) / 100
            </p>
          </div>
        </div>
      )}

      {mode === "budget" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">
              {t("tokenCalculator.compare.budgetAmount")}
            </label>
            <Input
              className="w-40"
              type="number"
              min={0}
              step="any"
              value={budget || ""}
              onChange={(e) => setBudget(parseNonNegativeNumber(e.target.value))}
            />
          </div>
          <p className="text-muted-foreground pb-2 text-xs">{displayCurrency}</p>
          <div className="flex min-w-[220px] items-center gap-3 pb-2 select-none">
            <label className="text-muted-foreground text-xs whitespace-nowrap">
              {t("tokenCalculator.compare.ratioLabel")}:
            </label>
            <input
              type="range"
              min={0}
              max={7}
              step={1}
              value={selectedRatioPresetIndex}
              onChange={(e) => {
                const idx = parseNonNegativeInteger(e.target.value)
                setRatio(RATIO_PRESETS[idx] ?? 1)
              }}
              className="bg-muted accent-primary [&::-webkit-slider-thumb]:bg-primary h-1.5 flex-1 cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-sm"
            />
            <span className="text-foreground min-w-[50px] text-right text-xs font-medium">
              {ratio} : 1
            </span>
          </div>
          <div className="bg-muted/50 text-muted-foreground w-full rounded-md px-3 py-2 text-xs leading-relaxed">
            <p>
              <strong>{t("tokenCalculator.compare.maxInputTokens")}</strong> ={" "}
              {t("tokenCalculator.compare.budgetAmount")} /{" "}
              <strong>{t("tokenCalculator.compare.formulaEffInput")}</strong> × 1M
            </p>
            <p>
              <strong>{t("tokenCalculator.compare.maxOutputTokens")}</strong> ={" "}
              {t("tokenCalculator.compare.budgetAmount")} /{" "}
              <strong>{t("tokenCalculator.compare.formulaOutputPrice")}</strong> × 1M
            </p>
            <p>
              <strong>{t("tokenCalculator.compare.maxMixedTokens")}</strong> ={" "}
              {t("tokenCalculator.compare.budgetAmount")} / ((
              <strong>{t("tokenCalculator.compare.formulaEffInput")}</strong> × {ratio} +{" "}
              <strong>{t("tokenCalculator.compare.formulaOutputPrice")}</strong>) / ({ratio} + 1)) ×
              1M
            </p>
            <p className="mt-0.5 text-[10px] opacity-60">
              {t("tokenCalculator.compare.formulaEffInput")} = ((100 −{" "}
              {t("tokenCalculator.compare.cacheHitRate")}%) ×{" "}
              {t("tokenCalculator.compare.cacheWritePriceCol")} +{" "}
              {t("tokenCalculator.compare.cacheHitRate")}% ×{" "}
              {t("tokenCalculator.compare.cacheReadPriceCol")}) / 100
            </p>
          </div>
        </div>
      )}

      {selectedModels.length > 0 && mode === "workload" && (
        <Card className="overflow-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left">{t("tokenCalculator.modelName")}</th>
                <th className="pb-2 text-center">{t("tokenCalculator.compare.cacheHitRate")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.inputPriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.cacheWritePriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.cacheReadPriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.outputPriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.totalCost")} (USD / CNY)</th>
              </tr>
            </thead>
            <tbody>
              {workloadResults.map((r, i) => {
                const cheapest = workloadResults[0]?.costUsd ?? 0
                const costRatio = cheapest > 0 ? r.costUsd / cheapest : 1
                const hasCache = hasCachePricing(r.model)
                return (
                  <tr key={i} className="border-muted border-b last:border-0">
                    <td className="py-2">
                      <span className="font-medium">{r.model.modelName}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">{r.standardName}</span>
                    </td>
                    <td className="py-2 text-center">
                      {hasCache ? (
                        <div className="inline-flex items-center gap-0.5">
                          <Input
                            className="h-7 w-14 px-1 text-center text-xs"
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            value={r.hitRate || ""}
                            onChange={(e) =>
                              setHitRate(r.standardId, r.model.modelName, parseNonNegativeInteger(e.target.value))
                            }
                          />
                          <span className="text-muted-foreground text-xs">%</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="text-muted-foreground py-2 text-right">
                      {formatPrice(r.inputPriceConv, displayCurrency)}
                    </td>
                    <td className="text-muted-foreground py-2 text-right">
                      {r.cacheWritePriceConv != null
                        ? formatPrice(r.cacheWritePriceConv, displayCurrency)
                        : "—"}
                    </td>
                    <td className="text-muted-foreground py-2 text-right">
                      {r.cacheReadPriceConv != null
                        ? formatPrice(r.cacheReadPriceConv, displayCurrency)
                        : "—"}
                    </td>
                    <td className="text-muted-foreground py-2 text-right">
                      {formatPrice(r.outputPriceConv, displayCurrency)}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-muted-foreground text-xs">
                          {formatCost(r.costUsd, "USD")}
                        </span>
                        <span
                          className={
                            i === 0
                              ? "text-xs font-semibold text-green-500"
                              : costRatio >= 10
                                ? "text-xs text-red-500"
                                : "text-xs"
                          }
                        >
                          {formatCost(r.costCny, "CNY")}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {selectedModels.length > 0 && mode === "budget" && (
        <Card className="overflow-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left">{t("tokenCalculator.modelName")}</th>
                <th className="pb-2 text-center">{t("tokenCalculator.compare.cacheHitRate")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.inputPriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.cacheWritePriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.cacheReadPriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.outputPriceCol")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.maxInputTokens")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.maxOutputTokens")}</th>
                <th className="pb-2 text-right">{t("tokenCalculator.compare.maxMixedTokens")}</th>
              </tr>
            </thead>
            <tbody>
              {budgetResults.map((r, i) => {
                const hasCache = hasCachePricing(r.model)
                return (
                  <tr key={i} className="border-muted border-b last:border-0">
                    <td className="py-2">
                      <span className="font-medium">{r.model.modelName}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs">{r.standardName}</span>
                    </td>
                    <td className="py-2 text-center">
                      {hasCache ? (
                        <div className="inline-flex items-center gap-0.5">
                          <Input
                            className="h-7 w-14 px-1 text-center text-xs"
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            value={r.hitRate || ""}
                            onChange={(e) =>
                              setHitRate(r.standardId, r.model.modelName, parseNonNegativeInteger(e.target.value))
                            }
                          />
                          <span className="text-muted-foreground text-xs">%</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="text-muted-foreground py-2 text-right">
                      {formatPrice(r.inputPriceConv, displayCurrency)}
                    </td>
                    <td className="text-muted-foreground py-2 text-right">
                      {r.cacheWritePriceConv != null
                        ? formatPrice(r.cacheWritePriceConv, displayCurrency)
                        : "—"}
                    </td>
                    <td className="text-muted-foreground py-2 text-right">
                      {r.cacheReadPriceConv != null
                        ? formatPrice(r.cacheReadPriceConv, displayCurrency)
                        : "—"}
                    </td>
                    <td className="text-muted-foreground py-2 text-right">
                      {formatPrice(r.outputPriceConv, displayCurrency)}
                    </td>
                    <td className="py-2 text-right">
                      {r.maxInput === Number.MAX_SAFE_INTEGER ? "∞" : r.maxInput.toLocaleString()}
                    </td>
                    <td className="py-2 text-right">
                      {r.maxOutput === Number.MAX_SAFE_INTEGER ? "∞" : r.maxOutput.toLocaleString()}
                    </td>
                    <td className="py-2 text-right font-semibold">
                      {r.maxMixed === Number.MAX_SAFE_INTEGER ? "∞" : r.maxMixed.toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {selectedModels.length === 0 && (
        <div className="text-muted-foreground flex h-40 items-center justify-center">
          <ArrowRightLeft className="mr-2 h-5 w-5" />
          {t("tokenCalculator.compare.selectHint")}
        </div>
      )}
    </div>
  )
}
