/**
 * Updater Errors / 更新错误: classify updater failures into user-facing states.
 */
import { getErrorMessage } from "@/lib/tauri/errors"

export type UpdaterOperation = "check" | "install"

export type UpdaterErrorKind =
  | "desktopOnly"
  | "releaseInfoUnavailable"
  | "serviceBusy"
  | "networkUnavailable"
  | "rateLimited"
  | "downloadFailed"
  | "signatureVerificationFailed"
  | "installBlocked"
  | "updateStateChanged"
  | "unknownCheckFailure"
  | "unknownInstallFailure"

export type UpdaterRetryAction = "check" | "install" | null

export interface UpdaterErrorInfo {
  kind: UpdaterErrorKind
  operation: UpdaterOperation
  message: string
  retryAction: UpdaterRetryAction
}

const RELEASE_INFO_PATTERNS = [
  "could not fetch a valid release json",
  "valid release json",
  "release json",
  "release metadata",
  "failed to deserialize release",
  "invalid release",
  "was not found in the response `platforms` object",
  "missing required updater platforms",
]

const RATE_LIMIT_PATTERNS = ["rate limit", "too many requests", "429"]

const NETWORK_PATTERNS = [
  "error sending request for url",
  "network is unreachable",
  "failed to lookup address information",
  "temporary failure in name resolution",
  "dns",
  "offline",
  "timed out",
  "timeout",
  "connection refused",
  "connection reset",
  "could not connect",
  "connection closed",
  "socket",
  "tls",
  "certificate",
  "host unreachable",
  "not connected",
]

const SIGNATURE_PATTERNS = [
  "signature verification failed",
  "the signature verification failed",
  "invalid signature",
  "unexpected public key id",
  "unexpected key id",
  "minisign",
]

const SERVICE_PATTERNS = [
  "service unavailable",
  "bad gateway",
  "gateway timeout",
  "internal server error",
  "503",
  "502",
  "500",
  "failed to build updater",
]

const UPDATE_STATE_CHANGED_PATTERNS = ["no update is currently available", "no update available"]

const INSTALL_BLOCKED_PATTERNS = [
  "permission denied",
  "access is denied",
  "os error 13",
  "resource busy",
  "text file busy",
  "file is in use",
  "device or resource busy",
  "operation not permitted",
]

function normalizeErrorMessage(error: unknown, fallback: string) {
  return getErrorMessage(error, fallback)
}

function includesAny(message: string, patterns: string[]) {
  return patterns.some((pattern) => message.includes(pattern))
}

export function createDesktopOnlyUpdaterError(message: string): UpdaterErrorInfo {
  return {
    kind: "desktopOnly",
    operation: "check",
    message,
    retryAction: null,
  }
}

export function classifyUpdaterError(
  error: unknown,
  operation: UpdaterOperation,
  fallback: string,
): UpdaterErrorInfo {
  const message = normalizeErrorMessage(error, fallback)
  const normalizedMessage = message.toLowerCase()

  if (includesAny(normalizedMessage, RATE_LIMIT_PATTERNS)) {
    return {
      kind: "rateLimited",
      operation,
      message,
      retryAction: "check",
    }
  }

  if (includesAny(normalizedMessage, RELEASE_INFO_PATTERNS)) {
    return {
      kind: "releaseInfoUnavailable",
      operation,
      message,
      retryAction: "check",
    }
  }

  if (operation === "install" && includesAny(normalizedMessage, SIGNATURE_PATTERNS)) {
    return {
      kind: "signatureVerificationFailed",
      operation,
      message,
      retryAction: "check",
    }
  }

  if (operation === "install" && includesAny(normalizedMessage, UPDATE_STATE_CHANGED_PATTERNS)) {
    return {
      kind: "updateStateChanged",
      operation,
      message,
      retryAction: "check",
    }
  }

  if (includesAny(normalizedMessage, SERVICE_PATTERNS)) {
    return {
      kind: "serviceBusy",
      operation,
      message,
      retryAction: "check",
    }
  }

  if (includesAny(normalizedMessage, NETWORK_PATTERNS)) {
    return {
      kind: operation === "install" ? "downloadFailed" : "networkUnavailable",
      operation,
      message,
      retryAction: operation === "install" ? "install" : "check",
    }
  }

  if (operation === "install" && includesAny(normalizedMessage, INSTALL_BLOCKED_PATTERNS)) {
    return {
      kind: "installBlocked",
      operation,
      message,
      retryAction: "install",
    }
  }

  return {
    kind: operation === "install" ? "unknownInstallFailure" : "unknownCheckFailure",
    operation,
    message,
    retryAction: operation === "install" ? "install" : "check",
  }
}
