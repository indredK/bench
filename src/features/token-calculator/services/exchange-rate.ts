/**
 * USD/CNY exchange rate / 汇率: fetch from Frankfurter (no API key) with TTL cache.
 * Rate semantics match pricing.ts — CNY per 1 USD.
 */
import { DEFAULT_EXCHANGE_RATE } from "@/features/token-calculator/model/pricing";
import { readStorageItem, writeStorageItem } from "@/platform/storage";

const CACHE_KEY = "token-calculator.exchange-rate.v1";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CachedRate = {
  rate: number;
  fetchedAt: number;
  source: string;
};

type FrankfurterResponse = {
  rates?: { CNY?: number };
};

function parseCached(raw: string | null): CachedRate | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedRate>;
    if (
      typeof parsed.rate === "number" &&
      parsed.rate > 0 &&
      typeof parsed.fetchedAt === "number"
    ) {
      return {
        rate: parsed.rate,
        fetchedAt: parsed.fetchedAt,
        source: typeof parsed.source === "string" ? parsed.source : "cache",
      };
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}

export type ExchangeRateInfo = {
  rate: number;
  fetchedAt: number | null;
  source: string;
  stale: boolean;
};

export async function fetchUsdCnyExchangeRate(options?: {
  forceRefresh?: boolean;
}): Promise<ExchangeRateInfo> {
  const now = Date.now();
  const cached = parseCached(readStorageItem(CACHE_KEY));
  if (
    cached &&
    !options?.forceRefresh &&
    now - cached.fetchedAt < CACHE_TTL_MS
  ) {
    return { rate: cached.rate, fetchedAt: cached.fetchedAt, source: cached.source, stale: false };
  }

  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=CNY");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as FrankfurterResponse;
    const rate = data.rates?.CNY;
    if (typeof rate !== "number" || rate <= 0) throw new Error("invalid rate");

    const entry: CachedRate = {
      rate,
      fetchedAt: now,
      source: "frankfurter.app",
    };
    writeStorageItem(CACHE_KEY, JSON.stringify(entry));
    return { rate, fetchedAt: now, source: entry.source, stale: false };
  } catch {
    if (cached) {
      return {
        rate: cached.rate,
        fetchedAt: cached.fetchedAt,
        source: cached.source,
        stale: true,
      };
    }
    return {
      rate: DEFAULT_EXCHANGE_RATE,
      fetchedAt: null,
      source: "default",
      stale: true,
    };
  }
}
