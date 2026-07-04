/**
 * Auth proxy / 外部登录代理: normalize URL via repository, surface account picker.
 */
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { accountManagerRepository } from "@/features/account-manager/services/account-manager.repository"
import type { AuthProxyMatch, AuthProxyRequest } from "@/lib/tauri/types/account-manager"

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

  const openProxyForUrl = useCallback(
    async (url: string): Promise<boolean> => {
      if (!url) return false
      const isBenchAuth = url.startsWith("bench-auth://")
      const isWeb = url.startsWith("http://") || url.startsWith("https://")
      if (!isBenchAuth && !isWeb) return false
      try {
        const result = await accountManagerRepository.handleBrowserOpen(url)
        setAuthProxyRequest({
          target: result.target,
          returnUrl: result.returnUrl ?? "",
          state: null,
          site: result.host,
        })
        setAuthProxyMatches(result.matches)
        setAuthProxyHost(result.host)
        setAuthProxyOpen(true)
        return true
      } catch (error) {
        console.warn("[auth-proxy] handle url failed:", error)
        toast.error(t("accountManager.toasts.authProxyHandleFailed"))
        return false
      }
    },
    [t],
  )

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    const handleUrl = (url: string) => void openProxyForUrl(url)

    ;(async () => {
      try {
        const { onOpenUrl, getCurrent } = await import("@tauri-apps/plugin-deep-link")
        try {
          const current = await getCurrent()
          if (current) {
            for (const url of current) await openProxyForUrl(url)
          }
        } catch {
          /* getCurrent unavailable on some platforms */
        }
        unlisten = await onOpenUrl((urls) => {
          for (const url of urls) void handleUrl(url)
        })
        if (cancelled) unlisten?.()
      } catch (error) {
        console.debug("[auth-proxy] deep-link plugin unavailable:", error)
      }
    })()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [openProxyForUrl])

  const confirmAuthProxy = useCallback(
    async (input: AuthProxyConfirmInput): Promise<boolean> => {
      const { request, selectedAccountId, isNewAccount, targetHost, newAccountName } = input
      try {
        if (isNewAccount) {
          await accountManagerRepository.proxyLoginNewAccount(
            targetHost,
            request.target,
            request.returnUrl,
            newAccountName.trim() || null,
          )
        } else {
          await accountManagerRepository.proxyLogin(
            selectedAccountId,
            request.target,
            request.returnUrl,
          )
        }
        toast.success(t("accountManager.authProxy.loginStarted"))
        return true
      } catch (error) {
        console.warn("[auth-proxy] proxyLogin failed:", error)
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
    setAuthProxyOpen,
    openProxyForUrl,
    confirmAuthProxy,
    NEW_ACCOUNT,
  }
}
