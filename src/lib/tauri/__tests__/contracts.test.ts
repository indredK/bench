import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TAURI_COMMANDS, TAURI_EVENTS } from "@/lib/tauri/contracts";

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
    const rustEnvDetector = readFileSync(
      resolve(process.cwd(), "src-tauri/src/env_detector.rs"),
      "utf8"
    );

    for (const eventName of flattenContractValues(TAURI_EVENTS)) {
      expect(rustEnvDetector, `${eventName} should be emitted by Rust`)
        .toContain(`"${eventName}"`);
    }
  });
});

function flattenContractValues(contractGroup: Record<string, Record<string, string>>): string[] {
  return Object.values(contractGroup).flatMap((contract) => Object.values(contract));
}
