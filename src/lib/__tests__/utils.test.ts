/**
 * Test / 测试: verify behavior only; 只验证行为与契约.
 */
import { describe, it, expect } from "vitest";
import { formatSize, formatDate, formatMemory, cn } from "../utils";

describe("formatSize", () => {
  it("returns 0 B for zero bytes", () => {
    expect(formatSize(0)).toBe("0 B");
  });

  it("formats bytes correctly", () => {
    expect(formatSize(500)).toBe("500 B");
  });

  it("formats kilobytes correctly", () => {
    expect(formatSize(1024)).toBe("1 KB");
    expect(formatSize(2048)).toBe("2 KB");
  });

  it("formats megabytes correctly", () => {
    expect(formatSize(1048576)).toBe("1 MB");
    expect(formatSize(1572864)).toBe("1.5 MB");
  });

  it("formats gigabytes correctly", () => {
    expect(formatSize(1073741824)).toBe("1 GB");
  });

  it("formats terabytes correctly", () => {
    expect(formatSize(1099511627776)).toBe("1 TB");
  });
});

describe("formatDate", () => {
  it("formats a unix timestamp to locale date string", () => {
    const result = formatDate(1700000000);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles timestamp 0", () => {
    const result = formatDate(0);
    expect(typeof result).toBe("string");
  });
});

describe("formatMemory", () => {
  it("converts bytes to GB with two decimal places", () => {
    const result = formatMemory(8589934592);
    expect(result).toBe("8.00");
  });

  it("handles zero bytes", () => {
    expect(formatMemory(0)).toBe("0.00");
  });

  it("handles small values", () => {
    const result = formatMemory(1073741824);
    expect(result).toBe("1.00");
  });
});

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("handles undefined and null", () => {
    expect(cn("base", undefined, null, "extra")).toBe("base extra");
  });

  it("resolves tailwind conflicts via twMerge", () => {
    expect(cn("px-4", "px-2")).toBe("px-2");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});