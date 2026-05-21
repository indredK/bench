import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  TAURI_COMMAND_ARG_KEYS,
  TAURI_COMMAND_CONTRACTS,
  TAURI_COMMANDS,
  TAURI_EVENTS,
} from "@/lib/tauri/contracts";
import type {
  AppInfo,
  BatchOperationResult,
  InstallSource,
  OperationRecord,
  OperationResult,
} from "@/lib/tauri/types/app-manager";
import type { EnvScanDonePayload, EnvTool } from "@/lib/tauri/types/env-detector";
import type { ProjectInfo, ScanResult as DevCleanerScanResult } from "@/lib/tauri/types/dev-cleaner";
import type {
  KillPidResult,
  PortProcessDetail,
  ProcessFingerprint,
  ProcessNode,
  SystemInfoData,
} from "@/lib/tauri/types";

describe("Tauri contracts", () => {
  it("keeps grouped command constants derived from the canonical command contracts", () => {
    const groupedCommands = flattenContractValues(TAURI_COMMANDS).sort();
    const contractCommands = Object.keys(TAURI_COMMAND_CONTRACTS).sort();

    expect(groupedCommands).toEqual(contractCommands);
  });

  it("keeps frontend command names exactly aligned with Rust handler registration", () => {
    const rustCommands = parseRegisteredCommands(
      readFileSync(resolve(process.cwd(), "src-tauri/src/commands.rs"), "utf8")
    ).sort();
    const frontendCommands = Object.keys(TAURI_COMMAND_CONTRACTS).sort();

    expect(rustCommands).toEqual(frontendCommands);
  });

  it("keeps frontend command args aligned with Rust command function parameters", () => {
    const rustSource = readRustSource(resolve(process.cwd(), "src-tauri/src"));
    const rustCommandArgs = parseTauriCommandArgs(rustSource);

    for (const [command, argKeys] of Object.entries(TAURI_COMMAND_ARG_KEYS)) {
      expect(
        rustCommandArgs[command],
        `${command} should have matching frontend and Rust IPC args`
      ).toEqual(argKeys);
    }
  });

  it("keeps frontend event names aligned with Rust event emitters", () => {
    const rustSource = readRustSource(resolve(process.cwd(), "src-tauri/src"));

    for (const eventName of flattenContractValues(TAURI_EVENTS)) {
      expect(rustSource, `${eventName} should be emitted by Rust`)
        .toContain(`"${eventName}"`);
    }
  });

  it("keeps key IPC DTO fields aligned with Rust struct fields", () => {
    const rustSource = readRustSource(resolve(process.cwd(), "src-tauri/src"));
    const rustStructFields = parseRustStructFields(rustSource);

    const checks: Array<[string, string, string[]]> = [
      ["AppInfo", "camel", dtoKeys<AppInfo>([
        "appId",
        "name",
        "version",
        "bundleId",
        "installPath",
        "source",
        "sourceType",
        "sourceId",
        "sourceConfidence",
        "canUpgrade",
        "canUninstall",
        "upgradeAvailable",
        "lastOperationResult",
        "lastModified",
        "isSystemApp",
        "allowedActions",
        "iconBase64",
      ])],
      ["OperationResult", "camel", dtoKeys<OperationResult>(["success", "message", "exitCode", "errorCode", "permissionIssue"])],
      ["OperationRecord", "camel", dtoKeys<OperationRecord>(["timestamp", "action", "appId", "appName", "success", "output", "exitCode", "errorCode", "permissionIssue"])],
      ["BatchOperationResult", "camel", dtoKeys<BatchOperationResult>(["total", "succeeded", "failed", "results"])],
      ["InstallSource", "camel", dtoKeys<InstallSource>(["brew", "winget", "apt", "flatpak", "snap", "url"])],
      ["ProjectInfo", "snake", dtoKeys<ProjectInfo>(["path", "name", "total_size", "target_size", "last_modified", "dependencies_count", "project_type", "cleanup_potential", "cleanup_paths"])],
      ["ScanResult", "snake", dtoKeys<DevCleanerScanResult>(["total_projects", "total_size", "total_cleanup_size", "projects", "scan_time_ms", "aborted"])],
      ["EnvTool", "snake", dtoKeys<EnvTool>(["name", "version", "path", "size_bytes", "size_display", "install_time", "available", "category", "source", "kind", "status", "detector", "all_paths", "issue"])],
      ["ScanDonePayload", "snake", dtoKeys<EnvScanDonePayload>(["tools", "unavailable"])],
      ["KillPidResult", "snake", dtoKeys<KillPidResult>(["pid", "success", "message"])],
      ["ProcessNode", "snake", dtoKeys<ProcessNode>(["pid", "ppid", "name", "command", "children"])],
      ["ProcessFingerprint", "snake", dtoKeys<ProcessFingerprint>(["category", "name", "icon"])],
      ["PortProcessDetail", "snake", dtoKeys<PortProcessDetail>(["port", "pids", "process_trees", "fingerprint", "error"])],
      ["SystemInfo", "snake", dtoKeys<SystemInfoData>(["os_name", "os_version", "kernel_version", "hostname", "cpu_brand", "cpu_cores", "total_memory", "available_memory", "used_memory", "memory_usage_percent", "uptime_seconds", "arch", "model_name", "distribution"])],
    ];

    for (const [rustTypeName, serdeCase, frontendKeys] of checks) {
      const rustFields = rustStructFields[rustTypeName]?.map((field) =>
        serdeCase === "camel" ? snakeToCamelCase(field) : field
      );

      expect(rustFields, `${rustTypeName} should exist in Rust DTO structs`)
        .toBeDefined();
      expect(rustFields, `${rustTypeName} fields should match frontend DTO keys`)
        .toEqual(frontendKeys);
    }
  });
});

function flattenContractValues(contractGroup: Record<string, Record<string, string>>): string[] {
  return Object.values(contractGroup).flatMap((contract) => Object.values(contract));
}

function readRustSource(path: string): string {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) return readRustSource(entryPath);
    if (!entry.isFile() || !entry.name.endsWith(".rs")) return [];
    return readFileSync(entryPath, "utf8");
  }).join("\n");
}

function parseRegisteredCommands(commandsSource: string): string[] {
  const handlerMatch = commandsSource.match(/tauri::generate_handler!\s*\[([\s\S]*?)\]/);
  const handlerBody = handlerMatch?.[1] ?? "";

  return Array.from(handlerBody.matchAll(/::([a-zA-Z0-9_]+)\s*,/g))
    .map((match) => match[1]);
}

function parseTauriCommandArgs(rustSource: string): Record<string, string[]> {
  const commands: Record<string, string[]> = {};
  const commandRegex = /#\[tauri::command\]\s*pub\s+(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*(?:->|\{)/g;

  for (const match of rustSource.matchAll(commandRegex)) {
    const [, commandName, rawArgs] = match;
    commands[commandName] = splitTopLevelArgs(rawArgs)
      .map((arg) => arg.trim())
      .filter(Boolean)
      .filter((arg) => !arg.includes("tauri::State") && !arg.includes("tauri::AppHandle") && !arg.includes("AppHandle"))
      .map((arg) => arg.split(":")[0]?.trim())
      .filter((arg): arg is string => Boolean(arg))
      .map(snakeToCamelCase);
  }

  return commands;
}

function splitTopLevelArgs(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let genericDepth = 0;

  for (const char of value) {
    if (char === "<") genericDepth += 1;
    if (char === ">") genericDepth = Math.max(0, genericDepth - 1);

    if (char === "," && genericDepth === 0) {
      args.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) args.push(current);

  return args;
}

function parseRustStructFields(rustSource: string): Record<string, string[]> {
  const fieldsByStruct: Record<string, string[]> = {};
  const structRegex = /pub\s+struct\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g;

  for (const match of rustSource.matchAll(structRegex)) {
    const [, structName, body] = match;
    fieldsByStruct[structName] = Array.from(body.matchAll(/pub(?:\([^)]*\))?\s+([a-zA-Z0-9_]+)\s*:/g))
      .map((fieldMatch) => fieldMatch[1]);
  }

  return fieldsByStruct;
}

function dtoKeys<T extends object>(keys: Array<Extract<keyof T, string>>): string[] {
  return keys;
}

function snakeToCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
