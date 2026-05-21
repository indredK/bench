/**
 * Platform Adapter / 平台适配: wrap runtime APIs; 统一封装运行时能力.
 */
export async function writeClipboardText(text: string) {
  await navigator.clipboard.writeText(text);
}
