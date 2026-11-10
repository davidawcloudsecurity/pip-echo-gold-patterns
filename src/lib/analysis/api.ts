import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DAY_MS, HOUR_MS, dropIncomplete, type Candle } from "../xau/data";
import { fetchDailyCandles, fetchHourlyCandles } from "../xau/loader";
import { computeFeatures } from "../xau/features";
import { findTopMatches } from "./dtw";
import { alignDailySession, sessionWindow } from "./sessions";
import { deduplicateJointMatches, rankJointMatches, type JointCandidate } from "./joint";
import { measureOutcomes, summariseOutcomes, type MatchOutcome, type OutcomeDirection, type OutcomeSummary } from "./outcomes";
import { buildProjection, type ScenarioProjection } from "./projection";
import { buildScenarios, type Scenario } from "./scenarios";

const HistoricalInput = z.object({
  lookbackCandles: z.number().int().min(10).max(40).default(20),
  trend: z.enum(["bullish", "bearish", "sideways", "unclear"]).default("unclear"),
  supportLevels: z.array(z.number()).default([]),
  resistanceLevels: z.array(z.number()).default([]),
  cutoff: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
});

export type HistoricalInput = z.infer<typeof HistoricalInput>;

export interface EnrichedMatch extends MatchOutcome {
  hourlyCandles: Candle[];
  contextHourlyCandles: Candle[];
  patternCandles: Candle[];
  outcomeCandle: Candle;
  sessionStartHourUtc: number;
}

export interface FeedProvenance {
  provider: "Twelve Data";
  symbol: "XAU/USD";
  dailyCount: number;
  hourlyCount: number;
  dailyFirstMs: number;
  dailyLastMs: number;
  hourlyFirstMs: number;
  hourlyLastMs: number;
  sessionNote: string;
}

export interface VerifiedLevels {
  support: number[];
  resistance: number[];
  sma20: number | null;
}

export interface HistoricalResult {
  status: "ok" | "insufficient" | "unavailable";
  scenarios: Scenario[];
  summary: OutcomeSummary;
  topMatches: EnrichedMatch[];
  projections: Record<OutcomeDirection, ScenarioProjection>;
  currentEntryPrice: number;
  queryDateMs: number;
  projectedDayStartMs: number;
  projectedSessionStartMs: number;
  dailyCandles: Candle[];
  hourlyCandles: Candle[];
  verifiedLevels: VerifiedLevels;
  feed: FeedProvenance;
  analysedAt: string;
  warnings: string[];
}

const emptySummary = (): OutcomeSummary => ({
  totalMatches: 0,
  horizonDays: 1,
  bull: { direction: "bull", count: 0, pct: 0, avgMfe: 0, avgMae: 0, avgNetMovePct: 0, maxMfe: 0, maxMae: 0, topMatches: [] },
  bear: { direction: "bear", count: 0, pct: 0, avgMfe: 0, avgMae: 0, avgNetMovePct: 0, maxMfe: 0, maxMae: 0, topMatches: [] },
  sideways: { direction: "sideways", count: 0, pct: 0, avgMfe: 0, avgMae: 0, avgNetMovePct: 0, maxMfe: 0, maxMae: 0, topMatches: [] },
});

const emptyProjections = (): Record<OutcomeDirection, ScenarioProjection> => ({
  bull: { direction: "bull", slots: [], matchCount: 0 },
  bear: { direction: "bear", slots: [], matchCount: 0 },
  sideways: { direction: "sideways", slots: [], matchCount: 0 },
});

export const fetchHistoricalAnalysis = createServerFn({ method: "POST" })
  .inputValidator(HistoricalInput)
  .handler(async ({ data }): Promise<HistoricalResult> => {
    const warnings: string[] = [];
    const emptyResult = (status: HistoricalResult["status"], messages: string[]): HistoricalResult => ({
      status,
      scenarios: [],
      summary: emptySummary(),
      topMatches: [],
      projections: emptyProjections(),
      currentEntryPrice: 0,
      queryDateMs: 0,
      projectedDayStartMs: 0,
      projectedSessionStartMs: 0,
      dailyCandles: [],
      hourlyCandles: [],
      verifiedLevels: { support: [], resistance: [], sma20: null },
      feed: { provider: "Twelve Data", symbol: "XAU/USD", dailyCount: 0, hourlyCount: 0, dailyFirstMs: 0, dailyLastMs: 0, hourlyFirstMs: 0, hourlyLastMs: 0, sessionNote: "" },
      analysedAt: new Date().toISOString(),
      warnings: [...warnings, ...messages],
    });

    const [dailyResponse, hourlyResponse] = await Promise.allSettled([
      fetchDailyCandles(undefined, 7300),
      fetchHourlyCandles(undefined, 400),
    ]);
    if (dailyResponse.status === "rejected") warnings.push("Daily prices could not be retrieved. Please retry after the feed rate limit clears.");
    if (hourlyResponse.status === "rejected") warnings.push("Hourly prices could not be retrieved. Please retry after the feed rate limit clears.");
    if (dailyResponse.status === "rejected" || hourlyResponse.status === "rejected") {
      return emptyResult("unavailable", ["No numerical scenarios are shown without both genuine Daily and hourly data."]);
    }

    const now = Date.now();
    const cutoffMs = data.cutoff ? Date.parse(`${data.cutoff}T00:00:00Z`) : Number.POSITIVE_INFINITY;
    // A 21:00 UTC cutoff conservatively excludes today's still-forming Daily bar.
    const dailyCandles = dailyResponse.value.filter((c) => c.t <= cutoffMs && c.t + 21 * HOUR_MS <= now);
    const completedHourly = dropIncomplete(hourlyResponse.value, HOUR_MS, now);
    if (dailyCandles.length < 50) return emptyResult("insufficient", ["At least 50 completed Daily candles are required."]);

    const queryDaily = dailyCandles[dailyCandles.length - 1]!;
    const queryHourly = completedHourly.filter((c) => c.t < queryDaily.t + DAY_MS);
    const querySession = alignDailySession(queryDaily, queryHourly);
    if (!querySession) return emptyResult("insufficient", ["The selected Daily candle does not have 24 exact matching hourly bars. Choose an earlier completed date or retry with more coverage."]);

    // Target-session bars are excluded from every matching and projection input.
    const usableHourly = queryHourly.filter((c) => c.t < querySession.endMs);
    const allFeatures = computeFeatures(dailyCandles);
    const windowLen = Math.min(data.lookbackCandles, allFeatures.length - 2);
    if (windowLen < 10) return emptyResult("insufficient", ["The query window is too short for historical matching."]);
    const queryFeatures = allFeatures.slice(-windowLen);
    const queryAtr = queryFeatures[queryFeatures.length - 1]!.atr;
    if (!queryAtr) return emptyResult("insufficient", ["Pre-formation volatility is unavailable for hourly normalization."]);

    const dailyMatches = findTopMatches(queryFeatures, allFeatures, {
      topN: 180,
      band: Math.ceil(windowLen * 0.25),
      minOutcomeCandles: 1,
    });
    const candidates: JointCandidate[] = [];
    for (const match of dailyMatches) {
      const formation = dailyCandles[match.patternEndIdx]!;
      const session = alignDailySession(formation, usableHourly);
      const atr = allFeatures[match.patternEndIdx]!.atr;
      if (session && atr) candidates.push({ match, candles: session.candles, atr });
    }

    const jointMatches = deduplicateJointMatches(
      rankJointMatches({ candles: querySession.candles, atr: queryAtr }, candidates, windowLen, 80),
      windowLen,
    ).slice(0, 40);
    const measured = measureOutcomes(jointMatches, dailyCandles, { horizonDays: 1, contextDays: 20, windowLen });
    const enriched: EnrichedMatch[] = [];
    for (const outcome of measured) {
      const formation = dailyCandles[outcome.patternEndIdx]!;
      const nextDaily = dailyCandles[outcome.patternEndIdx + 1]!;
      const formationSession = alignDailySession(formation, usableHourly);
      const outcomeSession = alignDailySession(nextDaily, usableHourly);
      if (!formationSession || !outcomeSession) continue;
      enriched.push({
        ...outcome,
        outcomeStartMs: outcomeSession.startMs,
        outcomeEndMs: outcomeSession.endMs,
        hourlyCandles: outcomeSession.candles,
        contextHourlyCandles: formationSession.candles,
        patternCandles: dailyCandles.slice(outcome.patternStartIdx, outcome.patternEndIdx + 1),
        outcomeCandle: nextDaily,
        sessionStartHourUtc: outcomeSession.startHourUtc,
      });
    }
    if (!enriched.length) return emptyResult("insufficient", ["No non-overlapping historical matches have complete Daily context and a measured 24-hour next session."]);

    const summary = summariseOutcomes(enriched, 1, 3);
    const directions: OutcomeDirection[] = ["bull", "bear", "sideways"];
    const topMatches = directions.flatMap((direction) => enriched
      .filter((match) => match.direction === direction)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3));
    const recent = dailyCandles.slice(-20);
    const verifiedLevels: VerifiedLevels = {
      support: [Math.min(...recent.map((c) => c.low))],
      resistance: [Math.max(...recent.map((c) => c.high))],
      sma20: recent.reduce((sum, c) => sum + c.close, 0) / recent.length,
    };
    const scenarios = buildScenarios(summary, {
      trend: data.trend,
      supportLevels: verifiedLevels.support,
      resistanceLevels: verifiedLevels.resistance,
    });
    const projections: Record<OutcomeDirection, ScenarioProjection> = {
      bull: buildProjection(enriched.filter((m) => m.direction === "bull"), "bull"),
      bear: buildProjection(enriched.filter((m) => m.direction === "bear"), "bear"),
      sideways: buildProjection(enriched.filter((m) => m.direction === "sideways"), "sideways"),
    };
    if (enriched.length < 30) warnings.push("Small sample: these are descriptive historical frequencies, not reliable predictive probabilities.");

    const projectedDayStartMs = queryDaily.t + DAY_MS;
    return {
      status: "ok",
      scenarios,
      summary,
      topMatches,
      projections,
      currentEntryPrice: queryDaily.close,
      queryDateMs: queryDaily.t,
      projectedDayStartMs,
      projectedSessionStartMs: sessionWindow(projectedDayStartMs, querySession.startHourUtc).startMs,
      dailyCandles: dailyCandles.slice(-60),
      hourlyCandles: querySession.candles,
      verifiedLevels,
      feed: {
        provider: "Twelve Data",
        symbol: "XAU/USD",
        dailyCount: dailyCandles.length,
        hourlyCount: usableHourly.length,
        dailyFirstMs: dailyCandles[0]!.t,
        dailyLastMs: queryDaily.t,
        hourlyFirstMs: usableHourly[0]!.t,
        hourlyLastMs: usableHourly[usableHourly.length - 1]!.t,
        sessionNote: `Daily session ${dateLabel(queryDaily.t)} exactly matches 24 hourly bars beginning at ${String(querySession.startHourUtc).padStart(2, "0")}:00 UTC on the prior date. Forming candles, unaligned sessions and missing bars are excluded.`,
      },
      analysedAt: new Date().toISOString(),
      warnings,
    };
  });

function dateLabel(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
