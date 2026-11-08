/**
 * Dynamic Time Warping (DTW) similarity search.
 *
 * Compares a query window of candle features against every possible window
 * in the historical data and returns the most similar matches by DTW
 * distance. Uses a Sakoe-Chiba band to constrain the warping path for
 * efficiency.
 */

import type { CandleFeatures } from "../xau/features";

export interface RawMatch {
  patternStartMs: number;
  patternEndMs: number;
  patternStartIdx: number;
  patternEndIdx: number;
  distance: number;
}

/** Extract a scale-invariant feature vector from candle features. */
function featureVector(f: CandleFeatures): number[] {
  return [
    f.bodyRatio,
    f.upperWickRatio,
    f.lowerWickRatio,
    f.rangeAtr ?? 0,
    f.bodyAtr ?? 0,
    f.direction === "bull" ? 1 : f.direction === "bear" ? -1 : 0,
  ];
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(sum);
}

/** DTW distance with Sakoe-Chiba band constraint. */
function dtwDistance(query: number[][], target: number[][], band: number): number {
  const n = query.length;
  const m = target.length;
  const w = Math.max(band, Math.abs(n - m));

  // Rolling rows for memory efficiency
  let prev = new Array(m + 1).fill(Infinity);
  let curr = new Array(m + 1).fill(Infinity);
  prev[0] = 0;

  for (let i = 1; i <= n; i++) {
    curr[0] = Infinity;
    const jStart = Math.max(1, i - w);
    const jEnd = Math.min(m, i + w);
    for (let j = jStart; j <= jEnd; j++) {
      const cost = euclidean(query[i - 1]!, target[j - 1]!);
      curr[j] = cost + Math.min(prev[j]!, curr[j - 1]!, prev[j - 1]!);
    }
    // Swap rows
    [prev, curr] = [curr, prev];
    // Clear curr for next iteration
    curr.fill(Infinity);
  }

  return prev[m]!;
}

/**
 * Find the top-N most similar historical windows to the query.
 * Only windows with at least `minOutcomeCandles` following candles are
 * considered (so outcomes can be measured).
 */
export function findTopMatches(
  query: CandleFeatures[],
  all: CandleFeatures[],
  options: { topN: number; band: number; minOutcomeCandles: number },
): RawMatch[] {
  const { topN, band, minOutcomeCandles } = options;
  const queryVecs = query.map(featureVector);
  const allVecs = all.map(featureVector);
  const windowLen = query.length;
  const matches: RawMatch[] = [];

  // Exclude the most recent window (that's the query itself)
  const lastValidStart = all.length - windowLen - minOutcomeCandles;

  for (let start = 0; start <= lastValidStart; start++) {
    const end = start + windowLen - 1;
    const targetVecs = allVecs.slice(start, start + windowLen);
    const distance = dtwDistance(queryVecs, targetVecs, band);
    matches.push({
      patternStartIdx: start,
      patternEndIdx: end,
      patternStartMs: all[start]!.t,
      patternEndMs: all[end]!.t,
      distance,
    });
  }

  matches.sort((a, b) => a.distance - b.distance);
  return matches.slice(0, topN);
}
