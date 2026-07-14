/**
 * Auth proxy / 外部登录代理: normalize URL via repository, surface account picker.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { accountManagerRepository } from "@/features/account-manager/services/account-manager.repository"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import type {
  AuthProxyMatch,
  AuthProxyRequest,
  BrowserOpenResult,
} from "@/lib/tauri/types/account-manager"
import { listenToPlatformEvent } from "@/platform/events"
import { parseCommandError } from "@/lib/tauri/errors"

export const NEW_ACCOUNT = "__new__"

export type AuthProxyConfirmInput = {
  request: AuthProxyRequest
  selectedAccountId: string
  isNewAccount: boolean
  targetHost: string
  newAccountName: string
}

export function useAuthProxy() {
  const { t } = useTranslation()
  const [authProxyRequest, setAuthProxyRequest] = useState<AuthProxyRequest | null>(null)
  const [authProxyMatches, setAuthProxyMatches] = useState<AuthProxyMatch[]>([])
  const [authProxyHost, setAuthProxyHost] = useState<string>("")
  const [isAuthProxyOpen, setAuthProxyOpen] = useState(false)
  const activeRequestRef = useRef<AuthProxyRequest | null>(null)
  const drainInFlightRef = useRef(false)

  const applyBrowserOpenResult = useCallback((result: BrowserOpenResult) => {
    const request = {
      ticketId: result.ticketId,
      expiresAtTs: result.expiresAtTs,
      target: result.target,
      returnUrl: result.returnUrl ?? "",
      state: null,
      site: result.host,
    }
    activeRequestRef.current = request
    setAuthProxyRequest(request)
    setAuthProxyMatches(result.matches)
    setAuthProxyHost(result.host)
    setAuthProxyOpen(true)
  }, [])

  const openProxyForUrl = useCallback(
    async (url: string): Promise<boolean> => {
      if (!url) return false
      const isBenchAuth = url.startsWith("bench-auth://")
      const isWeb = url.startsWith("http://") || url.startsWith("https://")
      if (!isBenchAuth && !isWeb) return false
      try {
        const result = await accountManagerRepository.handleBrowserOpen(url)
        applyBrowserOpenResult(result)
        return true
      } catch (error) {
        console.warn("[auth-proxy] handle url failed:", parseCommandError(error).code)
        toast.error(t("accountManager.toasts.authProxyHandleFailed"))
        return false
      }
    },
    [applyBrowserOpenResult, t],
  )

  const drainPendingRequest = useCallback(async () => {
    if (activeRequestRef.current || drainInFlightRef.current) return
    drainInFlightRef.current = true
    try {
      const result = await accountManagerRepository.drainAuthProxyRequest()
      if (result.droppedCount > 0) {
        toast.warning(t("accountManager.toasts.authProxyInboxDropped"))
      }
      if (result.rejectedCount > 0) {
        toast.error(t("accountManager.toasts.authProxyInboxRejected"))
      }
      if (result.request) applyBrowserOpenResult(result.request)
    } catch (error) {
      console.warn("[auth-proxy] drain request failed:", parseCommandError(error).code)
      toast.error(t("accountManager.toasts.authProxyHandleFailed"))
    } finally {
      drainInFlightRef.current = false
    }
  }, [applyBrowserOpenResult, t])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    ;(async () => {
      try {
        const nextUnlisten = await listenToPlatformEvent(
          TAURI_EVENTS.accountManager.authProxyPending,
          () => {
            void drainPendingRequest()
          },
        )
        if (cancelled) {
          nextUnlisten()
          return
        }
        unlisten = nextUnlisten
        await drainPendingRequest()
      } catch (error) {
        if (!cancelled) {
          console.warn("[auth-proxy] inbox listener failed:", parseCommandError(error).code)
        }
      }
    })()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [drainPendingRequest])

  const handleAuthProxyOpenChange = useCallback(
    (open: boolean) => {
      setAuthProxyOpen(open)
      if (open) return
      activeRequestRef.current = null
      setAuthProxyRequest(null)
      setAuthProxyMatches([])
      setAuthProxyHost("")
      queueMicrotask(() => void drainPendingRequest())
    },
    [drainPendingRequest],
  )

  const confirmAuthProxy = useCallback(
    async (input: AuthProxyConfirmInput): Promise<boolean> => {
      const { request, selectedAccountId, isNewAccount, newAccountName } = input
      try {
        if (isNewAccount) {
          await accountManagerRepository.proxyLoginNewAccount(
            request.ticketId,
            newAccountName.trim() || null,
          )
        } else {
          await accountManagerRepository.proxyLogin(selectedAccountId, request.ticketId)
        }
        toast.success(t("accountManager.authProxy.loginStarted"))
        return true
      } catch (error) {
        console.warn("[auth-proxy] proxyLogin failed:", parseCommandError(error).code)
        toast.error(t("accountManager.toasts.proxyLoginFailed"))
        return false
      }
    },
    [t],
  )

  return {
    authProxyRequest,
    authProxyMatches,
    authProxyHost,
    isAuthProxyOpen,
    setAuthProxyOpen: handleAuthProxyOpenChange,
    openProxyForUrl,
    confirmAuthProxy,
    NEW_ACCOUNT,
  }
}
