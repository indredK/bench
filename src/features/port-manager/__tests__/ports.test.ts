import { describe, expect, it } from "vitest";
import {
  hasInvalidPortInputCharacters,
  parsePortsFromInput,
} from "@/features/port-manager/ports";

describe("parsePortsFromInput", () => {
  it("parses single ports, ranges, deduplicates, and sorts", () => {
    expect(parsePortsFromInput("8080,3000-3002,3001")).toEqual({
      ports: [3000, 3001, 3002, 8080],
      hasError: false,
      errorKey: undefined,
    });
  });

  it("returns the first range format error", () => {
    expect(parsePortsFromInput("3000-")).toMatchObject({
      ports: [],
      hasError: true,
      errorKey: "invalidRangeFormat",
    });
  });

  it("rejects reversed ranges", () => {
    expect(parsePortsFromInput("4000-3000")).toMatchObject({
      ports: [],
      hasError: true,
      errorKey: "rangeStartGtEnd",
    });
  });

  it("rejects ports outside the valid range", () => {
    expect(parsePortsFromInput("0,65536")).toMatchObject({
      ports: [],
      hasError: true,
      errorKey: "portOutOfRange",
    });
  });

  it("enforces the maximum port count", () => {
    expect(parsePortsFromInput("1-3", 2)).toMatchObject({
      ports: [],
      hasError: true,
      errorKey: "tooManyPorts",
    });
  });
});

describe("hasInvalidPortInputCharacters", () => {
  it("accepts digits, commas, and hyphens", () => {
    expect(hasInvalidPortInputCharacters("3000,4000-4002")).toBe(false);
  });

  it("rejects other characters", () => {
    expect(hasInvalidPortInputCharacters("abc")).toBe(true);
  });
});

