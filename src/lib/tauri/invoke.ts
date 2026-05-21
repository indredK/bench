import { invoke } from "@tauri-apps/api/core";
import type { TauriCommandContracts, TauriCommandName } from "@/lib/tauri/contracts";

type TauriCommandArgs<Name extends TauriCommandName> =
  TauriCommandContracts[Name]["args"];

type TauriCommandResult<Name extends TauriCommandName> =
  TauriCommandContracts[Name]["result"];

type InvokeArgs<Name extends TauriCommandName> =
  TauriCommandArgs<Name> extends undefined
    ? []
    : [args: TauriCommandArgs<Name>];

export function invokeTauriCommand<Name extends TauriCommandName>(
  command: Name,
  ...args: InvokeArgs<Name>
): Promise<TauriCommandResult<Name>> {
  return invoke<TauriCommandResult<Name>>(
    command,
    args[0] as Record<string, unknown> | undefined
  );
}
