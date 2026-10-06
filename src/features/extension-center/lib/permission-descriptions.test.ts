import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import en from "@/i18n/locales/en.json"
import zh from "@/i18n/locales/zh.json"

import { describePermission, getPermissionDescriptionKeys } from "./permission-descriptions"

const ACL_SOURCE = readFileSync(
  resolve(process.cwd(), "src-tauri/src/extension_host/acl.rs"),
  "utf8",
)
const ACL_COMMAND_BLOCK = ACL_SOURCE.match(
  /pub const EXTENSION_ALLOWED_COMMANDS:[\s\S]*?= &\[([\s\S]*?)\n\];/,
)?.[1]

function exposedAclCommands(): string[] {
  if (!ACL_COMMAND_BLOCK) throw new Error("Could not read EXTENSION_ALLOWED_COMMANDS")
  return [...ACL_COMMAND_BLOCK.matchAll(/^\s*"([^"]+)",/gm)].map((match) => match[1]!)
}

function localeTranslator(locale: unknown): (key: string) => string {
  return (key) => {
    let value = locale
    for (const segment of key.split(".")) {
      if (typeof value !== "object" || value === null) return key
      value = (value as Record<string, unknown>)[segment]
    }
    return typeof value === "string" && value.trim() ? value : key
  }
}

describe("extension permission descriptions", () => {
  it("provides localized descriptions for every command exposed by the Rust ACL", () => {
    const descriptions = getPermissionDescriptionKeys()
    const translateEn = localeTranslator(en)
    const translateZh = localeTranslator(zh)

    for (const command of exposedAclCommands()) {
      expect(descriptions[command], command).toBeDefined()
      expect(describePermission(command, translateEn), command).not.toMatch(/^extensionCenter\./)
      expect(describePermission(command, translateZh), command).not.toMatch(/^extensionCenter\./)
    }
  })

  it("uses the active locale for sensitive permissions", () => {
    expect(describePermission("authorize_mac_app", localeTranslator(en))).toBe(
      "Clear Gatekeeper quarantine from an installed Mac app",
    )
    expect(describePermission("authorize_mac_app", localeTranslator(zh))).toBe(
      "清除已安装 Mac 应用的 Gatekeeper 隔离标记",
    )
  })

  it("preserves unknown command identifiers as a compatibility fallback", () => {
    const unknownCommands = ["future_host_command_v2", "__proto__", "constructor", "toString"]

    for (const command of unknownCommands) {
      expect(describePermission(command, (key) => `translated:${key}`)).toBe(command)
    }
  })
})
