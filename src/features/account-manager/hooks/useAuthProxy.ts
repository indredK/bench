/**
 * Auth proxy / 外部登录代理: normalize URL via repository, surface account picker.
 */
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
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
import { canUseTauriCommands } from "@/platform/capabilities"
import { parseCommandError } from "@/lib/tauri/errors"

export const NEW_ACCOUNT = "__new__"
const MAX_PENDING_AUTH_PROXY_REQUESTS = 8

export type AuthProxyConfirmInput = {
  request: AuthProxyRequest
  selectedAccountId: string
  isNewAccount: boolean
  targetHost: string
  newAccountName: string
}

function useAuthProxyController() {
  const { t } = useTranslation()
  const [authProxyRequest, setAuthProxyRequest] = useState<AuthProxyRequest | null>(null)
  const [authProxyMatches, setAuthProxyMatches] = useState<AuthProxyMatch[]>([])
  const [authProxyHost, setAuthProxyHost] = useState<string>("")
  /** handle_browser_open 是否判定为 authorize-like 登录链接(F1:普通 URL 引导转快速登录)。 */
  const [authProxyIsAuthorize, setAuthProxyIsAuthorize] = useState(true)
  const [isAuthProxyOpen, setAuthProxyOpen] = useState(false)
  const activeRequestRef = useRef<AuthProxyRequest | null>(null)
  const pendingRequestsRef = useRef<BrowserOpenResult[]>([])
  const drainInFlightRef = useRef(false)
  const drainRequestedRef = useRef(false)

  const applyBrowserOpenResult = useCallback((result: BrowserOpenResult) => {
    const request = {
      ticketId: result.ticketId,
      expiresAtTs: result.expiresAtTs,
      hasReturnUrl: result.hasReturnUrl,
      returnScheme: result.returnScheme ?? null,
    }
    activeRequestRef.current = request
    setAuthProxyRequest(request)
    setAuthProxyMatches(result.matches)
    setAuthProxyHost(result.host)
    setAuthProxyIsAuthorize(result.isAuthorize)
    setAuthProxyOpen(true)
  }, [])

  const enqueueBrowserOpenResult = useCallback(
    (result: BrowserOpenResult) => {
      if (activeRequestRef.current || drainInFlightRef.current) {
        if (pendingRequestsRef.current.length >= MAX_PENDING_AUTH_PROXY_REQUESTS) {
          toast.warning(t("accountManager.toasts.authProxyQueueFull"))
          return
        }
        pendingRequestsRef.current.push(result)
        if (activeRequestRef.current) {
          toast.info(t("accountManager.toasts.authProxyQueued"))
        }
        return
      }
      applyBrowserOpenResult(result)
    },
    [applyBrowserOpenResult, t],
  )

  const openProxyForUrl = useCallback(
    async (url: string): Promise<boolean> => {
      if (!url) return false
      const isBenchAuth = url.startsWith("bench-auth://")
      const isWeb = url.startsWith("http://") || url.startsWith("https://")
      if (!isBenchAuth && !isWeb) return false
      try {
        const result = await accountManagerRepository.handleBrowserOpen(url)
        enqueueBrowserOpenResult(result)
        return true
      } catch (error) {
        console.warn("[auth-proxy] handle url failed:", parseCommandError(error).code)
        toast.error(t("accountManager.toasts.authProxyHandleFailed"))
        return false
      }
    },
    [enqueueBrowserOpenResult, t],
  )

  const drainPendingRequest = useCallback(async () => {
    if (drainInFlightRef.current) {
      drainRequestedRef.current = true
      return
    }
    if (activeRequestRef.current) return
    const queuedRequest = pendingRequestsRef.current.shift()
    if (queuedRequest) {
      applyBrowserOpenResult(queuedRequest)
      return
    }

    drainInFlightRef.current = true
    let retriedAfterWakeup = false
    let rescheduleAfterWakeup = false
    try {
      do {
        drainRequestedRef.current = false
        let result
        try {
          result = await accountManagerRepository.drainAuthProxyRequest()
        } catch (error) {
          if (drainRequestedRef.current && !retriedAfterWakeup) {
            retriedAfterWakeup = true
            continue
          }
          if (drainRequestedRef.current) {
            // A second notification arrived during the one bounded retry. Keep
            // the backend queue live without turning a persistent IPC failure
            // into an unbounded retry loop.
            rescheduleAfterWakeup = true
            drainRequestedRef.current = false
            break
          }
          drainRequestedRef.current = false
          console.warn("[auth-proxy] drain request failed:", parseCommandError(error).code)
          toast.error(t("accountManager.toasts.authProxyHandleFailed"))
          break
        }
        if (result.droppedCount > 0) {
          toast.warning(t("accountManager.toasts.authProxyInboxDropped"))
        }
        if (result.rejectedCount > 0) {
          toast.error(t("accountManager.toasts.authProxyInboxRejected"))
        }
        if (result.request) {
          if (activeRequestRef.current) {
            pendingRequestsRef.current.push(result.request)
          } else {
            applyBrowserOpenResult(result.request)
          }
        }
      } while (drainRequestedRef.current && !activeRequestRef.current)
    } finally {
      drainInFlightRef.current = false
      if (!activeRequestRef.current) {
        const nextRequest = pendingRequestsRef.current.shift()
        if (nextRequest) applyBrowserOpenResult(nextRequest)
        else if (rescheduleAfterWakeup) queueMicrotask(() => void drainPendingRequest())
      }
    }
  }, [applyBrowserOpenResult, t])

  useEffect(() => {
    if (!canUseTauriCommands()) return undefined
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
      setAuthProxyIsAuthorize(true)
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
    authProxyIsAuthorize,
    isAuthProxyOpen,
    setAuthProxyOpen: handleAuthProxyOpenChange,
    openProxyForUrl,
    confirmAuthProxy,
    NEW_ACCOUNT,
  }
}

type AuthProxyController = ReturnType<typeof useAuthProxyController>

const AuthProxyContext = createContext<AuthProxyController | null>(null)

/** Keep inbox/ticket ownership above feature routes so route changes cannot orphan drained tickets. */
export function AuthProxyProvider({ children }: { children: ReactNode }) {
  const controller = useAuthProxyController()
  return createElement(AuthProxyContext.Provider, { value: controller }, children)
}

export function useAuthProxy() {
  const controller = useContext(AuthProxyContext)
  if (!controller) {
    throw new Error("useAuthProxy must be used within AuthProxyProvider")
  }
  return controller
}
