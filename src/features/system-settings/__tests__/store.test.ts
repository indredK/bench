import { beforeEach, describe, expect, it } from "vitest"
import { useSystemSettingsStore } from "@/features/system-settings/store"
import type { SystemSettingsSnapshot } from "@/lib/tauri/types/system-settings"

const snapshot: SystemSettingsSnapshot = {
  finder: {
    show_hidden_files: true,
    show_pathbar: false,
    show_statusbar: null,
    show_library_dir: true,
    show_file_extensions: false,
    no_ds_store: true,
  },
  screenshot: {
    format: "png",
    disable_shadow: false,
    show_thumbnail: true,
    save_location: "/tmp",
  },
  network: {
    firewall: true,
    ssh: null,
    screen_sharing: false,
    airdrop_disabled: true,
  },
  toggles: {
    autohide_dock: true,
    autohide_menu_bar: "always",
    dock_show_recents: false,
    hide_desktop_icons: true,
    low_power_mode: "on_battery_only",
    screen_saver: null,
  },
}

describe("system settings snapshot", () => {
  beforeEach(() => {
    useSystemSettingsStore.setState({
      loadedTabs: new Set(),
      defaultBrowser: null,
    })
  })

  it("applies canonical values and preserves unknown fields as null", () => {
    useSystemSettingsStore.getState().applySnapshot(snapshot)

    const state = useSystemSettingsStore.getState()
    expect(state.finderShowHiddenFiles).toBe(true)
    expect(state.finderShowStatusbar).toBeNull()
    expect(state.networkSsh).toBeNull()
    expect(state.autohideMenuBar).toBe("always")
    expect(state.lowPowerMode).toBe("on_battery_only")
    expect(state.screenSaver).toBeNull()
  })
})
