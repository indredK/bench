/**
 * Window Bootstrap / 窗口启动: 应用启动即驻留托盘。
 *
 * 所有启动方式（开机自启、手动打开）都不弹窗口、不驻留程序坞：
 * 本窗口（splashscreen）静默自关，主窗口保持 visible:false，由托盘图标
 * 点击唤出（tray.rs show_main_window）。浏览器预览模式仅用于样式调试。
 */
import { canUseTauriEvents } from "@/platform/capabilities"
import { canUseWindowControls, getCurrentAppWindow } from "@/platform/window"

if (canUseTauriEvents()) {
  window.setTimeout(() => {
    if (!canUseWindowControls()) return
    void getCurrentAppWindow().then((win) => win.close())
  }, 300)
}
