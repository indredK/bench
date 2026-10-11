import { describe, expect, it } from "vitest"

import { permissionFamilyKey } from "./CapabilityMatrix"

describe("permissionFamilyKey", () => {
  it.each([
    ["photo_triage_trash", "photoFiles"],
    ["create_term", "terminology"],
    ["scan_dev_projects", "developerCleanup"],
    ["execute_category_cleanup", "storageCleanup"],
    ["update_pricing_standard", "pricingStandards"],
    ["douyin_assets_import_files", "mediaAssets"],
    ["ext_data_dir", "privateData"],
    ["ext_uninstall", "extensionManagement"],
    ["install_app", "installedApps"],
    ["cancel_batch_operation", "installedApps"],
  ])("groups %s under %s", (command, family) => {
    expect(permissionFamilyKey(command)).toBe(`extensionCenter.details.permissionFamily.${family}`)
  })

  it("keeps unrecognized commands visible with a generic explanation", () => {
    expect(permissionFamilyKey("future_host_command")).toBe(
      "extensionCenter.details.permissionFamily.hostCommand",
    )
  })
})
