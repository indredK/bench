import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TAURI_COMMANDS, TAURI_EVENTS } from "@/lib/tauri/contracts";
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
  it("keeps frontend command names aligned with Rust handler registration", () => {
    const rustCommands = readFileSync(
      resolve(process.cwd(), "src-tauri/src/commands.rs"),
      "utf8"
    );

    for (const command of flattenContractValues(TAURI_COMMANDS)) {
      expect(rustCommands, `${command} should be registered in src-tauri/src/commands.rs`)
        .toContain(`::${command}`);
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

    const checks: Array<[string, string[]]> = [
      ["AppInfo", dtoKeys<AppInfo>([
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
      ["OperationResult", dtoKeys<OperationResult>(["success", "message", "exitCode", "errorCode", "permissionIssue"])],
      ["OperationRecord", dtoKeys<OperationRecord>(["timestamp", "action", "appId", "appName", "success", "output", "exitCode", "errorCode", "permissionIssue"])],
      ["BatchOperationResult", dtoKeys<BatchOperationResult>(["total", "succeeded", "failed", "results"])],
      ["InstallSource", dtoKeys<InstallSource>(["brew", "winget", "apt", "flatpak", "snap", "url"])],
      ["ProjectInfo", dtoKeys<ProjectInfo>(["path", "name", "total_size", "target_size", "last_modified", "dependencies_count", "project_type", "cleanup_potential", "cleanup_paths"])],
      ["DevCleanerScanResult", dtoKeys<DevCleanerScanResult>(["total_projects", "total_size", "total_cleanup_size", "projects", "scan_time_ms", "aborted"])],
      ["EnvTool", dtoKeys<EnvTool>(["name", "version", "path", "size_bytes", "size_display", "install_time", "available", "category", "source", "kind", "status", "detector", "all_paths", "issue"])],
      ["EnvScanDonePayload", dtoKeys<EnvScanDonePayload>(["tools", "unavailable"])],
      ["KillPidResult", dtoKeys<KillPidResult>(["pid", "success", "message"])],
      ["ProcessNode", dtoKeys<ProcessNode>(["pid", "ppid", "name", "command", "children"])],
      ["ProcessFingerprint", dtoKeys<ProcessFingerprint>(["category", "name", "icon"])],
      ["PortProcessDetail", dtoKeys<PortProcessDetail>(["port", "pids", "process_trees", "fingerprint", "error"])],
      ["SystemInfoData", dtoKeys<SystemInfoData>(["os_name", "os_version", "kernel_version", "hostname", "cpu_brand", "cpu_cores", "total_memory", "available_memory", "used_memory", "memory_usage_percent", "uptime_seconds", "arch", "model_name", "distribution"])],
    ];

    for (const [typeName, keys] of checks) {
      for (const key of keys) {
        const rustKey = camelToSnakeCase(key);
        const hasField = rustSource.includes(key) || rustSource.includes(rustKey);
        expect(hasField, `${typeName}.${key} should exist in Rust source`).toBe(true);
      }
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

function dtoKeys<T extends object>(keys: Array<Extract<keyof T, string>>): string[] {
  return keys;
}

function camelToSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
