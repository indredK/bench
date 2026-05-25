import type { ApiBillingError, ApiBillingErrorCode } from "@/lib/tauri/types/api-billing";

type ApiBillingErrorLike = Partial<ApiBillingError> & { message?: string };

export type ApiBillingErrorKind =
  | "invalidImportFile"
  | "storeFailure"
  | "unknown";

export interface ApiBillingErrorInfo {
  kind: ApiBillingErrorKind;
  message: string;
}

function readCode(error: unknown): ApiBillingErrorCode | null {
  if (!error || typeof error !== "object") return null;
  const maybe = error as ApiBillingErrorLike;
  return typeof maybe.code === "string" ? (maybe.code as ApiBillingErrorCode) : null;
}

function readMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const maybe = error as ApiBillingErrorLike;
  if (typeof maybe.message === "string" && maybe.message.trim()) {
    return maybe.message;
  }
  return fallback;
}

export function classifyApiBillingError(
  error: unknown,
  fallback: string
): ApiBillingErrorInfo {
  const code = readCode(error);
  const message = readMessage(error, fallback);

  switch (code) {
    case "INVALID_INPUT":
      return { kind: "invalidImportFile", message };
    case "STORE_FAIL":
      return { kind: "storeFailure", message };
    default:
      return { kind: "unknown", message };
  }
}
