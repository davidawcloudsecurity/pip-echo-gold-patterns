/**
 * Outcome measurement and summarisation.
 *
 * For each historical match, measures what happened in the following
 * `horizonDays` candles: maximum favourable excursion (MFE), maximum
 * adverse excursion (MAE), net move percentage, and direction.
 * Summarises into bull / bear / sideways groups with statistics.
 */

import type { Candle } from "../xau/data";
import type { RawMatch } from "./dtw";

export type OutcomeDirection = "bull" | "bear" | "sideways";

export interface MatchOutcome extends RawMatch {
  direction: OutcomeDirection;
  mfe: number; // Maximum Favourable Excursion (%)
  mae: number; // Maximum Adverse Excursion (%)
  netMovePct: number; // Net move over horizon (%)
  outcomeStartMs: number;
  outcomeEndMs: number;
}

export interface DirectionSummary {
  direction: OutcomeDirection;
  count: number;
  pct: number;
  avgMfe: number;
  avgMae: number;
  avgNetMovePct: number;
  maxMfe: number;
  maxMae: number;
  topMatches: MatchOutcome[];
}

export interface OutcomeSummary {
  totalMatches: number;
  horizonDays: number;
  bull: DirectionSummary;
  bear: DirectionSummary;
  sideways: DirectionSummary;
}

/** 0.5% net move threshold for classifying direction. */
const DIRECTION_THRESHOLD = 0.5;

/**
 * Measure outcomes for each match by looking at the candles that follow
 * the pattern window. Skips matches that don't have enough following candles.
 */
export function measureOutcomes(
  matches: RawMatch[],
  candles: Candle[],
  options: { horizonDays: number; contextDays: number; windowLen: number },
): MatchOutcome[] {
  const { horizonDays } = options;
  const outcomes: MatchOutcome[] = [];

  for (const match of matches) {
    const endIdx = match.patternEndIdx;
    const outcomeEndIdx = endIdx + horizonDays;

    if (outcomeEndIdx >= candles.length) continue;

    const entryPrice = candles[endIdx]!.close;

    let mfe = 0;
    let mae = 0;
    for (let i = endIdx + 1; i <= outcomeEndIdx; i++) {
      const c = candles[i]!;
      mfe = Math.max(mfe, ((c.high - entryPrice) / entryPrice) * 100);
      mae = Math.min(mae, ((c.low - entryPrice) / entryPrice) * 100);
    }

    const exitPrice = candles[outcomeEndIdx]!.close;
    const netMovePct = ((exitPrice - entryPrice) / entryPrice) * 100;

    const direction: OutcomeDirection =
      netMovePct > DIRECTION_THRESHOLD ? "bull"
      : netMovePct < -DIRECTION_THRESHOLD ? "bear"
      : "sideways";

    outcomes.push({
      ...match,
      direction,
      mfe,
      mae,
      netMovePct,
      outcomeStartMs: candles[endIdx + 1]!.t,
      outcomeEndMs: candles[outcomeEndIdx]!.t,
    });
  }

  return outcomes;
}

/** Summarise outcomes into bull / bear / sideways groups with statistics. */
export function summariseOutcomes(
  outcomes: MatchOutcome[],
  horizonDays: number,
  topN: number,
): OutcomeSummary {
  const total = outcomes.length;

  function summarizeDirection(dir: OutcomeDirection): DirectionSummary {
    const matches = outcomes.filter((o) => o.direction === dir);
    const count = matches.length;
    const pct = total > 0 ? (count / total) * 100 : 0;

    // Sort: bull by best MFE, bear by worst MAE, sideways by smallest |netMove|
    const sorted = [...matches].sort((a, b) =>
      dir === "bull" ? b.mfe - a.mfe
      : dir === "bear" ? a.mae - b.mae
      : Math.abs(a.netMovePct) - Math.abs(b.netMovePct),
    );

    return {
      direction: dir,
      count,
      pct,
      avgMfe: count > 0 ? matches.reduce((s, m) => s + m.mfe, 0) / count : 0,
      avgMae: count > 0 ? matches.reduce((s, m) => s + m.mae, 0) / count : 0,
      avgNetMovePct: count > 0 ? matches.reduce((s, m) => s + m.netMovePct, 0) / count : 0,
      maxMfe: count > 0 ? Math.max(...matches.map((m) => m.mfe)) : 0,
      maxMae: count > 0 ? Math.min(...matches.map((m) => m.mae)) : 0,
      topMatches: sorted.slice(0, topN),
    };
  }

  return {
    totalMatches: total,
    horizonDays,
    bull: summarizeDirection("bull"),
    bear: summarizeDirection("bear"),
    sideways: summarizeDirection("sideways"),
  };
}
