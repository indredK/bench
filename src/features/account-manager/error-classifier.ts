import type {
  AccountManagerError,
  AccountManagerErrorCode,
} from "@/lib/tauri/types/account-manager";

type AccountManagerErrorLike = Partial<AccountManagerError> & { message?: string };

export type AccountManagerErrorKind =
  | "invalidImportFile"
  | "invalidInput"
  | "storeFailure"
  | "unknown";

export interface AccountManagerErrorInfo {
  kind: AccountManagerErrorKind;
  message: string;
}

function readCode(error: unknown): AccountManagerErrorCode | null {
  if (!error || typeof error !== "object") return null;
  const maybe = error as AccountManagerErrorLike;
  return typeof maybe.code === "string" ? (maybe.code as AccountManagerErrorCode) : null;
}

function readMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const maybe = error as AccountManagerErrorLike;
  if (typeof maybe.message === "string" && maybe.message.trim()) {
    return maybe.message;
  }
  return fallback;
}

export function classifyAccountManagerError(
  error: unknown,
  fallback: string
): AccountManagerErrorInfo {
  const code = readCode(error);
  const message = readMessage(error, fallback);

  switch (code) {
    case "INVALID_INPUT":
      return { kind: "invalidInput", message };
    case "STORE_FAIL":
      return { kind: "storeFailure", message };
    default:
      return { kind: "unknown", message };
  }
}
