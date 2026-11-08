/**
 * Scenario projection builder.
 *
 * For each match, takes the hourly candles following the pattern end,
 * normalises prices relative to the pattern's closing price, and
 * aggregates into a projected high/low range per hour offset.
 */

import type { Candle } from "../xau/data";
import type { MatchOutcome, OutcomeDirection } from "./outcomes";

export interface ProjectionSlot {
  hourOffset: number;
  avgHigh: number; // normalised %
  avgLow: number; // normalised %
  minLow: number; // normalised %
  maxHigh: number; // normalised %
}

export interface ScenarioProjection {
  direction: OutcomeDirection;
  slots: ProjectionSlot[];
  matchCount: number;
}

/**
 * Build a 1-hour projection envelope from the hourly candles of enriched
 * matches. Prices are normalised to percentage change from each match's
 * entry price so different historical periods are comparable.
 */
export function buildProjection(
  matches: Array<MatchOutcome & { hourlyCandles: Candle[] }>,
  direction: OutcomeDirection,
): ScenarioProjection {
  if (!matches.length) {
    return { direction, slots: [], matchCount: 0 };
  }

  // Collect normalised high/low at each hour offset across all matches
  const slotData = new Map<number, { highs: number[]; lows: number[] }>();

  for (const match of matches) {
    if (!match.hourlyCandles.length) continue;
    const entryPrice = match.hourlyCandles[0]!.open;
    if (entryPrice <= 0) continue;

    for (let i = 0; i < match.hourlyCandles.length; i++) {
      const c = match.hourlyCandles[i]!;
      const offset = i;
      if (!slotData.has(offset)) slotData.set(offset, { highs: [], lows: [] });
      const slot = slotData.get(offset)!;
      slot.highs.push(((c.high - entryPrice) / entryPrice) * 100);
      slot.lows.push(((c.low - entryPrice) / entryPrice) * 100);
    }
  }

  const slots: ProjectionSlot[] = [];
  for (const [offset, data] of [...slotData.entries()].sort((a, b) => a[0] - b[0])) {
    if (!data.highs.length) continue;
    slots.push({
      hourOffset: offset,
      avgHigh: data.highs.reduce((s, v) => s + v, 0) / data.highs.length,
      avgLow: data.lows.reduce((s, v) => s + v, 0) / data.lows.length,
      minLow: Math.min(...data.lows),
      maxHigh: Math.max(...data.highs),
    });
  }

  return { direction, slots, matchCount: matches.length };
}
