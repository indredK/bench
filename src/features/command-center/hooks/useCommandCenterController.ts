/**
 * Controller / 控制器: bridge store & use-cases to view; 只做视图桥接.
 */
import { useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { commandCenterUseCases } from "@/features/command-center/services/command-center.use-cases"
import { useCommandCenterStore } from "@/features/command-center/store"
import { useGuardedAsync, useGuardedAsyncSet } from "@/hooks/useGuardedAsync"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import { localizeError } from "@/lib/errors"
import { getErrorMessage } from "@/lib/tauri/errors"
import type { CommandCard } from "@/lib/tauri/types/command-center"

export function useCommandCenterController() {
  const { t } = useTranslation()

  const cards = useCommandCenterStore((s) => s.cards)
  const loading = useCommandCenterStore((s) => s.loading)
  const error = useCommandCenterStore((s) => s.error)
  const runStatus = useCommandCenterStore((s) => s.runStatus)
  const runOutcome = useCommandCenterStore((s) => s.runOutcome)

  const setCards = useCommandCenterStore((s) => s.setCards)
  const setLoading = useCommandCenterStore((s) => s.setLoading)
  const setError = useCommandCenterStore((s) => s.setError)
  const setRunStatus = useCommandCenterStore((s) => s.setRunStatus)
  const setRunOutcome = useCommandCenterStore((s) => s.setRunOutcome)

  const canUsePlatformFeatures = canUseDesktopFeatures()
  const { pendingKeys, run: runGuarded } = useGuardedAsyncSet<string>()
  // 命令中心同一时刻只跑一张卡；用全局锁防止并发运行导致终止误伤。
  const { run: runExclusive } = useGuardedAsync()

  const loadCards = useCallback(async () => {
    if (!commandCenterUseCases.isAvailable()) return
    setLoading(true)
    setError(null)
    try {
      const next = await commandCenterUseCases.listCards()
      setCards(next)
    } catch (err) {
      setError({ key: "commandCenter.errors.loadFailed", fallback: getErrorMessage(err) })
    } finally {
      setLoading(false)
    }
  }, [setCards, setError, setLoading])

  useEffect(() => {
    void loadCards()
  }, [loadCards])

  const saveCard = useCallback(
    async (card: CommandCard) => {
      setError(null)
      try {
        const next = await commandCenterUseCases.upsertCard({ ...card, updatedAt: Date.now() })
        setCards(next)
        return true
      } catch (err) {
        setError({ key: "commandCenter.errors.saveFailed", fallback: getErrorMessage(err) })
        return false
      }
    },
    [setCards, setError],
  )

  const deleteCard = useCallback(
    async (id: string) => {
      setError(null)
      try {
        const next = await commandCenterUseCases.deleteCard(id)
        setCards(next)
        return true
      } catch (err) {
        setError({ key: "commandCenter.errors.deleteFailed", fallback: getErrorMessage(err) })
        return false
      }
    },
    [setCards, setError],
  )

  const runCard = useCallback(
    async (card: CommandCard) => {
      await runExclusive(async () => {
        await runGuarded(card.id, async () => {
          setError(null)
          setRunStatus(card.id, "running")
          try {
            const result = await commandCenterUseCases.runCard(card)
            setRunStatus(card.id, result.success ? "success" : "failed")
            setRunOutcome(card.id, { status: result.success ? "success" : "failed", result })
          } catch (err) {
            setRunStatus(card.id, "failed")
            setRunOutcome(card.id, {
              status: "failed",
              result: {
                success: false,
                exitCode: null,
                stdout: "",
                stderr: getErrorMessage(err),
              },
            })
            setError({ key: "commandCenter.errors.runFailed", fallback: getErrorMessage(err) })
          }
        })
      })
    },
    [runExclusive, runGuarded, setError, setRunOutcome, setRunStatus],
  )

  const requiresConfirm = commandCenterUseCases.requiresConfirm
  const createDraft = commandCenterUseCases.createDraft
  const clearError = useCallback(() => setError(null), [setError])

  const cancelRun = useCallback(async () => {
    try {
      await commandCenterUseCases.cancelRun()
    } catch {
      // 取消命令本身失败可忽略（命令可能已结束）
    }
  }, [commandCenterUseCases])

  const exportCards = useCallback(
    async (path: string, cards: CommandCard[]) => {
      setError(null)
      try {
        return await commandCenterUseCases.exportCards(path, cards)
      } catch (err) {
        setError({ key: "commandCenter.errors.exportFailed", fallback: getErrorMessage(err) })
        return null
      }
    },
    [setError],
  )

  const importCards = useCallback(
    async (path: string) => {
      setError(null)
      try {
        const next = await commandCenterUseCases.importCards(path)
        setCards(next)
        return next
      } catch (err) {
        setError({ key: "commandCenter.errors.importFailed", fallback: getErrorMessage(err) })
        return null
      }
    },
    [setCards, setError],
  )

  const reorderCards = useCallback(
    async (orderedIds: string[]): Promise<boolean> => {
      const next = commandCenterUseCases.reorderByIds(cards, orderedIds)
      setCards(next)
      try {
        await commandCenterUseCases.reorderCards(next)
        return true
      } catch (err) {
        setError({ key: "commandCenter.errors.saveFailed", fallback: getErrorMessage(err) })
        return false
      }
    },
    [cards, setCards, setError],
  )

  return {
    canUsePlatformFeatures,
    cards,
    loading,
    error: error ? localizeError(t, error) : "",
    runStatus,
    runOutcome,
    runningIds: pendingKeys,
    loadCards,
    saveCard,
    deleteCard,
    runCard,
    cancelRun,
    exportCards,
    importCards,
    reorderCards,
    requiresConfirm,
    createDraft,
    clearError,
  }
}
