/**
 * Scenario building.
 *
 * Translates the outcome summary and chart interpretation into
 * human-readable scenario descriptions with probability and key levels.
 */

import type { ChartInterpretation } from "./vision";
import type { OutcomeDirection, OutcomeSummary } from "./outcomes";

export interface Scenario {
  direction: OutcomeDirection;
  title: string;
  description: string;
  probability: number;
  keyLevels: { support: number[]; resistance: number[] };
}

export function buildScenarios(
  summary: OutcomeSummary,
  interpretation: ChartInterpretation,
): Scenario[] {
  const scenarios: Scenario[] = [];
  const total = summary.totalMatches || 1;

  for (const dir of ["bull", "bear", "sideways"] as OutcomeDirection[]) {
    const s = summary[dir];
    if (s.count === 0) continue;

    const title =
      dir === "bull" ? "Bullish continuation"
      : dir === "bear" ? "Bearish reversal"
      : "Sideways consolidation";

    const description =
      `${s.count} of ${total} historical matches (${s.pct.toFixed(0)}%) resulted in a ${dir} move over ${summary.horizonDays} days. ` +
      `Average favourable excursion: ${s.avgMfe.toFixed(2)}%, average adverse excursion: ${s.avgMae.toFixed(2)}%.`;

    scenarios.push({
      direction: dir,
      title,
      description,
      probability: s.pct,
      keyLevels: {
        support: interpretation.supportLevels,
        resistance: interpretation.resistanceLevels,
      },
    });
  }

  // Sort by probability descending
  return scenarios.sort((a, b) => b.probability - a.probability);
}
