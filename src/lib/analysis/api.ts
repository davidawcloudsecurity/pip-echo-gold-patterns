/**
 * Server function: fetchHistoricalAnalysis
 *
 * Fetches XAU/USD Daily + hourly OHLC from Twelve Data, runs DTW
 * similarity search, measures outcomes, builds scenarios and projections.
 * Does NOT call any vision LLM — chart interpretation is handled separately
 * by interpretChart in interpretation.functions.ts.
 *
 * TWELVEDATA_API_KEY must be set in .env.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchDailyCandles, fetchHourlyCandles, sliceHourly } from "../xau/loader";
import { computeFeatures } from "../xau/features";
import { findTopMatches } from "./dtw";
import { measureOutcomes, summariseOutcomes } from "./outcomes";
import { buildScenarios } from "./scenarios";
import { buildProjection } from "./projection";
import type { Candle } from "../xau/data";
import type { MatchOutcome, OutcomeSummary, OutcomeDirection } from "./outcomes";
import type { Scenario } from "./scenarios";
import type { ScenarioProjection } from "./projection";

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

const HistoricalInput = z.object({
  /**
   * How many recent daily candles to use as the query window.
   * Comes from the vision LLM's lookbackCandles estimate, or defaults to 20.
   */
  lookbackCandles: z.number().int().min(5).max(40).default(20),
  /** Trend hint from vision interpretation — used in scenario descriptions. */
  trend: z.enum(["bullish", "bearish", "sideways", "unclear"]).default("unclear"),
  supportLevels: z.array(z.number()).default([]),
  resistanceLevels: z.array(z.number()).default([]),
});

export type HistoricalInput = z.infer<typeof HistoricalInput>;

export interface EnrichedMatch extends MatchOutcome {
  hourlyCandles: Candle[];
}

export interface HistoricalResult {
  scenarios: Scenario[];
  summary: OutcomeSummary;
  topMatches: EnrichedMatch[];
  projections: Record<OutcomeDirection, ScenarioProjection>;
  currentEntryPrice: number;
  projectedDayStartMs: number;
  dailyCandles: Candle[];
  hourlyCandles: Candle[];
  analysedAt: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const fetchHistoricalAnalysis = createServerFn({ method: "POST" })
  .validator(HistoricalInput)
  .handler(async ({ data }): Promise<HistoricalResult> => {
    const warnings: string[] = [];

    const emptyResult = (extraWarnings: string[]): HistoricalResult => ({
      scenarios: [],
      summary: {
        totalMatches: 0,
        horizonDays: 10,
        bull: { direction: "bull", count: 0, pct: 0, avgMfe: 0, avgMae: 0, avgNetMovePct: 0, maxMfe: 0, maxMae: 0, topMatches: [] },
        bear: { direction: "bear", count: 0, pct: 0, avgMfe: 0, avgMae: 0, avgNetMovePct: 0, maxMfe: 0, maxMae: 0, topMatches: [] },
        sideways: { direction: "sideways", count: 0, pct: 0, avgMfe: 0, avgMae: 0, avgNetMovePct: 0, maxMfe: 0, maxMae: 0, topMatches: [] },
      },
      topMatches: [],
      projections: {
        bull: { direction: "bull", slots: [], matchCount: 0 },
        bear: { direction: "bear", slots: [], matchCount: 0 },
        sideways: { direction: "sideways", slots: [], matchCount: 0 },
      },
      currentEntryPrice: 0,
      projectedDayStartMs: 0,
      dailyCandles: [],
      hourlyCandles: [],
      analysedAt: new Date().toISOString(),
      warnings: [...warnings, ...extraWarnings],
    });

    // 1 — Fetch OHLC history from Twelve Data
    let dailyCandles: Candle[] = [];
    try {
      dailyCandles = await fetchDailyCandles(undefined, 7300);
    } catch (e) {
      warnings.push(`Daily data unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }

    let hourlyCandles: Candle[] = [];
    try {
      hourlyCandles = await fetchHourlyCandles(undefined, 730);
    } catch (e) {
      warnings.push(`Hourly data unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (dailyCandles.length < 50) {
      return emptyResult(["Insufficient historical data for reliable pattern matching."]);
    }

    // 2 — Feature extraction
    const allFeatures = computeFeatures(dailyCandles);

    // 3 — Build query window from the provided lookback estimate
    const windowLen = Math.max(10, Math.min(40, data.lookbackCandles));
    const queryStart = Math.max(0, allFeatures.length - windowLen);
    const queryFeatures = allFeatures.slice(queryStart);

    // 4 — DTW similarity search
    const horizonDays = 10;
    const rawMatches = findTopMatches(queryFeatures, allFeatures, {
      topN: 30,
      band: Math.ceil(windowLen * 0.25),
      minOutcomeCandles: horizonDays,
    });

    // 5 — Measure outcomes
    const outcomes = measureOutcomes(rawMatches, dailyCandles, {
      horizonDays,
      contextDays: 20,
      windowLen,
    });

    // 6 — Summarise
    const summary = summariseOutcomes(outcomes, horizonDays, 3);

    // 7 — Build a minimal interpretation proxy for scenario descriptions
    const interpProxy = {
      trend: data.trend === "bullish" ? "bullish" as const
        : data.trend === "bearish" ? "bearish" as const
        : data.trend === "sideways" ? "sideways" as const
        : "unclear" as const,
      supportLevels: data.supportLevels,
      resistanceLevels: data.resistanceLevels,
    };

    // 8 — Scenarios
    const scenarios = buildScenarios(summary, interpProxy as Parameters<typeof buildScenarios>[1]);

    // 9 — Enrich top matches with hourly candles
    const allTopMatches = [
      ...summary.bull.topMatches,
      ...summary.bear.topMatches,
      ...summary.sideways.topMatches,
    ];

    const topMatches: EnrichedMatch[] = allTopMatches.map((mo) => {
      const fromMs = mo.patternStartMs - 2 * 86_400_000;
      const toMs = mo.patternEndMs + horizonDays * 86_400_000;
      return { ...mo, hourlyCandles: sliceHourly(hourlyCandles, fromMs, toMs) };
    });

    // 10 — Build 1h projections per direction
    const currentEntryPrice = dailyCandles[dailyCandles.length - 1]?.close ?? 0;
    const nowMs = Date.now();
    const projectedDayStartMs = Math.floor(nowMs / 86_400_000) * 86_400_000 + 86_400_000;

    const projections: Record<OutcomeDirection, ScenarioProjection> = {
      bull: buildProjection(topMatches.filter((m) => m.direction === "bull"), "bull"),
      bear: buildProjection(topMatches.filter((m) => m.direction === "bear"), "bear"),
      sideways: buildProjection(topMatches.filter((m) => m.direction === "sideways"), "sideways"),
    };

    return {
      scenarios,
      summary,
      topMatches,
      projections,
      currentEntryPrice,
      projectedDayStartMs,
      dailyCandles,
      hourlyCandles,
      analysedAt: new Date().toISOString(),
      warnings,
    };
  });
