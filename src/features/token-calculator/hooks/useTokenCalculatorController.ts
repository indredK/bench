/**
 * Controller / 控制器: bind token calculator page state; 连接价格标准与汇率刷新.
 */
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useGuardedAsync } from "@/hooks/useGuardedAsync"
import { getErrorMessage } from "@/lib/tauri/errors"
import {
  listPricingStandards,
  type PricingStandard,
} from "@/features/token-calculator/services/token-calculator.repository"
import {
  fetchUsdCnyExchangeRate,
  type ExchangeRateInfo,
} from "@/features/token-calculator/services/exchange-rate.use-cases"
import {
  DEFAULT_EXCHANGE_RATE,
  normalizeExchangeRate,
  type DisplayCurrency,
} from "@/features/token-calculator/model/pricing"

export function useTokenCalculatorController() {
  const { t } = useTranslation()

  const [standards, setStandards] = useState<PricingStandard[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("standards")

  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("USD")
  const [exchangeRate, setExchangeRate] = useState(DEFAULT_EXCHANGE_RATE)
  const [rateInfo, setRateInfo] = useState<ExchangeRateInfo | null>(null)
  const [rateLoading, setRateLoading] = useState(false)
  const { run: runRateRefresh } = useGuardedAsync()

  const refreshExchangeRate = useCallback(
    async (forceRefresh?: boolean) => {
      await runRateRefresh(async () => {
        setRateLoading(true)
        try {
          const info = await fetchUsdCnyExchangeRate({ forceRefresh })
          setRateInfo(info)
          setExchangeRate(info.rate)
          if (forceRefresh && !info.stale) {
            toast.success(t("tokenCalculator.exchangeRateUpdated"))
          }
        } catch {
          toast.error(t("tokenCalculator.exchangeRateFetchFailed"))
        } finally {
          setRateLoading(false)
        }
      })
    },
    [runRateRefresh, t],
  )

  useEffect(() => {
    void refreshExchangeRate()
  }, [refreshExchangeRate])

  const loadStandards = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await listPricingStandards()
      setStandards(data)
    } catch (error) {
      setLoadError(getErrorMessage(error, t("tokenCalculator.toasts.loadFailed")))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadStandards()
  }, [loadStandards])

  return {
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
  }
}

export type TokenCalculatorController = ReturnType<typeof useTokenCalculatorController>
