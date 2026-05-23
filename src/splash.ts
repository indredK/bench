/**
 * Window Bootstrap / 窗口启动: coordinate startup windows; 只处理启动窗口.
 */
import { isMainReady } from "@/lib/tauri/commands/bootstrap";
import { WINDOW_BOOTSTRAP_EVENTS } from "@/lib/tauri/contracts";
import { canUseTauriEvents } from "@/platform/capabilities";
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

// Browser preview (`npm run dev` in a browser tab): no Tauri runtime, so no
// main window to show and no event will ever arrive. Fade out the splash
// markup immediately so developers don't see the spinner indefinitely (#106).
if (!canUseTauriEvents()) {
  document.body.classList.add("done");
} else {
  requestAnimationFrame(() => {
    document.body.classList.add("run");

    void (async () => {
      // Register the listener FIRST so we cannot miss the emit window. Once
      // registered, check the backend handshake flag (#103): if the main
      // window already marked itself ready, the emit may have happened
      // before we attached and we must reveal immediately. The listener
      // covers the normal path where main mounts after we subscribed.
      try {
        disposeReadyListener = await installReadyListener();
      } catch (error) {
        console.warn("Failed to install splash listener", error);
      }

      try {
        const ready = await isMainReady();
        if (ready) {
          void revealMainAndClose();
          return;
        }
      } catch (error) {
        console.warn("Failed to query main-ready flag", error);
      }
    })();

    fallbackTimer = window.setTimeout(() => {
      void revealMainAndClose();
    }, fallbackReadyDelay);
  });
}
