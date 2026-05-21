/**
 * Repository / 仓储层: adapt external APIs; 只适配外部接口.
 */
import {
  killProcesses,
  queryPortProcesses,
} from "@/lib/tauri/commands/port-manager";

export const portManagerRepository = {
  queryPortProcesses,
  killProcesses,
};
