/**
 * Unified command error handling / 统一命令错误处理
 *
 * Tauri 命令的 `Err` 会被序列化后作为 Promise 的 reject 值抛给前端。
 * 后端约定统一返回 `{ code, message }`（见 `src-tauri/src/error.rs`），
 * 但仍存在历史命令返回纯字符串、或抛出原生 `Error` 的情况。
 * 本模块把所有形态归一化为 {@link AppErrorShape}，供 toast / 日志统一使用。
 */
import type { TFunction } from "i18next";

/** 统一错误形态：`code` 供机器判断，`message` 供人类展示。 */
export interface AppErrorShape {
  code: string;
  message: string;
}

/** 未知错误的兜底 code。 */
export const UNKNOWN_ERROR_CODE = "UNKNOWN";

/** 判断是否为结构化的 `{ code, message }` 错误。 */
export function isAppErrorShape(value: unknown): value is AppErrorShape {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as Record<string, unknown>).code === "string" &&
    "message" in value &&
    typeof (value as Record<string, unknown>).message === "string"
  );
}

/**
 * 把任意 reject 值归一化为 {@link AppErrorShape}。
 * 兼容：结构化 `{code,message}`、原生 `Error`、纯字符串、以及带 message 的对象。
 */
export function parseCommandError(error: unknown): AppErrorShape {
  if (isAppErrorShape(error)) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: UNKNOWN_ERROR_CODE, message: error.message };
  }
  if (typeof error === "string") {
    return { code: UNKNOWN_ERROR_CODE, message: error };
  }
  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as Record<string, unknown>).message === "string"
  ) {
    const code = (error as Record<string, unknown>).code;
    return {
      code: typeof code === "string" ? code : UNKNOWN_ERROR_CODE,
      message: (error as Record<string, unknown>).message as string,
    };
  }
  return { code: UNKNOWN_ERROR_CODE, message: String(error) };
}

/** 取错误 code（机器判断用）。 */
export function getErrorCode(error: unknown): string {
  return parseCommandError(error).code;
}

/**
 * 取可展示的错误信息。可选 `fallback` 在 message 为空时使用。
 */
export function getErrorMessage(error: unknown, fallback?: string): string {
  const message = parseCommandError(error).message;
  if (message && message.trim()) return message;
  return fallback ?? message;
}

/**
 * 结合 i18n 的错误文案解析：优先用 `errors.<CODE>` 的本地化文案，
 * 否则回退到后端 message，再回退到 `fallback`。
 */
export function translateError(
  t: TFunction,
  error: unknown,
  fallback?: string
): string {
  const { code } = parseCommandError(error);
  const key = `errors.${code}`;
  const localized = t(key, { defaultValue: "" });
  if (localized) return localized;
  return getErrorMessage(error, fallback);
}
