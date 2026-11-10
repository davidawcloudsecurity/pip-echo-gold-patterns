/**
 * Genuine XAU/USD OHLC retrieval from Twelve Data. Credentials and network
 * access remain server-side. Intraday timestamps are requested in UTC; Daily
 * dates are treated as provider session labels and aligned to hourly OHLC by
 * src/lib/analysis/sessions.ts rather than assumed to be UTC calendar days.
 */

import type { Candle } from "./data";

const TWELVEDATA_ENDPOINT = "https://api.twelvedata.com/time_series";
const MAX_OUTPUTSIZE = 5000;
const HOUR_MS = 3_600_000;

interface TwelveDataTimeSeries {
  meta: {
    symbol: string;
    interval: string;
    currency_base?: string;
    currency_quote?: string;
    exchange?: string;
    exchange_timezone?: string;
    type?: string;
  } | null;
  values: Array<{ datetime: string; open: string; high: string; low: string; close: string }> | null;
  status: "ok" | "error";
  message?: string;
  code?: number;
}

function getApiKey(): string {
  const key = process.env["TWELVEDATA_API_KEY"];
  if (!key) throw new Error("The price-feed connection is not configured.");
  return key;
}

function resolveSymbol(symbol?: string): string {
  return symbol || process.env["XAU_SYMBOL"] || "XAU/USD";
}

function parseDateTime(dt: string): number {
  const iso = dt.includes(" ") ? dt.replace(" ", "T") + "Z" : dt + "T00:00:00Z";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error("The price feed returned an invalid timestamp.");
  return ms;
}

function formatEndDate(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

function parseTwelveData(raw: TwelveDataTimeSeries, requestedSymbol: string): Candle[] {
  if (raw.status === "error") throw new Error(raw.message ?? "The price feed returned an error.");
  if (raw.meta?.symbol !== requestedSymbol) throw new Error("The price feed returned a different instrument.");
  if (requestedSymbol === "XAU/USD" && raw.meta.currency_base !== "Gold Spot") {
    throw new Error("The price feed did not confirm Gold Spot / US Dollar data.");
  }

  const candles: Candle[] = [];
  for (const value of raw.values ?? []) {
    const t = parseDateTime(value.datetime);
    const open = Number(value.open);
    const high = Number(value.high);
    const low = Number(value.low);
    const close = Number(value.close);
    if ([open, high, low, close].some((n) => !Number.isFinite(n) || n <= 0)) continue;
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) continue;
    candles.push({ t, open, high, low, close });
  }
  return candles;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBatch(symbol: string, interval: string, apiKey: string, endDate?: string): Promise<Candle[]> {
  const params = new URLSearchParams({ symbol, interval, outputsize: String(MAX_OUTPUTSIZE), apikey: apiKey, timezone: "UTC" });
  if (endDate) params.set("end_date", endDate);
  const url = `${TWELVEDATA_ENDPOINT}?${params}`;

  let res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (res.status === 429) {
    await wait(10_000);
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  }
  if (!res.ok) throw new Error(`The price feed is unavailable (HTTP ${res.status}).`);
  return parseTwelveData((await res.json()) as TwelveDataTimeSeries, symbol);
}

export async function fetchDailyCandles(symbol?: string, _rangeDays = 7300): Promise<Candle[]> {
  const candles = await fetchBatch(resolveSymbol(symbol), "1day", getApiKey());
  return candles.sort((a, b) => a.t - b.t);
}

/** Paginate with provider-rate-limit spacing; never fabricate missing bars. */
export async function fetchHourlyCandles(symbol?: string, rangeDays = 400): Promise<Candle[]> {
  const sym = resolveSymbol(symbol);
  const apiKey = getApiKey();
  const targetCount = rangeDays * 24;
  const all = new Map<number, Candle>();
  let endDate: string | undefined;

  while (all.size < targetCount) {
    if (endDate) await wait(8_500);
    const batch = await fetchBatch(sym, "1h", apiKey, endDate);
    if (!batch.length) break;
    for (const candle of batch) all.set(candle.t, candle);
    const oldestT = Math.min(...batch.map((c) => c.t));
    endDate = formatEndDate(oldestT - HOUR_MS);
    if (batch.length < MAX_OUTPUTSIZE) break;
  }

  return [...all.values()].sort((a, b) => a.t - b.t);
}

export function sliceHourly(hourly: Candle[], fromMs: number, toMs: number): Candle[] {
  return hourly.filter((c) => c.t >= fromMs && c.t <= toMs);
}
