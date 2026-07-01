/**
 * Auth proxy / 外部登录代理: normalize a "open with bench" URL (bench-auth:// or a
 * raw http(s) login link) via the backend, then surface an account picker.
 * Shared by the deep-link listener and the "paste login link" button.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "@/features/account-manager/api";

export function useAuthProxy() {
  const { t } = useTranslation();
  const [authProxyRequest, setAuthProxyRequest] = useState<api.AuthProxyRequest | null>(null);
  const [authProxyMatches, setAuthProxyMatches] = useState<api.AuthProxyMatch[]>([]);
  const [authProxyHost, setAuthProxyHost] = useState<string>("");
  const [isAuthProxyOpen, setAuthProxyOpen] = useState(false);
  const [isProxyPasteOpen, setProxyPasteOpen] = useState(false);

  const openProxyForUrl = useCallback(
    async (url: string): Promise<boolean> => {
      if (!url) return false;
      const isBenchAuth = url.startsWith("bench-auth://");
      const isWeb = url.startsWith("http://") || url.startsWith("https://");
      if (!isBenchAuth && !isWeb) return false;
      try {
        const result = await api.handleBrowserOpen(url);
        setAuthProxyRequest({
          target: result.target,
          returnUrl: result.returnUrl ?? "",
          state: null,
          site: result.host,
        });
        setAuthProxyMatches(result.matches);
        setAuthProxyHost(result.host);
        setAuthProxyOpen(true);
        return true;
      } catch (error) {
        console.warn("[auth-proxy] handle url failed:", error);
        toast.error(t("accountManager.toasts.authProxyHandleFailed"));
        return false;
      }
    },
    [t],
  );

  // 外部登录代理:监听 bench-auth:// / http(s) 深链事件
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const handleUrl = (url: string) => void openProxyForUrl(url);

    (async () => {
      try {
        const { onOpenUrl, getCurrent } = await import(
          "@tauri-apps/plugin-deep-link"
        );
        // 冷启动:应用因 bench-auth:// 被唤起时,先消费启动时携带的 URL。
        try {
          const current = await getCurrent();
          if (current) {
            for (const url of current) await openProxyForUrl(url);
          }
        } catch {
          // getCurrent 在部分平台可能不可用,忽略。
        }
        // 运行期:监听后续的 bench-auth:// 唤起。
        unlisten = await onOpenUrl((urls) => {
          for (const url of urls) void handleUrl(url);
        });
        if (cancelled) unlisten?.();
      } catch (error) {
        // deep-link 插件不可用 (非 Tauri 环境) — 静默跳过
        console.debug("[auth-proxy] deep-link plugin unavailable:", error);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [openProxyForUrl]);

  return {
    authProxyRequest,
    authProxyMatches,
    authProxyHost,
    isAuthProxyOpen,
    setAuthProxyOpen,
    isProxyPasteOpen,
    setProxyPasteOpen,
    openProxyForUrl,
  };
}
