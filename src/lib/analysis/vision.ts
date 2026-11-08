/**
 * Vision LLM chart analysis types and prompt construction.
 *
 * The actual API call lives in the server function (api.ts) so the API key
 * stays server-side.  This file defines the shared types and the prompt.
 */

/** Structured market interpretation returned by the vision LLM. */
export interface ChartInterpretation {
  /** Overall trend direction seen in the chart. */
  trend: "bullish" | "bearish" | "sideways" | "unclear";
  /** Short description of the current market structure. */
  marketStructure: string;
  /** Named candlestick patterns visible (e.g. "engulfing", "doji", "inside bar"). */
  candlestickPatterns: string[];
  /** Approximate number of clearly visible candles in the screenshot. */
  visibleCandleCount: number;
  /**
   * Approximate lookback in candles that captures the context the LLM used
   * (e.g. 30 means "the last ~30 daily candles are relevant").
   */
  lookbackCandles: number;
  /** Key support levels visible in the chart (in price units, if readable). */
  supportLevels: number[];
  /** Key resistance levels visible in the chart. */
  resistanceLevels: number[];
  /** Whether price appears near a significant supply zone. */
  nearSupplyZone: boolean;
  /** Whether price appears near a significant demand zone. */
  nearDemandZone: boolean;
  /** Whether a consolidation/breakout pattern is visible. */
  consolidationBreakout: boolean;
  /**
   * Free-text narrative: what the LLM sees, what it thinks the key decision
   * point is, and what it would watch for next.
   * Must be 3–6 sentences.  Written like a technical analyst.
   */
  narrative: string;
  /** Instrument detected from the chart label/title (e.g. "XAUUSD"). */
  detectedInstrument: string | null;
  /** Timeframe detected (e.g. "1D", "4H"). */
  detectedTimeframe: string | null;
  /** Whether the LLM was confident it could read the chart at all. */
  readable: boolean;
  /** Short reason if not readable. */
  unreadableReason?: string | undefined;
}

export const CHART_ANALYSIS_PROMPT = `You are a senior technical market analyst specialising in Gold (XAUUSD) price action.

The user has uploaded a trading chart screenshot.  Analyse it and respond ONLY with a valid JSON object matching the TypeScript interface below.  Do not include any prose outside the JSON.

\`\`\`typescript
interface ChartInterpretation {
  trend: "bullish" | "bearish" | "sideways" | "unclear";
  marketStructure: string;           // 1–2 sentences
  candlestickPatterns: string[];     // array of named patterns visible
  visibleCandleCount: number;        // approx number of candles in the screenshot
  lookbackCandles: number;           // how many candles of context are relevant (your estimate)
  supportLevels: number[];           // price levels (empty array if none readable)
  resistanceLevels: number[];
  nearSupplyZone: boolean;
  nearDemandZone: boolean;
  consolidationBreakout: boolean;
  narrative: string;                 // 3–6 sentences, analyst voice
  detectedInstrument: string | null;
  detectedTimeframe: string | null;
  readable: boolean;
  unreadableReason?: string;
}
\`\`\`

Rules:
- Base every field on what you can actually see in the image.
- Do not fabricate price levels you cannot read — return an empty array instead.
- Do not assume a bullish formation must continue bullish.  Resistance matters.
- The narrative must acknowledge uncertainty where it exists.
- If the image is too blurry, too small, or is not a trading chart, set readable=false.
- For lookbackCandles: even if only 2–3 candles are visible, set this to the minimum
  context window needed to meaningfully search for similar patterns historically.
  For a 2-candle momentum pattern, use at least 10. For a breakout from consolidation,
  use at least 20. Never return less than 5.
- visibleCandleCount is what you can count in the image; lookbackCandles is your
  recommendation for the search window — these can differ.`;

/** Parse the LLM response text into a ChartInterpretation. */
export function parseInterpretation(raw: string): ChartInterpretation {
  // Strip markdown code fences if the model wrapped the JSON
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as ChartInterpretation;
  // Validate required fields with safe defaults
  return {
    trend: parsed.trend ?? "unclear",
    marketStructure: parsed.marketStructure ?? "",
    candlestickPatterns: parsed.candlestickPatterns ?? [],
    visibleCandleCount: parsed.visibleCandleCount ?? 20,
    lookbackCandles: parsed.lookbackCandles ?? 20,
    supportLevels: parsed.supportLevels ?? [],
    resistanceLevels: parsed.resistanceLevels ?? [],
    nearSupplyZone: parsed.nearSupplyZone ?? false,
    nearDemandZone: parsed.nearDemandZone ?? false,
    consolidationBreakout: parsed.consolidationBreakout ?? false,
    narrative: parsed.narrative ?? "",
    detectedInstrument: parsed.detectedInstrument ?? null,
    detectedTimeframe: parsed.detectedTimeframe ?? null,
    readable: parsed.readable ?? true,
    ...(parsed.unreadableReason !== undefined && { unreadableReason: parsed.unreadableReason }),
  };
}
