/**
 * Repository / 仓储层: adapt external APIs; 只适配外部接口.
 */
import {
  cancelCommandCard,
  deleteCommandCard,
  exportCommandCards,
  importCommandCards,
  installMarketCommand,
  listCommandCards,
  listMarketCommands,
  runCommandCard,
  saveCommandCards,
  upsertCommandCard,
} from "@/lib/tauri/commands/command-center"

export const commandCenterRepository = {
  listCommandCards,
  upsertCommandCard,
  deleteCommandCard,
  runCommandCard,
  cancelCommandCard,
  exportCommandCards,
  importCommandCards,
  saveCommandCards,
  listMarketCommands,
  installMarketCommand,
}
