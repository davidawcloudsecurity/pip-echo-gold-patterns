/**
 * XAUUSD OHLC data loader.
 *
 * Fetches daily and 1-hour candles from Twelve Data's REST API (API key
 * required — free tier: 8 req/min, 800/day, no credit card). The server
 * function in src/lib/analysis/api.ts calls this so the HTTP request stays
 * server-side (avoids CORS and keeps the key private).
 *
 * Timezone: Twelve Data returns timestamps in UTC when timezone=UTC is
 * requested. We honour them as-is.
 *
 * Symbol: defaults to XAU/USD (Gold Spot / US Dollar). Override with the
 * XAU_SYMBOL environment variable if you need a different instrument.
 */

import type { Candle } from "./data";

const TWELVEDATA_ENDPOINT = "https://api.twelvedata.com/time_series";
const MAX_OUTPUTSIZE = 5000; // Twelve Data caps outputsize at 5000.

/** Twelve Data time_series response shape (only the fields we use). */
interface TwelveDataTimeSeries {
  meta: { symbol: string; interval: string; exchange: string } | null;
  values: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
  }> | null;
  status: "ok" | "error";
  message?: string;
  code?: number;
}

function getApiKey(): string {
  const key = process.env["TWELVEDATA_API_KEY"];
  if (!key) {
    throw new Error(
      "TWELVEDATA_API_KEY is not set. Get a free key at https://twelvedata.com and add it to .env (see .env.example).",
    );
  }
  return key;
}

function resolveSymbol(symbol?: string): string {
  return symbol || process.env["XAU_SYMBOL"] || "XAU/USD";
}

/** Convert a Twelve Data datetime string to UTC epoch milliseconds. */
function parseDateTime(dt: string): number {
  // Daily:  "2024-11-08"           → "2024-11-08T00:00:00Z"
  // Hourly: "2024-11-08 14:00:00"  → "2024-11-08T14:00:00Z"
  const iso = dt.includes(" ") ? dt.replace(" ", "T") + "Z" : dt + "T00:00:00Z";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Unparseable datetime from Twelve Data: ${dt}`);
  return ms;
}

/** Format UTC epoch ms as "YYYY-MM-DD HH:MM:SS" for the end_date parameter. */
function formatEndDate(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

/** Parse a Twelve Data response into validated Candle objects. */
function parseTwelveData(raw: TwelveDataTimeSeries): Candle[] {
  if (raw.status === "error") {
    throw new Error(raw.message ?? "Twelve Data returned an error");
  }
  const values = raw.values;
  if (!values?.length) return [];
  const candles: Candle[] = [];
  for (const v of values) {
    const t = parseDateTime(v.datetime);
    const open = Number(v.open);
    const high = Number(v.high);
    const low = Number(v.low);
    const close = Number(v.close);
    if ([open, high, low, close].some((n) => !Number.isFinite(n) || n <= 0)) continue;
    candles.push({ t, open, high, low, close });
  }
  return candles;
}

/** Fetch a single batch of candles (up to MAX_OUTPUTSIZE per request). */
async function fetchBatch(
  symbol: string,
  interval: string,
  apiKey: string,
  endDate?: string,
): Promise<Candle[]> {
  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize: String(MAX_OUTPUTSIZE),
    apikey: apiKey,
    timezone: "UTC",
  });
  if (endDate) params.set("end_date", endDate);
  const url = `${TWELVEDATA_ENDPOINT}?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Twelve Data returned ${res.status} for ${symbol}`);
  return parseTwelveData((await res.json()) as TwelveDataTimeSeries);
}

/**
 * Fetch daily XAUUSD candles for up to ~20 years (one request, 5000 daily
 * candles ≈ 19 years of gold spot data).
 */
export async function fetchDailyCandles(
  symbol?: string,
  rangeDays = 7300,
): Promise<Candle[]> {
  const sym = resolveSymbol(symbol);
  const apiKey = getApiKey();
  const candles = await fetchBatch(sym, "1day", apiKey);
  return candles.sort((a, b) => a.t - b.t);
}

/**
 * Fetch 1-hour XAUUSD candles. Paginates backward from the most recent data
 * to cover `rangeDays` (default: 730 days ≈ 17 520 hourly candles, ~4 API
 * requests on the free tier).
 */
export async function fetchHourlyCandles(
  symbol?: string,
  rangeDays = 730,
): Promise<Candle[]> {
  const sym = resolveSymbol(symbol);
  const apiKey = getApiKey();
  const intervalMs = 3_600_000; // 1 hour
  const targetCount = rangeDays * 24;
  const all = new Map<number, Candle>();
  let endDate: string | undefined;

  while (all.size < targetCount) {
    const batch = await fetchBatch(sym, "1h", apiKey, endDate);
    if (!batch.length) break;
    for (const c of batch) all.set(c.t, c);
    // Step back: set end_date to just before the oldest candle in this batch.
    const oldestT = Math.min(...batch.map((c) => c.t));
    endDate = formatEndDate(oldestT - intervalMs);
    if (batch.length < MAX_OUTPUTSIZE) break; // no more historical data
  }

  return [...all.values()].sort((a, b) => a.t - b.t);
}

/** Slice the hourly candles that fall within [fromMs, toMs]. */
export function sliceHourly(hourly: Candle[], fromMs: number, toMs: number): Candle[] {
  return hourly.filter((c) => c.t >= fromMs && c.t <= toMs);
}
