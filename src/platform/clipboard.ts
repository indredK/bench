/**
 * Platform Adapter / 平台适配: wrap runtime APIs; 统一封装运行时能力.
 *
 * navigator.clipboard.writeText requires a secure context and an active user
 * gesture. In dev preview over plain HTTP, in older WebKit variants, and in
 * some embedded WebViews it throws NotAllowedError. We fall through to the
 * legacy textarea + execCommand("copy") path so the copy still lands when
 * the modern API refuses (#093). The function still throws when both paths
 * fail so existing callers' try/catch error reporting keeps working.
 */
export async function writeClipboardText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* fall through to textarea fallback */
    }
  }
  if (!writeWithTextareaFallback(text)) {
    throw new Error("Clipboard write failed: no available copy mechanism");
  }
}

function writeWithTextareaFallback(text: string): boolean {
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  // Off-screen and non-interactive so the user doesn't see a flash or lose focus.
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  let ok = false;
  try {
    textarea.select();
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return ok;
}
