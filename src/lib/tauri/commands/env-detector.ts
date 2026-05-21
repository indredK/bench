import { invoke } from "@tauri-apps/api/core";

export function detectEnvTools() {
  return invoke<void>("detect_env_tools");
}
