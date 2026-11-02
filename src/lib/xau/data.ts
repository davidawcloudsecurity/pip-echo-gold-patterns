// Data loading & validation for OHLC CSV files.
// Timezone rule: timestamps WITH an explicit offset/Z are honoured; timestamps
// WITHOUT one are interpreted as UTC. Everything is stored as UTC epoch ms.

export interface Candle {
  t: number; // UTC epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LoadReport {
  candles: Candle[];
  totalRows: number;
  invalidRows: { line: number; reason: string }[];
  duplicates: number;
  gaps: { from: number; to: number; missingDays: number }[];
}

function parseTimestamp(raw: string): number | null {
  const s = raw.trim().replace(/^"|"$/g, "");
  if (!s) return null;
  if (/^\d{10}$/.test(s)) return Number(s) * 1000;
  if (/^\d{13}$/.test(s)) return Number(s);
  let iso = s.replace(" ", "T").replace(/\./g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso += "T00:00:00";
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const ms = Date.parse(hasTz ? iso : iso + "Z");
  return Number.isNaN(ms) ? null : ms;
}

export function parseOhlcCsv(text: string, expectedStepMs?: number): LoadReport {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const invalidRows: LoadReport["invalidRows"] = [];
  if (lines.length === 0) return { candles: [], totalRows: 0, invalidRows, duplicates: 0, gaps: [] };

  const header = lines[0]!.toLowerCase().split(/[,;\t]/).map((h) => h.trim().replace(/"/g, ""));
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iT = idx(["timestamp", "time", "date", "datetime"]);
  const iO = idx(["open", "o"]);
  const iH = idx(["high", "h"]);
  const iL = idx(["low", "l"]);
  const iC = idx(["close", "c"]);
  if ([iT, iO, iH, iL, iC].some((i) => i < 0)) {
    throw new Error("CSV header must contain timestamp, open, high, low, close");
  }

  const map = new Map<number, Candle>();
  let duplicates = 0;
  for (let n = 1; n < lines.length; n++) {
    const cols = lines[n]!.split(/[,;\t]/);
    const t = parseTimestamp(cols[iT] ?? "");
    const [open, high, low, close] = [iO, iH, iL, iC].map((i) => Number((cols[i] ?? "").trim())) as [number, number, number, number];
    let reason = "";
    if (t === null) reason = "bad timestamp";
    else if ([open, high, low, close].some((v) => !Number.isFinite(v) || v <= 0)) reason = "non-numeric or non-positive price";
    else if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) reason = "high/low inconsistent with open/close";
    if (reason) { invalidRows.push({ line: n + 1, reason }); continue; }
    if (map.has(t!)) duplicates++;
    map.set(t!, { t: t!, open, high, low, close });
  }
  const candles = [...map.values()].sort((a, b) => a.t - b.t);

  const gaps: LoadReport["gaps"] = [];
  if (expectedStepMs) {
    for (let i = 1; i < candles.length; i++) {
      const diff = candles[i]!.t - candles[i - 1]!.t;
      // For daily data, allow weekends (up to 3 days) without flagging.
      const tolerance = expectedStepMs === DAY_MS ? 3 * DAY_MS : expectedStepMs;
      if (diff > tolerance) {
        gaps.push({ from: candles[i - 1]!.t, to: candles[i]!.t, missingDays: Math.round(diff / DAY_MS) - 1 });
      }
    }
  }
  return { candles, totalRows: lines.length - 1, invalidRows, duplicates, gaps };
}

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

/** Drop the final candle if it may still be forming (its period has not ended yet). */
export function dropIncomplete(candles: Candle[], stepMs: number, now = Date.now()): Candle[] {
  if (!candles.length) return candles;
  const last = candles[candles.length - 1]!;
  return last.t + stepMs > now ? candles.slice(0, -1) : candles;
}
