import { HOUR_MS, type Candle } from "../xau/data";

export interface AlignedSession {
  dailyDateMs: number;
  startMs: number;
  endMs: number;
  startHourUtc: number;
  candles: Candle[];
  difference: number;
}

export function sessionWindow(dailyDateMs: number, startHourUtc: number) {
  return {
    startMs: dailyDateMs - (24 - startHourUtc) * HOUR_MS,
    endMs: dailyDateMs + startHourUtc * HOUR_MS,
  };
}

function aggregate(candles: Candle[]) {
  return {
    open: candles[0]!.open,
    high: Math.max(...candles.map((c) => c.high)),
    low: Math.min(...candles.map((c) => c.low)),
    close: candles[candles.length - 1]!.close,
  };
}

/**
 * Align a provider Daily candle to the exact 24 hourly bars that reproduce its
 * OHLC. Twelve Data's precious-metal Daily timezone is not supplied as UTC
 * metadata, so the session offset is established from prices, not assumed.
 */
export function alignDailySession(daily: Candle, hourly: Candle[]): AlignedSession | null {
  let best: AlignedSession | null = null;

  for (let startHourUtc = 18; startHourUtc <= 23; startHourUtc++) {
    const { startMs, endMs } = sessionWindow(daily.t, startHourUtc);
    const candles = hourly.filter((c) => c.t >= startMs && c.t < endMs);
    if (candles.length !== 24) continue;
    if (!candles.every((c, i) => c.t === startMs + i * HOUR_MS)) continue;

    const combined = aggregate(candles);
    const difference = Math.max(
      Math.abs(daily.open - combined.open),
      Math.abs(daily.high - combined.high),
      Math.abs(daily.low - combined.low),
      Math.abs(daily.close - combined.close),
    );
    const candidate: AlignedSession = {
      dailyDateMs: daily.t,
      startMs,
      endMs,
      startHourUtc,
      candles,
      difference,
    };
    if (!best || difference < best.difference) best = candidate;
  }

  const tolerance = Math.max(0.000001, daily.close * 0.0000001);
  return best && best.difference <= tolerance ? best : null;
}
