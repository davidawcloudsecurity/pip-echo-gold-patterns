import type { Candle } from "../xau/data";
import type { RawMatch } from "./dtw";

export interface JointMatch extends RawMatch {
  dailyDistance: number;
  hourlyDistance: number;
}

export interface HourlyContext {
  candles: Candle[];
  atr: number | null;
}

export interface JointCandidate extends HourlyContext {
  match: RawMatch;
}

function contextVector({ candles, atr }: HourlyContext): number[] | null {
  if (candles.length !== 24 || !atr || atr <= 0) return null;
  const base = candles[0]!.open;
  if (base <= 0) return null;

  const vector: number[] = [];
  for (const candle of candles) {
    vector.push(
      (candle.open - base) / atr,
      (candle.high - base) / atr,
      (candle.low - base) / atr,
      (candle.close - base) / atr,
    );
  }
  return vector;
}

function rmsDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(sum / a.length);
}

/** Rank with pre-formation Daily and hourly evidence only. */
export function rankJointMatches(
  query: HourlyContext,
  candidates: JointCandidate[],
  windowLen: number,
  topN: number,
): JointMatch[] {
  const queryVector = contextVector(query);
  if (!queryVector) return [];

  const ranked: JointMatch[] = [];
  for (const candidate of candidates) {
    const candidateVector = contextVector(candidate);
    if (!candidateVector) continue;
    const dailyDistance = candidate.match.distance / Math.max(1, windowLen);
    const hourlyDistance = rmsDistance(queryVector, candidateVector);
    ranked.push({
      ...candidate.match,
      dailyDistance,
      hourlyDistance,
      distance: dailyDistance + hourlyDistance,
    });
  }

  return ranked.sort((a, b) => a.distance - b.distance).slice(0, topN);
}

/** Keep the closest formation from each overlapping group. */
export function deduplicateJointMatches(matches: JointMatch[], windowLen: number): JointMatch[] {
  const kept: JointMatch[] = [];
  for (const match of matches) {
    if (kept.some((other) => Math.abs(other.patternEndIdx - match.patternEndIdx) < windowLen)) continue;
    kept.push(match);
  }
  return kept;
}
