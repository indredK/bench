import type { TFunction } from "i18next";
import {
  getErrorCode,
  getErrorMessage,
  isAppErrorShape,
  parseCommandError,
  translateError,
  UNKNOWN_ERROR_CODE,
} from "@/lib/tauri/errors";

describe("parseCommandError", () => {
  it("passes through structured {code,message}", () => {
    expect(parseCommandError({ code: "FORBIDDEN_PATH", message: "nope" })).toEqual({
      code: "FORBIDDEN_PATH",
      message: "nope",
    });
  });

  it("normalizes native Error", () => {
    expect(parseCommandError(new Error("boom"))).toEqual({
      code: UNKNOWN_ERROR_CODE,
      message: "boom",
    });
  });

  it("normalizes plain string (legacy String errors)", () => {
    expect(parseCommandError("write failed")).toEqual({
      code: UNKNOWN_ERROR_CODE,
      message: "write failed",
    });
  });

  it("reads message-only objects and falls back on code", () => {
    expect(parseCommandError({ message: "partial" })).toEqual({
      code: UNKNOWN_ERROR_CODE,
      message: "partial",
    });
  });

  it("stringifies fully unknown values", () => {
    expect(parseCommandError(42)).toEqual({
      code: UNKNOWN_ERROR_CODE,
      message: "42",
    });
  });
});

describe("isAppErrorShape", () => {
  it("accepts {code,message}", () => {
    expect(isAppErrorShape({ code: "IO_ERROR", message: "x" })).toBe(true);
  });
  it("rejects plain strings", () => {
    expect(isAppErrorShape("x")).toBe(false);
  });
});

describe("getErrorCode / getErrorMessage", () => {
  it("extracts code", () => {
    expect(getErrorCode({ code: "TASK_FAILED", message: "y" })).toBe("TASK_FAILED");
  });
  it("uses fallback when message is empty", () => {
    expect(getErrorMessage({ code: "X", message: "" }, "fallback")).toBe("fallback");
  });
});

describe("translateError", () => {
  const t = ((key: string, opts?: { defaultValue?: string }) => {
    const table: Record<string, string> = {
      "errors.FORBIDDEN_PATH": "Path not allowed",
      "errors.UNKNOWN": "",
    };
    if (key in table) return table[key];
    return opts?.defaultValue ?? key;
  }) as unknown as TFunction;

  it("prefers localized code message", () => {
    expect(translateError(t, { code: "FORBIDDEN_PATH", message: "raw" })).toBe(
      "Path not allowed"
    );
  });

  it("falls back to backend message when code has no localization", () => {
    expect(translateError(t, "legacy string error")).toBe("legacy string error");
  });
});
