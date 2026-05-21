import {
  killProcesses,
  queryPortProcesses,
} from "@/lib/tauri/commands/port-manager";

export const portManagerRepository = {
  queryPortProcesses,
  killProcesses,
};
