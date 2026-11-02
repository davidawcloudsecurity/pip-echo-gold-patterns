import type { CandleFeatures } from "./features";

export interface CandleRule {
  direction: "bull" | "bear";
  minBodyRatio?: number;
  maxBodyRatio?: number;
  minBodyAtr?: number;
  maxBodyAtr?: number;
}

export type PatternConfig = [CandleRule, CandleRule, CandleRule];

export const DEFAULT_PATTERN: PatternConfig = [
  { direction: "bear", minBodyRatio: 0.6, minBodyAtr: 1.0 },
  { direction: "bull", maxBodyRatio: 0.4, maxBodyAtr: 0.5 },
  { direction: "bull", minBodyRatio: 0.6, minBodyAtr: 1.0 },
];

export interface RuleCheck { label: string; pass: boolean; value: string }

export function checkCandle(f: CandleFeatures, r: CandleRule): RuleCheck[] {
  const checks: RuleCheck[] = [{ label: `Direction = ${r.direction}`, pass: f.direction === r.direction, value: f.direction }];
  const br = f.bodyRatio.toFixed(2);
  const ba = f.bodyAtr === null ? "n/a" : f.bodyAtr.toFixed(2);
  if (r.minBodyRatio !== undefined) checks.push({ label: `Body/range ≥ ${r.minBodyRatio}`, pass: f.bodyRatio >= r.minBodyRatio, value: br });
  if (r.maxBodyRatio !== undefined) checks.push({ label: `Body/range ≤ ${r.maxBodyRatio}`, pass: f.bodyRatio <= r.maxBodyRatio, value: br });
  if (r.minBodyAtr !== undefined) checks.push({ label: `Body ≥ ${r.minBodyAtr} ATR`, pass: f.bodyAtr !== null && f.bodyAtr >= r.minBodyAtr, value: ba });
  if (r.maxBodyAtr !== undefined) checks.push({ label: `Body ≤ ${r.maxBodyAtr} ATR`, pass: f.bodyAtr !== null && f.bodyAtr <= r.maxBodyAtr, value: ba });
  return checks;
}

export function matchesAt(f: CandleFeatures[], end: number, cfg: PatternConfig): boolean {
  if (end < 2) return false;
  return [0, 1, 2].every((k) => checkCandle(f[end - 2 + k]!, cfg[k]!).every((c) => c.pass));
}

/**
 * Indexes (of candle 3) where the pattern occurs. Only candles 1–3 are inspected.
 * `requireOutcome` keeps only occurrences with a completed 4th candle in the data
 * (the 4th candle is never inspected for matching — only its existence).
 * Overlapping occurrences (sharing candles) are skipped.
 */
export function findOccurrences(f: CandleFeatures[], cfg: PatternConfig, requireOutcome = true): number[] {
  const out: number[] = [];
  const last = requireOutcome ? f.length - 2 : f.length - 1;
  for (let i = 2; i <= last; i++) {
    if (out.length && i - out[out.length - 1]! < 3) continue;
    if (matchesAt(f, i, cfg)) out.push(i);
  }
  return out;
}
