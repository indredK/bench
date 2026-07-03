/**
 * Repository / 仓储层: adapt external APIs; 只适配外部接口.
 */
import {
  killProcesses,
  queryPortProcesses,
} from "@/lib/tauri/commands/port-manager";
import { portCheck } from "@/lib/tauri/commands/system-settings";

export const portManagerRepository = {
  queryPortProcesses,
  killProcesses,
  portCheck,
};
