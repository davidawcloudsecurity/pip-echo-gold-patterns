/**
 * Server function: analyseChart
 *
 * 1. Calls OpenRouter vision LLM to interpret the chart screenshot.
 * 2. Fetches XAU/USD Daily + hourly OHLC from Twelve Data.
 * 3. Runs DTW similarity search to find historical matches.
 * 4. Measures outcomes for each match.
 * 5. Summarises into bull/bear/sideways scenarios.
 * 6. Builds 1-hour projection envelopes.
 * 7. Returns everything to the client.
 *
 * API keys are read from process.env and never sent to the browser.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchDailyCandles, fetchHourlyCandles, sliceHourly } from "../xau/loader";
import { computeFeatures } from "../xau/features";
import { findTopMatches } from "./dtw";
import { measureOutcomes, summariseOutcomes } from "./outcomes";
import { buildScenarios } from "./scenarios";
import { buildProjection } from "./projection";
import { CHART_ANALYSIS_PROMPT, parseInterpretation, type ChartInterpretation } from "./vision";
import type { Candle } from "../xau/data";
import type { MatchOutcome, OutcomeSummary, OutcomeDirection } from "./outcomes";
import type { Scenario } from "./scenarios";
import type { ScenarioProjection } from "./projection";

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

const AnalyseInput = z.object({
  imageDataUrl: z.string().min(10),
  instrument: z.string().default("XAUUSD"),
  timeframe: z.string().default("1D"),
});

export type AnalyseInput = z.infer<typeof AnalyseInput>;

export interface EnrichedMatch extends MatchOutcome {
  hourlyCandles: Candle[];
}

export interface AnalyseResult {
  interpretation: ChartInterpretation;
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
// Vision LLM call via OpenRouter
// ---------------------------------------------------------------------------

async function callVisionLlm(imageDataUrl: string): Promise<ChartInterpretation> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set. Add it to your .env file.");
  }

  const body = {
    model: "openai/gpt-4o",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: CHART_ANALYSIS_PROMPT },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
        ],
      },
    ],
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://pipecho.app",
      "X-Title": "PipEcho Chart Analysis",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter API error ${res.status}: ${text.slice(0, 300)}`);
  }

  interface OpenRouterResponse {
    choices: Array<{ message: { content: string } }>;
  }
  const json = (await res.json()) as OpenRouterResponse;
  const content = json.choices[0]?.message.content ?? "";
  return parseInterpretation(content);
}

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const analyseChart = createServerFn({ method: "POST" })
  .validator(AnalyseInput)
  .handler(async ({ data }): Promise<AnalyseResult> => {
    const warnings: string[] = [];
    const { imageDataUrl } = data;

    // 1 — Vision LLM
    const interpretation = await callVisionLlm(imageDataUrl);

    const emptyResult = (extraWarnings: string[]): AnalyseResult => ({
      interpretation,
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

    if (!interpretation.readable) {
      return emptyResult([interpretation.unreadableReason ?? "Chart could not be read"]);
    }

    // 2 — Fetch OHLC history from Twelve Data
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

    // 3 — Feature extraction
    const allFeatures = computeFeatures(dailyCandles);

    // 4 — Build query window from the LLM's lookback estimate
    const windowLen = Math.max(10, Math.min(40, interpretation.lookbackCandles));
    const queryStart = Math.max(0, allFeatures.length - windowLen);
    const queryFeatures = allFeatures.slice(queryStart);

    // 5 — DTW similarity search
    const horizonDays = 10;
    const rawMatches = findTopMatches(queryFeatures, allFeatures, {
      topN: 30,
      band: Math.ceil(windowLen * 0.25),
      minOutcomeCandles: horizonDays,
    });

    // 6 — Measure outcomes
    const outcomes = measureOutcomes(rawMatches, dailyCandles, {
      horizonDays,
      contextDays: 20,
      windowLen,
    });

    // 7 — Summarise
    const summary = summariseOutcomes(outcomes, horizonDays, 3);

    // 8 — Scenarios
    const scenarios = buildScenarios(summary, interpretation);

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
      interpretation,
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
