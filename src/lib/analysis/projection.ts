import { HOUR_MS, type Candle } from "../xau/data";
import type { MatchOutcome, OutcomeDirection } from "./outcomes";

export interface ProjectionSlot {
  hourOffset: number;
  avgHigh: number; // normalised % from formation close
  avgLow: number;
  avgClose: number;
  minLow: number;
  maxHigh: number;
  observations: number;
}

export interface ScenarioProjection {
  direction: OutcomeDirection;
  slots: ProjectionSlot[];
  matchCount: number;
}

/**
 * Aggregate actual next-session hourly bars into a normalized descriptive
 * envelope. Offsets come from timestamps, so a missing bar leaves an empty
 * slot rather than being interpolated or shifted into the wrong hour.
 */
export function buildProjection(
  matches: Array<MatchOutcome & { hourlyCandles: Candle[] }>,
  direction: OutcomeDirection,
): ScenarioProjection {
  const slotData = new Map<number, { highs: number[]; lows: number[]; closes: number[] }>();
  let matchCount = 0;

  for (const match of matches) {
    if (!match.hourlyCandles.length || match.entryPrice <= 0) continue;
    let validBars = 0;
    for (const candle of match.hourlyCandles) {
      const offset = Math.round((candle.t - match.outcomeStartMs) / HOUR_MS);
      if (offset < 0 || offset > 23) continue;
      if (!slotData.has(offset)) slotData.set(offset, { highs: [], lows: [], closes: [] });
      const slot = slotData.get(offset)!;
      slot.highs.push(((candle.high - match.entryPrice) / match.entryPrice) * 100);
      slot.lows.push(((candle.low - match.entryPrice) / match.entryPrice) * 100);
      slot.closes.push(((candle.close - match.entryPrice) / match.entryPrice) * 100);
      validBars++;
    }
    if (validBars > 0) matchCount++;
  }

  const slots: ProjectionSlot[] = [];
  for (const [offset, data] of [...slotData.entries()].sort((a, b) => a[0] - b[0])) {
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    slots.push({
      hourOffset: offset,
      avgHigh: average(data.highs),
      avgLow: average(data.lows),
      avgClose: average(data.closes),
      minLow: Math.min(...data.lows),
      maxHigh: Math.max(...data.highs),
      observations: data.highs.length,
    });
  }

  return { direction, slots, matchCount };
}
