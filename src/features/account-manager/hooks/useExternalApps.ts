/**
 * External apps / 外部应用: load + revoke via use-cases.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases";
import type { ExternalApp, ExternalAppBinding } from "@/lib/tauri/types/account-manager";
import { useGuardedAsync } from "@/hooks/useGuardedAsync";

export function useExternalApps(accountId?: string | null, open = false) {
  const { t } = useTranslation();
  const [apps, setApps] = useState<ExternalApp[]>([]);
  const [bindings, setBindings] = useState<ExternalAppBinding[]>([]);
  const [loading, setLoading] = useState(false);
  const { pending: revoking, run: runRevoke } = useGuardedAsync();
  const [revokingAppId, setRevokingAppId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [appsList, bindingsList] = await accountManagerUseCases.listExternalApps(accountId);
      setApps(appsList);
      setBindings(bindingsList);
    } catch (error) {
      console.error("[external-apps] reload failed:", error);
      toast.error(t("accountManager.toasts.loadExternalAppsFailed"));
    } finally {
      setLoading(false);
    }
  }, [accountId, t]);

  useEffect(() => {
    if (open) {
      void reload();
    }
  }, [open, reload]);

  const revokeApp = useCallback(
    (appId: string) =>
      runRevoke(async () => {
        setRevokingAppId(appId);
        try {
          await accountManagerUseCases.revokeExternalApp(appId);
          await reload();
          toast.success(t("accountManager.toasts.revokeExternalAppSuccess"));
        } catch (error) {
          console.error("[external-apps] revoke failed:", error);
          toast.error(t("accountManager.toasts.revokeExternalAppFailed"));
        } finally {
          setRevokingAppId(null);
        }
      }),
    [reload, runRevoke, t],
  );

  return {
    apps,
    bindings,
    loading,
    revoking,
    revokingAppId,
    reload,
    revokeApp,
  };
}
