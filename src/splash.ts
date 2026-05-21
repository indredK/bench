import { canUseWindowControls, getAppWindowByLabel, getCurrentAppWindow } from "@/platform/window";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const showDelay = reduceMotion ? 220 : 1700;
const closeDelay = reduceMotion ? 420 : 2160;

async function finishSplash() {
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
  if (!canUseWindowControls()) return;
  document.body.classList.add("done");
  window.setTimeout(() => {
    void getCurrentAppWindow().then((win) => win.close());
  }, 240);
}

requestAnimationFrame(() => {
  document.body.classList.add("run");
  window.setTimeout(() => {
    void finishSplash();
  }, showDelay);
  window.setTimeout(() => {
    closeSplash();
  }, closeDelay);
});
