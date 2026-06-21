import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function readText(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

function get(obj, dottedKey) {
  return dottedKey.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`i18n/static guard failed: ${message}`);
    process.exit(1);
  }
}

const en = readJson("src/i18n/locales/en.json");
const zh = readJson("src/i18n/locales/zh.json");

const requiredKeys = [
  "common.appTitle",
  "theme.sectionTitle",
  "portManager.errors.desktopOnly",
  "portManager.errors.killOneFailed",
  "portManager.errors.killAllFailed",
  "appManager.errors.scanFailed",
  "appManager.errors.updateCheckFailed",
  "appManager.errors.missingMacAppStoreId",
  "appManager.errors.noDownloadUrl",
  "appManager.errors.genericBatchFailure",
];

for (const key of requiredKeys) {
  assert(typeof get(en, key) === "string" && get(en, key).length > 0, `missing en locale key ${key}`);
  assert(typeof get(zh, key) === "string" && get(zh, key).length > 0, `missing zh locale key ${key}`);
}

const settingsDialog = readText("src/components/common/SettingsDialog.tsx");
assert(!settingsDialog.includes('"Port Manager - DevTools"'), "SettingsDialog should not hardcode English app title");
assert(!settingsDialog.includes('"端口管理器 - DevTools"'), "SettingsDialog should not hardcode Chinese app title");
assert(settingsDialog.includes('i18n.t("common.appTitle")'), "SettingsDialog should resolve title from i18n");
assert(settingsDialog.includes('t("theme.sectionTitle")'), "SettingsDialog should use dedicated theme section title");

console.log("Frontend i18n/static guards passed.");
