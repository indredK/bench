/// <reference types="node" />
/**
 * Test / 测试: verify behavior only; 只验证行为与契约.
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  TAURI_COMMAND_ARG_KEYS,
  TAURI_COMMAND_CONTRACTS,
  TAURI_COMMANDS,
  TAURI_EVENTS,
} from "@/lib/tauri/contracts"
import type {
  AppInfo,
  BatchOperationResult,
  InstallSource,
  OperationResult,
} from "@/lib/tauri/types/app-manager"
import type { EnvScanDonePayload, EnvTool } from "@/lib/tauri/types/env-detector"
import type { ProjectInfo, ScanResult as DevCleanerScanResult } from "@/lib/tauri/types/dev-cleaner"
import type {
  CategoryCleanupResult,
  CleanupItemInput,
  CleanupItemResult,
  CleanupRecord,
  FolderScanResult,
  StorageCategory,
  StorageItem,
  StorageOverview,
} from "@/lib/tauri/types/clean-space"
import type {
  KillPidResult,
  PortProcessDetail,
  ProcessFingerprint,
  ProcessNode,
  SystemInfoData,
} from "@/lib/tauri/types"
import type { AppUpdateInfo, AppUpdateInstallResult } from "@/lib/tauri/types/updater"
import type {
  AccountManagerCapabilities,
  AccountManagerCapability,
  OriginStorage,
} from "@/lib/tauri/types/account-manager"

describe("Tauri contracts", () => {
  it("keeps grouped command constants derived from the canonical command contracts", () => {
    const groupedCommands = flattenContractValues(TAURI_COMMANDS).sort()
    const contractCommands = Object.keys(TAURI_COMMAND_CONTRACTS).sort()

    expect(groupedCommands).toEqual(contractCommands)
  })

  it("keeps frontend command names exactly aligned with Rust handler registration", () => {
    const rustCommands = parseRegisteredCommands(
      readFileSync(resolve(process.cwd(), "src-tauri/src/commands.rs"), "utf8"),
    ).sort()
    const frontendCommands = Object.keys(TAURI_COMMAND_CONTRACTS).sort()

    expect(rustCommands).toEqual(frontendCommands)
  })

  it("keeps frontend command args aligned with Rust command function parameters", () => {
    const rustSource = readRustSource(resolve(process.cwd(), "src-tauri/src"))
    const rustStructFields = parseRustStructFields(rustSource)
    const rustCommandArgs = parseTauriCommandArgs(rustSource, rustStructFields)

    for (const [command, argKeys] of Object.entries(TAURI_COMMAND_ARG_KEYS)) {
      expect(
        rustCommandArgs[command],
        `${command} should have matching frontend and Rust IPC args`,
      ).toEqual(argKeys)
    }
  })

  it("keeps frontend event names aligned with Rust event emitters", () => {
    const rustSource = readRustSource(resolve(process.cwd(), "src-tauri/src"))

    for (const eventName of flattenContractValues(TAURI_EVENTS)) {
      expect(rustSource, `${eventName} should be emitted by Rust`).toContain(`"${eventName}"`)
    }
  })

  it("keeps key IPC DTO fields aligned with Rust struct fields", () => {
    const rustSource = readRustSource(resolve(process.cwd(), "src-tauri/src"))
    const rustStructFields = parseRustStructFields(rustSource)

    const checks: Array<[string, string, string[]]> = [
      [
        "AccountManagerCapability",
        "camel",
        dtoKeys<AccountManagerCapability>(["status", "reasonCode"]),
      ],
      [
        "AccountManagerCapabilities",
        "camel",
        dtoKeys<AccountManagerCapabilities>([
          "platform",
          "credentialStore",
          "isolatedWebview",
          "cookieSession",
          "webStorage",
          "indexedDb",
          "networkProxy",
          "deepLink",
        ]),
      ],
      [
        "OriginStorage",
        "camel",
        dtoKeys<OriginStorage>(["origin", "localStorage", "sessionStorage", "indexedDb"]),
      ],
      [
        "AppInfo",
        "camel",
        dtoKeys<AppInfo>([
          "appId",
          "name",
          "version",
          "bundleId",
          "installPath",
          "source",
          "sourceType",
          "sourceId",
          "sourceConfidence",
          "sourceEvidence",
          "canUpgrade",
          "canUninstall",
          "upgradeAvailable",
          "lastOperationResult",
          "lastModified",
          "isSystemApp",
          "allowedActions",
          "iconBase64",
          "launchTarget",
        ]),
      ],
      [
        "OperationResult",
        "camel",
        dtoKeys<OperationResult>([
          "success",
          "message",
          "exitCode",
          "errorCode",
          "permissionIssue",
        ]),
      ],
      [
        "BatchOperationResult",
        "camel",
        dtoKeys<BatchOperationResult>(["total", "succeeded", "failed", "cancelled", "results"]),
      ],
      [
        "InstallSource",
        "camel",
        dtoKeys<InstallSource>(["brew", "winget", "apt", "flatpak", "snap", "url"]),
      ],
      [
        "ProjectInfo",
        "snake",
        dtoKeys<ProjectInfo>([
          "path",
          "name",
          "total_size",
          "target_size",
          "last_modified",
          "dependencies_count",
          "project_type",
          "cleanup_potential",
          "cleanup_paths",
        ]),
      ],
      [
        "ScanResult",
        "snake",
        dtoKeys<DevCleanerScanResult>([
          "total_projects",
          "total_size",
          "total_cleanup_size",
          "projects",
          "scan_time_ms",
          "aborted",
        ]),
      ],
      [
        "EnvTool",
        "snake",
        dtoKeys<EnvTool>([
          "name",
          "version",
          "path",
          "size_bytes",
          "size_display",
          "install_time",
          "available",
          "category",
          "source",
          "kind",
          "status",
          "detector",
          "all_paths",
          "issue",
        ]),
      ],
      ["ScanDonePayload", "snake", dtoKeys<EnvScanDonePayload>(["tools", "unavailable"])],
      [
        "KillPidResult",
        "snake",
        dtoKeys<KillPidResult>(["pid", "success", "message", "error_code"]),
      ],
      [
        "ProcessNode",
        "snake",
        dtoKeys<ProcessNode>(["pid", "ppid", "name", "command", "children"]),
      ],
      ["ProcessFingerprint", "snake", dtoKeys<ProcessFingerprint>(["category", "name", "icon"])],
      [
        "PortProcessDetail",
        "snake",
        dtoKeys<PortProcessDetail>(["port", "pids", "process_trees", "fingerprint", "error"]),
      ],
      [
        "SystemInfo",
        "snake",
        dtoKeys<SystemInfoData>([
          "os_name",
          "os_version",
          "kernel_version",
          "hostname",
          "cpu_brand",
          "cpu_cores",
          "total_memory",
          "available_memory",
          "used_memory",
          "memory_usage_percent",
          "uptime_seconds",
          "arch",
          "model_name",
          "distribution",
        ]),
      ],
      [
        "AppUpdateInfo",
        "camel",
        dtoKeys<AppUpdateInfo>(["available", "currentVersion", "version", "date", "body"]),
      ],
      [
        "AppUpdateInstallResult",
        "camel",
        dtoKeys<AppUpdateInstallResult>(["installed", "requiresRestart"]),
      ],
      [
        "StorageItem",
        "snake",
        dtoKeys<StorageItem>([
          "id",
          "name",
          "category_id",
          "risk_level",
          "size_bytes",
          "command",
          "is_cleanable",
          "protection_kind",
          "protection_reason",
          "path",
          "files",
          "reason",
          "priority",
          "score",
        ]),
      ],
      [
        "StorageCategory",
        "snake",
        dtoKeys<StorageCategory>(["id", "name", "color", "total_bytes", "items"]),
      ],
      ["StorageOverview", "snake", dtoKeys<StorageOverview>(["disk_total_bytes", "categories"])],
      [
        "CleanupRecord",
        "snake",
        dtoKeys<CleanupRecord>([
          "id",
          "timestamp",
          "title",
          "scope",
          "items",
          "freed_bytes",
          "high_risk_count",
          "status",
        ]),
      ],
      [
        "CleanupItemInput",
        "snake",
        dtoKeys<CleanupItemInput>(["id", "category_id", "command", "path", "size_bytes"]),
      ],
      [
        "CategoryCleanupResult",
        "snake",
        dtoKeys<CategoryCleanupResult>([
          "success",
          "freed_bytes",
          "items_cleaned",
          "items_failed",
          "aborted",
          "results",
        ]),
      ],
      [
        "CleanupItemResult",
        "snake",
        dtoKeys<CleanupItemResult>(["id", "status", "freed_bytes", "error_code"]),
      ],
      [
        "FolderScanResult",
        "snake",
        dtoKeys<FolderScanResult>(["freed_bytes", "item_count", "items"]),
      ],
    ]

    for (const [rustTypeName, serdeCase, frontendKeys] of checks) {
      const rustFields = rustStructFields[rustTypeName]?.map((field) =>
        serdeCase === "camel" ? snakeToCamelCase(field) : field,
      )

      expect(rustFields, `${rustTypeName} should exist in Rust DTO structs`).toBeDefined()
      expect(rustFields, `${rustTypeName} fields should match frontend DTO keys`).toEqual(
        frontendKeys,
      )
    }
  })
})

// Commands whose frontend contract passes the struct fields directly as
// top-level invoke args (`defineTauriCommand<TheStruct, Result>()`) instead
// of wrapping them in `{ paramName: TheStruct }`. When the parser encounters
// a struct param for these commands it should expand it to the struct fields.
const COMMANDS_WITH_FLAT_STRUCT_ARGS = new Set([
  "create_term", // TermInput passed as individual fields (industryId, categoryId, ...)
  "install_app_update", // InstallUpdateRequest passed as individual fields (updateId, inventoryRevision)
])

function flattenContractValues(contractGroup: Record<string, Record<string, string>>): string[] {
  return Object.values(contractGroup).flatMap((contract) => Object.values(contract))
}

function readRustSource(path: string): string {
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = resolve(path, entry.name)
      if (entry.isDirectory()) return readRustSource(entryPath)
      if (!entry.isFile() || !entry.name.endsWith(".rs")) return []
      return readFileSync(entryPath, "utf8")
    })
    .join("\n")
}

function parseRegisteredCommands(commandsSource: string): string[] {
  const handlerMatch = commandsSource.match(/tauri::generate_handler!\s*\[([\s\S]*?)\]/)
  const handlerBody = handlerMatch?.[1] ?? ""

  return Array.from(handlerBody.matchAll(/::([a-zA-Z0-9_]+)\s*,/g)).map((match) => match[1])
}

function parseTauriCommandArgs(
  rustSource: string,
  rustStructFields: Record<string, string[]>,
): Record<string, string[]> {
  const commands: Record<string, string[]> = {}
  const commandRegex =
    /#\[tauri::command\](?:\s*#\[[\s\S]*?\])*\s*pub\s+(?:async\s+)?fn\s+([a-zA-Z0-9_]+)(?:\s*<[\s\S]*?>)?\s*\(([\s\S]*?)\)\s*(?:->|\{)/g

  for (const match of rustSource.matchAll(commandRegex)) {
    const [, commandName, rawArgs] = match
    const filtered = splitTopLevelArgs(rawArgs)
      .map((arg) => arg.trim())
      .filter(Boolean)
      .filter(
        (arg) =>
          !arg.includes("tauri::State") &&
          !arg.includes("tauri::AppHandle") &&
          !arg.includes("tauri::WebviewWindow") &&
          !arg.includes("tauri::Window") &&
          !arg.includes("AppHandle") &&
          !/(^|\W)State\s*</.test(arg),
      )

    const argKeys: string[] = []
    for (const arg of filtered) {
      const colIdx = arg.indexOf(":")
      const paramType =
        colIdx >= 0
          ? arg
              .slice(colIdx + 1)
              .trim()
              .split(/\s+/)[0]
          : ""
      // Some commands pass the struct fields directly as top-level args
      // (frontend defines `defineTauriCommand<TheStruct, Result>()`) rather
      // than wrapping in `{ key: TheStruct }`. Expand those struct params.
      const shouldExpand =
        paramType in rustStructFields && COMMANDS_WITH_FLAT_STRUCT_ARGS.has(commandName)
      if (shouldExpand) {
        for (const field of rustStructFields[paramType]) {
          argKeys.push(snakeToCamelCase(field))
        }
      } else {
        const paramName = colIdx >= 0 ? arg.slice(0, colIdx).trim() : arg
        if (paramName) argKeys.push(snakeToCamelCase(paramName))
      }
    }
    commands[commandName] = argKeys
  }

  // Macro-generated commands use `$get_fn`/`$set_fn` variables that the
  // regex above can't match. Parse the macro invocations directly.
  parseMacroGeneratedCommands(rustSource, commands)

  return commands
}

/// Resolve `#[tauri::command]` functions generated by `macro_rules!` invocations.
/// The regex in `parseTauriCommandArgs` can only match concrete `fn <name>`
/// signatures; macro bodies use `$ident` variables which break the match.
function parseMacroGeneratedCommands(rustSource: string, commands: Record<string, string[]>) {
  // ns_global_bool_toggle!(get_fn, set_fn, "key")
  //   => get_fn() with no args; set_fn(enabled: bool) with arg "enabled"
  const macroRegex =
    /ns_global_bool_toggle!\s*\(\s*([a-zA-Z0-9_]+)\s*,\s*([a-zA-Z0-9_]+)\s*,\s*"[^"]*"\s*\)/g
  for (const match of rustSource.matchAll(macroRegex)) {
    const [, getFn, setFn] = match
    if (!(getFn in commands)) commands[getFn] = []
    if (!(setFn in commands)) commands[setFn] = ["enabled"]
  }
}

function splitTopLevelArgs(value: string): string[] {
  const args: string[] = []
  let current = ""
  let genericDepth = 0

  for (const char of value) {
    if (char === "<") genericDepth += 1
    if (char === ">") genericDepth = Math.max(0, genericDepth - 1)

    if (char === "," && genericDepth === 0) {
      args.push(current)
      current = ""
      continue
    }

    current += char
  }

  if (current.trim()) args.push(current)

  return args
}

function parseRustStructFields(rustSource: string): Record<string, string[]> {
  const fieldsByStruct: Record<string, string[]> = {}
  const structRegex = /pub\s+struct\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g

  for (const match of rustSource.matchAll(structRegex)) {
    const [, structName, body] = match
    fieldsByStruct[structName] = Array.from(
      body.matchAll(/pub(?:\([^)]*\))?\s+([a-zA-Z0-9_]+)\s*:/g),
    ).map((fieldMatch) => fieldMatch[1])
  }

  return fieldsByStruct
}

function dtoKeys<T extends object>(keys: Array<Extract<keyof T, string>>): string[] {
  return keys
}

function snakeToCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}
