/**
 * Window Bootstrap / 窗口启动: coordinate startup windows; 只处理启动窗口.
 */
import { WINDOW_BOOTSTRAP_EVENTS } from "@/lib/tauri/contracts";
import { listenToPlatformEvent } from "@/platform/events";
import { canUseWindowControls, getAppWindowByLabel, getCurrentAppWindow } from "@/platform/window";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const startTime = performance.now();
const minVisibleDuration = reduceMotion ? 180 : 820;
const fallbackReadyDelay = reduceMotion ? 260 : 1400;
const exitDuration = reduceMotion ? 120 : 260;

let splashCompleted = false;
let mainShown = false;
let fallbackTimer = 0;
let disposeReadyListener: (() => void) | undefined;

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function ensureMinVisibleDuration() {
  const elapsed = performance.now() - startTime;
  const remaining = Math.max(0, minVisibleDuration - elapsed);
  if (remaining > 0) {
    await wait(remaining);
  }
}

async function finishSplash() {
  if (mainShown) return;
  mainShown = true;

  try {
    const main = await getAppWindowByLabel("main");
    if (!main) return;

    await main.show();
    await main.setFocus();
  } catch (error) {
    console.warn("Failed to show main window", error);
  }
}

function closeSplash() {
  if (!canUseWindowControls() || splashCompleted) return;

  splashCompleted = true;
  window.clearTimeout(fallbackTimer);
  disposeReadyListener?.();
  document.body.classList.add("done");
  window.setTimeout(() => {
    void getCurrentAppWindow().then((win) => win.close());
  }, exitDuration);
}

async function revealMainAndClose() {
  await ensureMinVisibleDuration();
  await finishSplash();
  closeSplash();
}

async function installReadyListener() {
  return listenToPlatformEvent<null>(
    WINDOW_BOOTSTRAP_EVENTS.mainReady,
    () => {
      void revealMainAndClose();
    },
    { target: { kind: "Window", label: "splashscreen" } },
  );
}

requestAnimationFrame(() => {
  document.body.classList.add("run");

  void installReadyListener().then((unlisten) => {
    disposeReadyListener = unlisten;
  });

  fallbackTimer = window.setTimeout(() => {
    void revealMainAndClose();
  }, fallbackReadyDelay);
});
