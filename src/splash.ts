import { Window, getCurrentWindow } from "@tauri-apps/api/window";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const showDelay = reduceMotion ? 220 : 1700;
const closeDelay = reduceMotion ? 420 : 2160;

async function finishSplash() {
  try {
    const main = await Window.getByLabel("main");
    if (!main) return;

    await main.show();
    await main.setFocus();
  } catch (error) {
    console.warn("Failed to show main window", error);
  }
}

function closeSplash() {
  document.body.classList.add("done");
  window.setTimeout(() => {
    void getCurrentWindow().close();
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
