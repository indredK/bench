/**
 * Drag helpers / HTML5 拖拽辅助（photo-triage）.
 * Tauri 的 WKWebView 对普通 `<div>`（非 `<img>`）默认不生成跟随鼠标的 drag ghost——
 * py 版跑在 Safari/Chrome 里靠浏览器默认快照，进 Tauri 后拖到中途图片会消失。
 * 这里用 `setDragImage` 显式指定跟随图（源元素克隆，居中、限宽高、半透明）。
 */

/** 用源元素克隆设置拖拽跟随图；快照在 dragstart 捕获，短暂延迟后移除临时元素。 */
export function setDragImage(
  e: { dataTransfer: DataTransfer },
  source: HTMLElement,
  maxSize = 160,
): void {
  const rect = source.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const scale = Math.min(1, maxSize / Math.max(rect.width, rect.height))
  const w = Math.max(48, Math.round(rect.width * scale))
  const h = Math.max(48, Math.round(rect.height * scale))
  const ghost = source.cloneNode(true) as HTMLElement
  ghost.style.cssText =
    `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px;margin:0;` +
    `pointer-events:none;z-index:9999;border-radius:8px;overflow:hidden;opacity:.85;`
  document.body.appendChild(ghost)
  e.dataTransfer.setDragImage(ghost, w / 2, h / 2)
  // WebKit 可能稍后才截取快照，稍延迟再移除；元素位于视口外（-9999px）无副作用
  window.setTimeout(() => ghost.remove(), 100)
}
