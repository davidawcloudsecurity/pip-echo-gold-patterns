import { describe, it, expect } from "vitest";
import { parseOhlcCsv, DAY_MS, dropIncomplete, type Candle } from "@/lib/xau/data";
import { computeFeatures } from "@/lib/xau/features";
import { DEFAULT_PATTERN, findOccurrences, matchesAt } from "@/lib/xau/pattern";

const day = (i: number) => Date.UTC(2024, 0, 1) + i * DAY_MS;
// 20 flat-ish candles (range 10, body 4) to build ATR ≈ 10
const base = (n: number): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ t: day(i), open: 2000, high: 2005, low: 1995, close: 2004 }));

function withPattern(): Candle[] {
  const c = base(20);
  const n = c.length;
  c.push({ t: day(n), open: 2004, high: 2005, low: 1985, close: 1986 });     // big bear body 18
  c.push({ t: day(n + 1), open: 1986, high: 1990, low: 1982, close: 1987 }); // small bull body 1
  c.push({ t: day(n + 2), open: 1987, high: 2006, low: 1986, close: 2005 }); // big bull body 18
  c.push({ t: day(n + 3), open: 2005, high: 2010, low: 2000, close: 2008 }); // outcome
  return c;
}

describe("data loading", () => {
  it("interprets timestamps without offset as UTC and honours explicit offsets", () => {
    const r = parseOhlcCsv("timestamp,open,high,low,close\n2024-01-02,1,2,0.5,1.5\n2024-01-03T00:00:00+08:00,1,2,0.5,1.5");
    expect(r.candles[0]!.t).toBe(Date.UTC(2024, 0, 2));
    expect(r.candles[1]!.t).toBe(Date.UTC(2024, 0, 2, 16));
  });
  it("rejects rows where high is below close", () => {
    const r = parseOhlcCsv("timestamp,open,high,low,close\n2024-01-02,1,1.2,0.5,1.5");
    expect(r.candles).toHaveLength(0);
    expect(r.invalidRows[0]!.reason).toMatch(/inconsistent/);
  });
  it("flags gaps longer than a weekend in daily data", () => {
    const r = parseOhlcCsv("timestamp,open,high,low,close\n2024-01-01,1,2,0.5,1.5\n2024-01-10,1,2,0.5,1.5", DAY_MS);
    expect(r.gaps).toHaveLength(1);
  });
  it("drops a still-forming last candle", () => {
    const c = base(3);
    expect(dropIncomplete(c, DAY_MS, day(2) + 1000)).toHaveLength(2);
  });
});

describe("features", () => {
  it("computes body ratio and uses ATR from prior candles only", () => {
    const f = computeFeatures(withPattern());
    const big = f[20]!;
    expect(big.bodyRatio).toBeCloseTo(18 / 20);
    expect(big.atr).toBeCloseTo(10); // ATR before the big candle is unaffected by it
  });
});

describe("pattern detection", () => {
  it("detects the bear / small bull / big bull structure", () => {
    const f = computeFeatures(withPattern());
    expect(matchesAt(f, 22, DEFAULT_PATTERN)).toBe(true);
    expect(findOccurrences(f, DEFAULT_PATTERN)).toEqual([22]);
  });
  it("does not let the 4th candle change detection", () => {
    const c = withPattern();
    c[23] = { ...c[23]!, open: 2005, high: 2006, low: 1900, close: 1901 };
    expect(matchesAt(computeFeatures(c), 22, DEFAULT_PATTERN)).toBe(true);
  });
  it("excludes an occurrence with no completed 4th candle when outcome is required", () => {
    const f = computeFeatures(withPattern().slice(0, 23));
    expect(findOccurrences(f, DEFAULT_PATTERN, true)).toEqual([]);
    expect(findOccurrences(f, DEFAULT_PATTERN, false)).toEqual([22]);
  });
});
