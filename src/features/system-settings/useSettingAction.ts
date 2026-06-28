/**
 * useSettingAction / 设置操作 hook: 统一包装异步设置操作。
 *
 * 加载状态设计 (antd Switch 风格 + 按开关精细化):
 * - 调用 run(key, action) 时,把 key 加入 store.applyingKeys 集合,
 *   触发对应 Switch 组件内部的 loading 动画 (Loader2Icon 旋转)
 * - 不同 key 之间可以并行:操作开关 A 时,开关 B 不会进入 loading,且仍可点击
 * - 同一 key 不可并发:防止用户对同一开关快速重复点击造成状态错乱
 * - 加载态完全由开关内部 spinner 承载,不使用 toast.loading 文字提示,避免文字闪烁
 * - 操作结果 (成功/失败) 仍通过 toast 通知用户,确保操作反馈完整
 *
 * 兼容返回值:
 * - applying: boolean = applyingKeys.size > 0,用于 Button 的 disabled
 *   (Button 类控件通常代表"动作"而非"状态",动作期间禁用所有同类按钮更安全)
 * - applyingKeys: Set<string>,用于 Switch 的 loading 精细化判断
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useSystemSettingsStore } from "./store";

export function useSettingAction() {
  const { t } = useTranslation();
  const applyingKeys = useSystemSettingsStore((s) => s.applyingKeys);
  const setApplyingKey = useSystemSettingsStore((s) => s.setApplyingKey);

  const run = useCallback(async <T,>(
    key: string,
    action: () => Promise<T>,
    opts?: { success?: string; error?: string }
  ): Promise<T | undefined> => {
    // 同一 key 不可并发:防止用户对同一开关快速重复点击造成状态错乱
    if (applyingKeys.has(key)) return undefined;
    setApplyingKey(key, true);
    // 加载态由 Switch 内部 spinner 表达,无需 toast.loading 文字提示
    try {
      const result = await action();
      // 操作成功通知 (操作反馈是必要的,与加载态分离)
      toast.success(opts?.success ?? t("systemSettings.toasts.success"));
      return result;
    } catch (err) {
      toast.error(
        opts?.error ?? t("systemSettings.toasts.error", { error: String(err) })
      );
      return undefined;
    } finally {
      setApplyingKey(key, false);
    }
  }, [applyingKeys, setApplyingKey, t]);

  // applying 是 applyingKeys 非空的派生值,保留以兼容旧 Button disabled 用法
  return { run, applyingKeys, applying: applyingKeys.size > 0 };
}
