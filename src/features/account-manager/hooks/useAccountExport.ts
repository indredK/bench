/**
 * Account export hook / 账号快照导出编排:
 * 打开弹窗时向后端生成全量快照 JSON(解密 Cookie/存储/密码),完成后提供
 * 「复制到剪贴板」与「导出为 JSON 文件」两个出口;去向由用户决定。
 */
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"
import { useAccountManagerStore } from "@/features/account-manager/store"
import { writeTextFile } from "@/lib/tauri/commands/file-ops"
import { savePlatformDialog } from "@/platform/dialog"
import { translateError } from "@/lib/tauri/errors"

/** 账号名 → 安全文件名片段:仅保留字母/数字/连字符/下划线,其余折叠为下划线。 */
function sanitizeFileName(name: string): string {
  const safe = name
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
  return safe || "account"
}

export function useAccountExport() {
  const { t } = useTranslation()
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  /** 打开弹窗:登记目标账号并立即生成快照;失败时提示并回退关闭。 */
  const openDialog = useCallback(
    (accountId: string, accountName: string) => {
      const s = useAccountManagerStore.getState()
      s.setAccountExportTarget({ accountId, accountName })
      s.setAccountExportOpen(true)
      setSnapshot(null)
      setLoading(true)
      accountManagerUseCases
        .exportAccountSnapshot(accountId)
        .then((json) => {
          setSnapshot(json)
          return json
        })
        .catch((error) => {
          useAccountManagerStore.getState().setAccountExportOpen(false)
          toast.error(
            translateError(t, error, t("accountManager.exportSnapshot.toasts.loadFailed")),
          )
        })
        .finally(() => setLoading(false))
    },
    [t],
  )

  const copyToClipboard = useCallback(async () => {
    if (!snapshot) return
    try {
      await navigator.clipboard.writeText(snapshot)
      toast.success(t("accountManager.exportSnapshot.toasts.copied"))
    } catch {
      toast.error(t("accountManager.exportSnapshot.toasts.copyFailed"))
    }
  }, [snapshot, t])

  const saveAsJson = useCallback(async () => {
    const target = useAccountManagerStore.getState().accountExportTarget
    if (!snapshot || !target) return
    const selected = await savePlatformDialog({
      canCreateDirectories: true,
      defaultPath: `bench-account-${sanitizeFileName(target.accountName)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    })
    if (!selected) return
    setSaving(true)
    try {
      await writeTextFile(selected, snapshot)
      toast.success(t("accountManager.exportSnapshot.toasts.saved"))
    } catch (error) {
      toast.error(translateError(t, error, t("accountManager.exportSnapshot.toasts.saveFailed")))
    } finally {
      setSaving(false)
    }
  }, [snapshot, t])

  return {
    openDialog,
    copyToClipboard,
    saveAsJson,
    loading,
    saving,
    ready: snapshot !== null,
  }
}
