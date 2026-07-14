import { useTranslation } from "react-i18next"
import { RefreshCw } from "lucide-react"
import { FeatureLoadError } from "@/components/common/FeatureLoadError"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { cn } from "@/lib/utils"

import type { PricingStandard } from "@/features/token-calculator/services/token-calculator.repository"
import type { DisplayCurrency } from "@/features/token-calculator/model/pricing"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useTokenCalculatorController } from "@/features/token-calculator/hooks/useTokenCalculatorController"
import { StandardsTab } from "@/features/token-calculator/components/StandardsTab"
import { CompareTab } from "@/features/token-calculator/components/CompareTab"
import { CalculatorTab } from "@/features/token-calculator/components/CalculatorTab"

export default function TokenCalculatorPage() {
  const { t } = useTranslation()
  const {
    standards,
    loading,
    loadError,
    activeTab,
    setActiveTab,
    displayCurrency,
    setDisplayCurrency,
    exchangeRate,
    setExchangeRate,
    rateInfo,
    rateLoading,
    refreshExchangeRate,
    loadStandards,
    normalizeExchangeRate,
  } = useTokenCalculatorController()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">{t("tokenCalculator.loading")}</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <FeatureLoadError
        title={t("tokenCalculator.loadFailedTitle")}
        description={loadError}
        onRetry={() => void loadStandards()}
      />
    )
  }

  const currencyToolbar = (
    <div className="flex items-center gap-2 select-none">
      <span className="text-muted-foreground text-xs">{t("tokenCalculator.displayCurrency")}:</span>
      <div className="border-border flex rounded-md border">
        <Button
          size="xs"
          className={cn(
            "rounded-r-none border-0",
            displayCurrency === "USD"
              ? "bg-primary text-primary-foreground hover:bg-primary/80"
              : "text-muted-foreground hover:bg-muted bg-transparent",
          )}
          onClick={() => setDisplayCurrency("USD")}
        >
          USD
        </Button>
        <Button
          size="xs"
          className={cn(
            "rounded-l-none border-0",
            displayCurrency === "CNY"
              ? "bg-primary text-primary-foreground hover:bg-primary/80"
              : "text-muted-foreground hover:bg-muted bg-transparent",
          )}
          onClick={() => setDisplayCurrency("CNY")}
        >
          CNY
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {t("tokenCalculator.exchangeRate")}:
        </span>
        <Input
          className="h-7 w-16 text-xs"
          type="number"
          min={0.1}
          step={0.1}
          value={exchangeRate || ""}
          onChange={(e) => setExchangeRate(normalizeExchangeRate(parseFloat(e.target.value)))}
        />
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={rateLoading}
          title={t("tokenCalculator.exchangeRateRefresh")}
          onClick={() => void refreshExchangeRate(true)}
        >
          <RefreshCw size={14} className={rateLoading ? "animate-spin" : undefined} />
        </Button>
        {rateInfo ? (
          <Badge
            variant={rateInfo.stale ? "secondary" : "outline"}
            className="text-[10px] font-normal"
            title={
              rateInfo.stale
                ? t("tokenCalculator.exchangeRateStale")
                : t("tokenCalculator.exchangeRateSource", { source: rateInfo.source })
            }
          >
            {rateInfo.stale
              ? t("tokenCalculator.exchangeRateStale")
              : t("tokenCalculator.exchangeRateSource", { source: rateInfo.source })}
          </Badge>
        ) : null}
      </div>
    </div>
  )

  const sharedProps: {
    standards: PricingStandard[]
    displayCurrency: DisplayCurrency
    exchangeRate: number
  } = { standards, displayCurrency, exchangeRate }

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("tokenCalculator.title")}</h1>
        {currencyToolbar}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList className="mb-4 w-fit select-none">
          <TabsTrigger value="standards" className="select-none">
            {t("tokenCalculator.tabs.standards")}
          </TabsTrigger>
          <TabsTrigger value="compare" className="select-none">
            {t("tokenCalculator.tabs.compare")}
          </TabsTrigger>
          <TabsTrigger value="calculator" className="select-none">
            {t("tokenCalculator.tabs.calculator")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="standards" className="min-h-0 flex-1" forceMount>
          <ScrollableArea className="h-full" wrapperClassName="h-full">
            <StandardsTab {...sharedProps} onRefresh={loadStandards} />
          </ScrollableArea>
        </TabsContent>

        <TabsContent value="compare" className="min-h-0 flex-1" forceMount>
          <ScrollableArea className="h-full" wrapperClassName="h-full">
            <CompareTab {...sharedProps} />
          </ScrollableArea>
        </TabsContent>

        <TabsContent value="calculator" className="min-h-0 flex-1" forceMount>
          <ScrollableArea className="h-full" wrapperClassName="h-full">
            <CalculatorTab {...sharedProps} />
          </ScrollableArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
