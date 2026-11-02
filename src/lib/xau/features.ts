import type { Candle } from "./data";

export interface CandleFeatures extends Candle {
  direction: "bull" | "bear" | "doji";
  body: number;
  range: number;
  upperWick: number;
  lowerWick: number;
  bodyRatio: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  /** ATR known BEFORE this candle (from prior candles only) — no look-ahead. */
  atr: number | null;
  rangeAtr: number | null;
  bodyAtr: number | null;
}

/** Wilder ATR. Returns atr[i] computed from candles 0..i inclusive. */
export function wilderAtr(c: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(c.length).fill(null);
  let atr = 0;
  for (let i = 0; i < c.length; i++) {
    const tr = i === 0 ? c[i]!.high - c[i]!.low
      : Math.max(c[i]!.high - c[i]!.low, Math.abs(c[i]!.high - c[i - 1]!.close), Math.abs(c[i]!.low - c[i - 1]!.close));
    if (i < period) { atr += tr; if (i === period - 1) { atr /= period; out[i] = atr; } }
    else { atr = (atr * (period - 1) + tr) / period; out[i] = atr; }
  }
  return out;
}

export function computeFeatures(c: Candle[], atrPeriod = 14): CandleFeatures[] {
  const atr = wilderAtr(c, atrPeriod);
  return c.map((k, i) => {
    const body = Math.abs(k.close - k.open);
    const range = k.high - k.low;
    const upperWick = k.high - Math.max(k.open, k.close);
    const lowerWick = Math.min(k.open, k.close) - k.low;
    const prevAtr = i > 0 ? (atr[i - 1] ?? null) : null;
    const safe = (v: number) => (range > 0 ? v / range : 0);
    return {
      ...k,
      direction: k.close > k.open ? "bull" : k.close < k.open ? "bear" : "doji",
      body, range, upperWick, lowerWick,
      bodyRatio: safe(body),
      upperWickRatio: safe(upperWick),
      lowerWickRatio: safe(lowerWick),
      atr: prevAtr,
      rangeAtr: prevAtr ? range / prevAtr : null,
      bodyAtr: prevAtr ? body / prevAtr : null,
    };
  });
}
