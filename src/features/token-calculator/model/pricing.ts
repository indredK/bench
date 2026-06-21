import type { ModelPricing } from "@/features/token-calculator/api";

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  CNY: "¥",
};

export const DEFAULT_EXCHANGE_RATE = 7;
export const RATIO_PRESETS = [1, 2, 3, 5, 10, 20, 50, 100];

export type DisplayCurrency = "USD" | "CNY";
export type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

export function estimateTokens(text: string): number {
  let cjkCount = 0;
  let otherCount = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef) ||
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) {
      cjkCount += 1;
    } else {
      otherCount += 1;
    }
  }
  return Math.max(1, Math.round(cjkCount / 1.5 + otherCount / 4));
}

export function getTokenUnits(t: TranslateFn) {
  return [
    { value: "single", label: t("tokenCalculator.units.single"), multiplier: 1 },
    { value: "thousand", label: t("tokenCalculator.units.thousand"), multiplier: 1_000 },
    { value: "tenThousand", label: t("tokenCalculator.units.tenThousand"), multiplier: 10_000 },
    { value: "million", label: t("tokenCalculator.units.million"), multiplier: 1_000_000 },
    { value: "hundredMillion", label: t("tokenCalculator.units.hundredMillion"), multiplier: 100_000_000 },
  ];
}

export function normalizeExchangeRate(rate: number): number {
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_EXCHANGE_RATE;
}

export function convertPrice(
  price: number,
  sourceCurrency: string,
  displayCurrency: DisplayCurrency,
  rate: number
): number {
  if (!Number.isFinite(price)) return 0;
  const safeRate = normalizeExchangeRate(rate);
  const normalizedSource = sourceCurrency.toUpperCase();
  if (displayCurrency === normalizedSource) return price;
  if (displayCurrency === "CNY" && normalizedSource === "USD") return price * safeRate;
  if (displayCurrency === "USD" && normalizedSource === "CNY") return price / safeRate;
  return price;
}

export function formatPrice(price: number, currency: string): string {
  if (!Number.isFinite(price)) return "—";
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  if (price < 0.01) return `${sym}${price.toFixed(4)}`;
  if (price < 1) return `${sym}${price.toFixed(3)}`;
  return `${sym}${price.toFixed(2)}`;
}

export function formatCost(cost: number, currency: string): string {
  if (!Number.isFinite(cost)) return "—";
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  if (cost < 0.001) return `${sym}${cost.toFixed(6)}`;
  if (cost < 0.01) return `${sym}${cost.toFixed(5)}`;
  if (cost < 0.1) return `${sym}${cost.toFixed(4)}`;
  return `${sym}${cost.toFixed(2)}`;
}

export function displayPrice(
  price: number,
  sourceCurrency: string,
  displayCurrency: DisplayCurrency,
  rate: number
): string {
  return formatPrice(convertPrice(price, sourceCurrency, displayCurrency, rate), displayCurrency);
}

export function hasCachePricing(model: ModelPricing): boolean {
  return model.cachedWritePrice != null || model.cachedReadPrice != null;
}

export function effectiveInputPrice(
  inputPrice: number,
  cachedWritePrice: number | null,
  cachedReadPrice: number | null,
  hitRate: number
): number {
  const clampedHitRate = Math.min(100, Math.max(0, Number.isFinite(hitRate) ? hitRate : 0));
  const writePrice = cachedWritePrice ?? inputPrice;
  const readPrice = cachedReadPrice ?? inputPrice;
  if (clampedHitRate <= 0) return writePrice;
  if (clampedHitRate >= 100) return readPrice;
  return ((100 - clampedHitRate) / 100) * writePrice + (clampedHitRate / 100) * readPrice;
}

export function mixedPricePerMillionTokens(
  inputPrice: number,
  outputPrice: number,
  inputOutputRatio: number
): number {
  const safeRatio = Number.isFinite(inputOutputRatio) && inputOutputRatio > 0 ? inputOutputRatio : 1;
  return (inputPrice * safeRatio + outputPrice) / (safeRatio + 1);
}

export function parseNonNegativeNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function parseNonNegativeInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
