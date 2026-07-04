/**
 * Search Index / 搜索索引: static registry of searchable setting items.
 *
 * Each entry maps a setting's i18n label keys to its tab + section.
 * At search time, labels are translated via t() and matched against the query.
 */
import type { SettingsTab } from "./store"

export interface SearchEntry {
  tab: SettingsTab
  labelKey: string
  descKey?: string
  sectionKey: string
}

export interface SearchResult extends SearchEntry {
  label: string
  desc: string
  section: string
  tabLabel: string
}

export const SETTING_SEARCH_INDEX: SearchEntry[] = [
  // ── appearance ──
  {
    tab: "appearance",
    sectionKey: "systemSettings.display.title",
    labelKey: "systemSettings.display.batteryPercent",
    descKey: "systemSettings.display.batteryPercentDesc",
  },
  {
    tab: "appearance",
    sectionKey: "systemSettings.dock.title",
    labelKey: "systemSettings.dock.position",
  },
  {
    tab: "appearance",
    sectionKey: "systemSettings.dock.title",
    labelKey: "systemSettings.dock.minimizeScale",
    descKey: "systemSettings.dock.minimizeScaleDesc",
  },
  {
    tab: "appearance",
    sectionKey: "systemSettings.toggles.title",
    labelKey: "systemSettings.toggles.autohideDock",
    descKey: "systemSettings.toggles.autohideDockDesc",
  },
  {
    tab: "appearance",
    sectionKey: "systemSettings.toggles.title",
    labelKey: "systemSettings.toggles.dockShowRecents",
    descKey: "systemSettings.toggles.dockShowRecentsDesc",
  },
  {
    tab: "appearance",
    sectionKey: "systemSettings.toggles.title",
    labelKey: "systemSettings.toggles.hideDesktopIcons",
    descKey: "systemSettings.toggles.hideDesktopIconsDesc",
  },
  {
    tab: "appearance",
    sectionKey: "systemSettings.toggles.title",
    labelKey: "systemSettings.toggles.autohideMenuBar",
    descKey: "systemSettings.toggles.autohideMenuBarDesc",
  },
  {
    tab: "appearance",
    sectionKey: "systemSettings.screenshot.title",
    labelKey: "systemSettings.screenshot.disableShadow",
  },
  {
    tab: "appearance",
    sectionKey: "systemSettings.screenshot.title",
    labelKey: "systemSettings.screenshot.showThumbnail",
  },
  {
    tab: "appearance",
    sectionKey: "systemSettings.screenshot.title",
    labelKey: "systemSettings.screenshot.format",
  },
  {
    tab: "appearance",
    sectionKey: "systemSettings.screenshot.title",
    labelKey: "systemSettings.screenshot.saveLocation",
  },

  // ── security ──
  {
    tab: "security",
    sectionKey: "systemSettings.actions.lockPasswordTitle",
    labelKey: "systemSettings.actions.lockPassword",
    descKey: "systemSettings.actions.lockPasswordDesc",
  },
  {
    tab: "security",
    sectionKey: "systemSettings.actions.lockPasswordTitle",
    labelKey: "systemSettings.actions.lockPasswordDelay",
  },
  {
    tab: "security",
    sectionKey: "systemSettings.network.title",
    labelKey: "systemSettings.network.firewall",
    descKey: "systemSettings.network.firewallDesc",
  },
  {
    tab: "security",
    sectionKey: "systemSettings.network.title",
    labelKey: "systemSettings.network.ssh",
    descKey: "systemSettings.network.sshDesc",
  },
  {
    tab: "security",
    sectionKey: "systemSettings.network.title",
    labelKey: "systemSettings.network.screenSharing",
  },
  {
    tab: "security",
    sectionKey: "systemSettings.network.title",
    labelKey: "systemSettings.network.airdrop",
    descKey: "systemSettings.network.airdropDesc",
  },
  {
    tab: "security",
    sectionKey: "systemSettings.privacy.gatekeeper",
    labelKey: "systemSettings.privacy.gatekeeper",
  },
  {
    tab: "security",
    sectionKey: "systemSettings.privacy.title",
    labelKey: "systemSettings.privacy.camera",
  },
  {
    tab: "security",
    sectionKey: "systemSettings.privacy.title",
    labelKey: "systemSettings.privacy.microphone",
  },
  {
    tab: "security",
    sectionKey: "systemSettings.privacy.title",
    labelKey: "systemSettings.privacy.screenRecording",
  },
  {
    tab: "security",
    sectionKey: "systemSettings.privacy.title",
    labelKey: "systemSettings.privacy.fullDiskAccess",
  },
  {
    tab: "security",
    sectionKey: "systemSettings.privacy.title",
    labelKey: "systemSettings.privacy.location",
  },
  {
    tab: "security",
    sectionKey: "systemSettings.privacy.title",
    labelKey: "systemSettings.privacy.accessibility",
  },

  // ── system ──
  {
    tab: "system",
    sectionKey: "systemSettings.sleep.title",
    labelKey: "systemSettings.sleep.preventSleep",
    descKey: "systemSettings.sleep.preventSleepDesc",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.actions.title",
    labelKey: "systemSettings.actions.lockScreen",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.actions.title",
    labelKey: "systemSettings.actions.emptyTrash",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.actions.title",
    labelKey: "systemSettings.actions.sleepNow",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.actions.title",
    labelKey: "systemSettings.actions.reboot",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.actions.title",
    labelKey: "systemSettings.actions.shutdown",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.shortcuts.title",
    labelKey: "systemSettings.shortcuts.hotCorners",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.shortcuts.title",
    labelKey: "systemSettings.shortcuts.lockScreen",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.shortcuts.title",
    labelKey: "systemSettings.shortcuts.languageRegion",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.shortcuts.title",
    labelKey: "systemSettings.shortcuts.keyboard",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.finder.title",
    labelKey: "systemSettings.finder.hiddenFiles",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.finder.title",
    labelKey: "systemSettings.finder.pathBar",
    descKey: "systemSettings.finder.pathBarDesc",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.finder.title",
    labelKey: "systemSettings.finder.statusBar",
    descKey: "systemSettings.finder.statusBarDesc",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.finder.title",
    labelKey: "systemSettings.finder.libraryDir",
    descKey: "systemSettings.finder.libraryDirDesc",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.finder.title",
    labelKey: "systemSettings.finder.fileExtensions",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.finder.title",
    labelKey: "systemSettings.finder.noDsStore",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.toggles.batteryStrategy",
    labelKey: "systemSettings.toggles.lowPowerMode",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.toggles.batteryStrategy",
    labelKey: "systemSettings.toggles.screenSaver",
    descKey: "systemSettings.toggles.screenSaverDesc",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.browser.title",
    labelKey: "systemSettings.browser.title",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.keyboard.title",
    labelKey: "systemSettings.keyboard.fnKeys",
    descKey: "systemSettings.keyboard.fnKeysDesc",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.keyboard.title",
    labelKey: "systemSettings.keyboard.autoCorrect",
    descKey: "systemSettings.keyboard.autoCorrectDesc",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.keyboard.title",
    labelKey: "systemSettings.keyboard.smartQuotes",
    descKey: "systemSettings.keyboard.smartQuotesDesc",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.keyboard.title",
    labelKey: "systemSettings.keyboard.smartDashes",
    descKey: "systemSettings.keyboard.smartDashesDesc",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.keyboard.title",
    labelKey: "systemSettings.keyboard.autoCapitalize",
    descKey: "systemSettings.keyboard.autoCapitalizeDesc",
  },
  {
    tab: "system",
    sectionKey: "systemSettings.login.title",
    labelKey: "systemSettings.login.title",
  },

  // ── advanced ──
  {
    tab: "advanced",
    sectionKey: "systemSettings.login.launchAgents",
    labelKey: "systemSettings.login.launchAgents",
  },
  {
    tab: "advanced",
    sectionKey: "systemSettings.login.launchDaemons",
    labelKey: "systemSettings.login.launchDaemons",
  },
]

export function searchSettings(query: string, t: (key: string) => string): SearchResult[] {
  const q = query.toLowerCase().trim()
  if (!q) return []

  return SETTING_SEARCH_INDEX.map((entry) => ({
    ...entry,
    label: t(entry.labelKey),
    desc: entry.descKey ? t(entry.descKey) : "",
    section: t(entry.sectionKey),
    tabLabel: t(`systemSettings.tabs.${entry.tab}`),
  })).filter(
    (r) =>
      r.label.toLowerCase().includes(q) ||
      r.desc.toLowerCase().includes(q) ||
      r.section.toLowerCase().includes(q) ||
      r.tabLabel.toLowerCase().includes(q),
  )
}
