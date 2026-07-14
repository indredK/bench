import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { PricingStandard } from "@/features/token-calculator/services/token-calculator.repository"
import {
  convertPrice,
  effectiveInputPrice,
  estimateTokens,
  formatCost,
  formatPrice,
  hasCachePricing,
  parseNonNegativeInteger,
  type DisplayCurrency,
} from "@/features/token-calculator/model/pricing"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function CalculatorTab({
  standards,
  displayCurrency,
  exchangeRate,
}: {
  standards: PricingStandard[]
  displayCurrency: DisplayCurrency
  exchangeRate: number
}) {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const [selectedStandardId, setSelectedStandardId] = useState("")
  const [selectedModel, setSelectedModel] = useState("")
  const [cacheHitRate, setCacheHitRate] = useState(90)

  const tokenCount = estimateTokens(text)
  const standard = standards.find((s) => s.id === selectedStandardId) ?? null
  const modelPricing = standard?.models.find((m) => m.modelName === selectedModel) ?? null

  const inputPrice = modelPricing
    ? convertPrice(modelPricing.inputPrice, modelPricing.currency, displayCurrency, exchangeRate)
    : 0
  const outputPrice = modelPricing
    ? convertPrice(modelPricing.outputPrice, modelPricing.currency, displayCurrency, exchangeRate)
    : 0
  const cachedWritePrice =
    modelPricing?.cachedWritePrice != null
      ? convertPrice(
          modelPricing.cachedWritePrice,
          modelPricing.currency,
          displayCurrency,
          exchangeRate,
        )
      : null
  const cachedReadPrice =
    modelPricing?.cachedReadPrice != null
      ? convertPrice(
          modelPricing.cachedReadPrice,
          modelPricing.currency,
          displayCurrency,
          exchangeRate,
        )
      : null
  const usesCachePricing = modelPricing ? hasCachePricing(modelPricing) : false
  const effectiveCalculatorInputPrice = modelPricing
    ? effectiveInputPrice(
        inputPrice,
        cachedWritePrice,
        cachedReadPrice,
        usesCachePricing ? cacheHitRate : 0,
      )
    : 0
  const inputCost = (tokenCount / 1_000_000) * effectiveCalculatorInputPrice
  const outputCost = (tokenCount / 1_000_000) * outputPrice

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("tokenCalculator.calculator.subtitle")}</p>

      <Textarea
        className="min-h-[160px]"
        placeholder={t("tokenCalculator.calculator.textPlaceholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          value={selectedStandardId}
          onValueChange={(v) => {
            setSelectedStandardId(v)
            setSelectedModel("")
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("tokenCalculator.calculator.selectStandard")} />
          </SelectTrigger>
          <SelectContent>
            {standards.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedModel} onValueChange={setSelectedModel} disabled={!standard}>
          <SelectTrigger>
            <SelectValue placeholder={t("tokenCalculator.calculator.selectModel")} />
          </SelectTrigger>
          <SelectContent>
            {standard?.models.map((m, i) => (
              <SelectItem key={i} value={m.modelName}>
                {m.modelName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {modelPricing && usesCachePricing && (
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground text-xs">
            {t("tokenCalculator.compare.cacheHitRate")}:
          </label>
          <Input
            className="h-8 w-20 text-xs"
            type="number"
            min={0}
            max={100}
            step={5}
            value={cacheHitRate || ""}
            onChange={(e) =>
              setCacheHitRate(Math.min(100, parseNonNegativeInteger(e.target.value)))
            }
          />
          <span className="text-muted-foreground text-xs">%</span>
        </div>
      )}

      {text && (
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-xs">
                {t("tokenCalculator.calculator.estimatedTokens")}
              </p>
              <p className="text-2xl font-bold">{tokenCount.toLocaleString()}</p>
            </div>
            {modelPricing && (
              <>
                <div>
                  <p className="text-muted-foreground text-xs">
                    {t("tokenCalculator.calculator.inputCost")}
                  </p>
                  <p className="text-xl font-semibold">{formatCost(inputCost, displayCurrency)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">
                    {t("tokenCalculator.calculator.outputCost")}
                  </p>
                  <p className="text-xl font-semibold">{formatCost(outputCost, displayCurrency)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">
                    {t("tokenCalculator.calculator.totalCost")}
                  </p>
                  <p className="text-primary text-xl font-semibold">
                    {formatCost(inputCost + outputCost, displayCurrency)}
                  </p>
                </div>
              </>
            )}
          </div>
          {modelPricing && (
            <p className="text-muted-foreground mt-2 text-xs">
              {t("tokenCalculator.calculator.pricingInfo", {
                model: modelPricing.modelName,
                inputPrice: formatPrice(effectiveCalculatorInputPrice, displayCurrency),
                outputPrice: formatPrice(outputPrice, displayCurrency),
              })}
            </p>
          )}
        </Card>
      )}
    </div>
  )
}
