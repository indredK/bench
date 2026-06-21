import { describe, expect, it } from "vitest";
import {
  convertPrice,
  displayPrice,
  effectiveInputPrice,
  estimateTokens,
  formatCost,
  mixedPricePerMillionTokens,
  normalizeExchangeRate,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
} from "@/features/token-calculator/model/pricing";

describe("token-calculator pricing helpers", () => {
  it("estimates tokens conservatively for mixed CJK and latin text", () => {
    expect(estimateTokens("hello world")).toBeGreaterThanOrEqual(1);
    expect(estimateTokens("你好世界")).toBe(3);
    expect(estimateTokens("hello你好")).toBe(3);
  });

  it("converts price using the configured exchange rate", () => {
    expect(convertPrice(1, "USD", "CNY", 7.2)).toBe(7.2);
    expect(convertPrice(7.2, "CNY", "USD", 7.2)).toBe(1);
    expect(convertPrice(2, "USD", "USD", 7.2)).toBe(2);
  });

  it("blends cache write and read prices by hit rate", () => {
    expect(effectiveInputPrice(10, 8, 2, 0)).toBe(8);
    expect(effectiveInputPrice(10, 8, 2, 100)).toBe(2);
    expect(effectiveInputPrice(10, 8, 2, 25)).toBeCloseTo(6.5);
  });

  it("computes mixed price and display formatting safely", () => {
    expect(mixedPricePerMillionTokens(3, 9, 2)).toBe(5);
    expect(displayPrice(0.009, "USD", "USD", 7)).toBe("$0.0090");
    expect(formatCost(0.0009, "USD")).toBe("$0.000900");
  });

  it("normalizes invalid numeric input to zero or default rate", () => {
    expect(normalizeExchangeRate(0)).toBe(7);
    expect(parseNonNegativeNumber("-1")).toBe(0);
    expect(parseNonNegativeInteger("0")).toBe(0);
    expect(parseNonNegativeInteger("12")).toBe(12);
  });
});
