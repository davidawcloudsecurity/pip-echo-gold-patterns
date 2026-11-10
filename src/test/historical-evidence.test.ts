import { describe, expect, it } from "vitest";
import { DAY_MS, HOUR_MS, type Candle } from "@/lib/xau/data";
import { alignDailySession } from "@/lib/analysis/sessions";
import { deduplicateJointMatches, rankJointMatches, type JointCandidate } from "@/lib/analysis/joint";
import { measureOutcomes, summariseOutcomes } from "@/lib/analysis/outcomes";
import { buildProjection } from "@/lib/analysis/projection";

const date = Date.UTC(2026, 0, 2);

function hourlySession(startHourUtc: number): Candle[] {
  const start = date - (24 - startHourUtc) * HOUR_MS;
  return Array.from({ length: 24 }, (_, i) => ({
    t: start + i * HOUR_MS,
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
  }));
}

function dailyFor(hourly: Candle[]): Candle {
  return { t: date, open: hourly[0]!.open, high: Math.max(...hourly.map((c) => c.high)), low: Math.min(...hourly.map((c) => c.low)), close: hourly.at(-1)!.close };
}

describe("provider session alignment", () => {
  it("matches the exact 20:00 UTC session rather than assuming a calendar day", () => {
    const hourly = hourlySession(20);
    const aligned = alignDailySession(dailyFor(hourly), hourly);
    expect(aligned?.startHourUtc).toBe(20);
    expect(aligned?.startMs).toBe(date - 4 * HOUR_MS);
    expect(aligned?.candles).toHaveLength(24);
    expect(aligned?.difference).toBe(0);
  });

  it("accepts a measured 21:00 seasonal offset and rejects unverified OHLC", () => {
    const hourly = hourlySession(21);
    expect(alignDailySession(dailyFor(hourly), hourly)?.startHourUtc).toBe(21);
    expect(alignDailySession({ ...dailyFor(hourly), close: 999 }, hourly)).toBeNull();
  });
});

describe("joint matching", () => {
  const context = (offset: number): Candle[] => hourlySession(20).map((c) => ({ ...c, open: c.open + offset, high: c.high + offset, low: c.low + offset, close: c.close + offset }));
  const match = (patternEndIdx: number, distance: number) => ({ patternStartIdx: patternEndIdx - 9, patternEndIdx, patternStartMs: 0, patternEndMs: patternEndIdx, distance });

  it("uses hourly formation context in ranking and removes overlapping windows", () => {
    const candidates: JointCandidate[] = [
      { match: match(30, 0), candles: context(3), atr: 10 },
      { match: match(31, 0), candles: context(0), atr: 10 },
      { match: match(60, 0), candles: context(1), atr: 10 },
    ];
    const ranked = rankJointMatches({ candles: context(0), atr: 10 }, candidates, 10, 10);
    expect(ranked[0]?.patternEndIdx).toBe(31);
    expect(deduplicateJointMatches(ranked, 10).map((m) => m.patternEndIdx)).toEqual([31, 60]);
  });
});

describe("measured outcomes", () => {
  const candles: Candle[] = Array.from({ length: 30 }, (_, i) => ({ t: i * DAY_MS, open: 100, high: 101, low: 99, close: 100 }));
  candles[21] = { ...candles[21]!, high: 103, low: 98, close: 102 };

  it("measures the next session from real OHLC and selects closest examples", () => {
    const matches = [
      { patternStartIdx: 10, patternEndIdx: 20, patternStartMs: 0, patternEndMs: 0, distance: 2 },
      { patternStartIdx: 10, patternEndIdx: 20, patternStartMs: 0, patternEndMs: 0, distance: 1 },
    ];
    const outcomes = measureOutcomes(matches, candles, { horizonDays: 1, contextDays: 10, windowLen: 10 });
    expect(outcomes[0]).toMatchObject({ entryPrice: 100, mfe: 3, mae: -2, netMovePct: 2, direction: "bull" });
    const summary = summariseOutcomes(outcomes, 1, 1);
    expect(summary.totalMatches).toBe(2);
    expect(summary.bull.topMatches[0]?.distance).toBe(1);
  });
});

describe("hourly historical range", () => {
  it("normalizes to formation close and never interpolates missing bars", () => {
    const outcome = measureOutcomes([{ patternStartIdx: 0, patternEndIdx: 0, patternStartMs: 0, patternEndMs: 0, distance: 1 }], [
      { t: 0, open: 100, high: 100, low: 100, close: 100 },
      { t: DAY_MS, open: 100, high: 102, low: 98, close: 101 },
    ], { horizonDays: 1, contextDays: 1, windowLen: 1 })[0]!;
    const projection = buildProjection([{ ...outcome, outcomeStartMs: DAY_MS, hourlyCandles: [
      { t: DAY_MS, open: 100, high: 102, low: 99, close: 101 },
      { t: DAY_MS + 2 * HOUR_MS, open: 101, high: 104, low: 100, close: 103 },
    ] }], "bull");
    expect(projection.slots.map((slot) => slot.hourOffset)).toEqual([0, 2]);
    expect(projection.slots[0]).toMatchObject({ avgHigh: 2, avgLow: -1, avgClose: 1, observations: 1 });
  });
});
