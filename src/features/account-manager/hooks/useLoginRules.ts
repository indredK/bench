/**
 * Login rules hook / 更新登录逻辑编排:
 *   打开弹窗 → 自动检查远程更新(loading) → 展示当前生效规则详情 →
 *   按范围更新(all | generic | site,按钮按远程 updatable 才可点)。
 * 防重入:updatingScope 非 null 期间忽略再次点击;检查期间按钮禁用。
 */
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"
import { translateError } from "@/lib/tauri/errors"
import type { LoginRulesOverview, LoginRulesUpdateScope } from "@/lib/tauri/types/account-manager"

export function useLoginRules({ website }: { website: string | null }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [overview, setOverview] = useState<LoginRulesOverview | null>(null)
  const [checking, setChecking] = useState(false)
  const [updatingScope, setUpdatingScope] = useState<LoginRulesUpdateScope | null>(null)

  /** 打开弹窗即检查远程（有更新才允许点更新按钮；检查中展示加载态）。 */
  const load = useCallback(async () => {
    if (!website) return
    setChecking(true)
    try {
      const result = await accountManagerUseCases.getLoginRulesOverview(website)
      setOverview(result)
    } catch (error) {
      setOverview(null)
      toast.error(translateError(t, error, t("accountManager.toasts.loginRulesCheckFailed")))
    } finally {
      setChecking(false)
    }
  }, [website, t])

  const openDialog = useCallback(() => {
    setOpen(true)
    setOverview(null)
    void load()
  }, [load])

  const closeDialog = useCallback(() => setOpen(false), [])

  const handleUpdate = useCallback(
    (scope: LoginRulesUpdateScope) => {
      if (!website || updatingScope) return
      setUpdatingScope(scope)
      accountManagerUseCases
        .updateLoginRules(scope, website)
        .then((report) => {
          if (report.updated.length > 0) {
            toast.success(
              t("accountManager.toasts.loginRulesUpdated", { count: report.updated.length }),
            )
          } else {
            toast.info(t("accountManager.toasts.loginRulesUpToDate"))
          }
        })
        .then(() => load())
        .catch((error) => {
          toast.error(translateError(t, error, t("accountManager.toasts.loginRulesUpdateFailed")))
        })
        .finally(() => setUpdatingScope(null))
    },
    [website, updatingScope, load, t],
  )

  return { open, overview, checking, updatingScope, openDialog, closeDialog, handleUpdate }
}
