/**
 * IPC Invoke / 通信调用: provide typed invoke primitive; 只提供类型化调用入口.
 */
import { invoke } from "@tauri-apps/api/core"
import type { TauriCommandContracts, TauriCommandName } from "@/lib/tauri/contracts"

type TauriCommandArgs<Name extends TauriCommandName> = TauriCommandContracts[Name]["args"]

type TauriCommandResult<Name extends TauriCommandName> = TauriCommandContracts[Name]["result"]

type InvokeArgs<Name extends TauriCommandName> =
  TauriCommandArgs<Name> extends undefined ? [] : [args: TauriCommandArgs<Name>]

export function invokeTauriCommand<Name extends TauriCommandName>(
  command: Name,
  ...args: InvokeArgs<Name>
): Promise<TauriCommandResult<Name>> {
  return invoke<TauriCommandResult<Name>>(command, args[0] as Record<string, unknown> | undefined)
}
