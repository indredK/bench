/**
 * Window Bootstrap / 窗口启动: coordinate startup windows; 只处理启动窗口.
 */
import { animate } from "motion";
import { isMainReady } from "@/lib/tauri/commands/bootstrap";
import { WINDOW_BOOTSTRAP_EVENTS } from "@/lib/tauri/contracts";
import { canUseTauriEvents } from "@/platform/capabilities";
import { listenToPlatformEvent } from "@/platform/events";
import { canUseWindowControls, getAppWindowByLabel, getCurrentAppWindow } from "@/platform/window";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const startTime = performance.now();
const minVisibleDuration = reduceMotion ? 140 : 820;
const fallbackReadyDelay = reduceMotion ? 220 : 1100;
const exitDuration = reduceMotion ? 120 : 760;
const previewPhase = new URLSearchParams(window.location.search).get("preview");

const SCRAMBLE_CHARS = "!<>-_\\/[]{}—=+*^?#@&%$";
const CODENAME_TARGET = "BENCH-OS";

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

/**
 * Drive the sci-fi codename reveal: each letter cycles through random glyphs
 * and locks left-to-right, while a scan line draws under it and a status
 * indicator pulses in. Orchestrated with motion's `animate()` so timings and
 * easings stay declarative.
 */
function startCodenameSequence() {
  if (reduceMotion) return;
  const container = document.querySelector<HTMLElement>(".codename");
  const glyphRoot = document.querySelector<HTMLElement>(".codename-glyphs");
  const bar = document.querySelector<HTMLElement>(".codename-bar");
  const status = document.querySelector<HTMLElement>(".codename-status");
  if (!container || !glyphRoot || !bar || !status) return;

  const letters = Array.from(glyphRoot.querySelectorAll<HTMLSpanElement>("span"));
  if (letters.length === 0) return;

  // Container drift-in (subtle vertical settle).
  animate(
    container,
    { opacity: [0, 1], y: [6, 0] },
    { duration: 0.22, delay: 0.08, ease: [0.22, 1, 0.36, 1] },
  );

  // Scramble each letter: random glyph cycling until its reveal moment,
  // driven by a single value-tween (0 → 1) so all characters share a clock.
  animate(0, 1, {
    duration: 0.42,
    delay: 0.12,
    ease: "easeOut",
    onUpdate: (progress) => {
      const revealCount = Math.floor(progress * CODENAME_TARGET.length);
      for (let i = 0; i < CODENAME_TARGET.length; i++) {
        const slot = letters[i];
        if (!slot) continue;
        if (i < revealCount) {
          if (slot.textContent !== CODENAME_TARGET[i]) {
            slot.textContent = CODENAME_TARGET[i] ?? "";
            slot.style.color = "";
          }
        } else {
          const glyph = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          slot.textContent = glyph ?? "_";
          slot.style.color = "var(--cyan)";
        }
      }
    },
    onComplete: () => {
      letters.forEach((slot, i) => {
        slot.textContent = CODENAME_TARGET[i] ?? "";
        slot.style.color = "";
      });
    },
  });

  // Underline scan: draw outward and pulse a highlight sweep across.
  animate(bar, { scaleX: [0, 1] }, { duration: 0.32, delay: 0.18, ease: [0.22, 1, 0.36, 1] });

  // Status text + dot fade in after the codename has locked.
  animate(
    status,
    { opacity: [0, 0.92], y: [3, 0] },
    { duration: 0.2, delay: 0.4, ease: "easeOut" },
  );
}

requestAnimationFrame(() => {
  document.body.classList.add("run");
  startCodenameSequence();

  // Browser preview (`npm run dev` in a browser tab): keep the splash in its
  // settled state so animation/layout work can be inspected without a Tauri
  // runtime driving the window handshake.
  if (!canUseTauriEvents()) {
    if (previewPhase === "done") {
      window.setTimeout(() => {
        document.body.classList.add("done");
      }, reduceMotion ? 120 : 980);
    }
    return;
  }

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

async function installReadyListener() {
  return listenToPlatformEvent<null>(
    WINDOW_BOOTSTRAP_EVENTS.mainReady,
    () => {
      void revealMainAndClose();
    },
    { target: { kind: "Window", label: "splashscreen" } },
  );
}
