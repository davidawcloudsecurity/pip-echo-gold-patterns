import { ChevronDown, Database, ShieldCheck } from "lucide-react";
import type { Candle } from "@/lib/xau/data";
import type { EnrichedMatch, HistoricalResult, VerifiedLevels } from "@/lib/analysis/api";
import type { OutcomeDirection } from "@/lib/analysis/outcomes";
import type { ScenarioProjection } from "@/lib/analysis/projection";
import type { Scenario } from "@/lib/analysis/scenarios";

const date = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(ms);
const price = (value: number) => value.toFixed(2);
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const directionLabel: Record<OutcomeDirection, string> = { bull: "Bullish", bear: "Bearish", sideways: "Sideways" };
const directionColor: Record<OutcomeDirection, string> = { bull: "text-bull", bear: "text-bear", sideways: "text-primary" };

function MatchChart({ match }: { match: EnrichedMatch }) {
  const candles = [...match.patternCandles, match.outcomeCandle];
  const width = 360;
  const height = 126;
  const pad = 8;
  const low = Math.min(...candles.map((c) => c.low));
  const high = Math.max(...candles.map((c) => c.high));
  const span = Math.max(0.000001, high - low);
  const step = (width - pad * 2) / candles.length;
  const y = (value: number) => pad + ((high - value) / span) * (height - pad * 2);

  return <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full" role="img" aria-label={`Actual Daily candles for ${date(match.patternEndMs)} and its measured next session`}>
    {candles.map((candle, i) => {
      const x = pad + i * step + step / 2;
      const rising = candle.close >= candle.open;
      const bodyTop = y(Math.max(candle.open, candle.close));
      const bodyHeight = Math.max(1, Math.abs(y(candle.open) - y(candle.close)));
      return <g key={candle.t} className={rising ? "text-bull" : "text-bear"} opacity={i === candles.length - 1 ? 1 : 0.72}>
        <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke="currentColor" strokeWidth="1" />
        <rect x={x - Math.max(1.5, step * 0.25)} y={bodyTop} width={Math.max(3, step * 0.5)} height={bodyHeight} fill="currentColor" />
        {i === candles.length - 1 && <rect x={x - step / 2 + 1} y={1} width={step - 2} height={height - 2} fill="none" stroke="currentColor" strokeDasharray="3 3" className="text-primary" />}
      </g>;
    })}
  </svg>;
}

function ScenarioPanel({ scenario, projection, context, entryPrice, levels }: {
  scenario: Scenario;
  projection: ScenarioProjection;
  context: Candle[];
  entryPrice: number;
  levels: VerifiedLevels;
}) {
  if (!projection.slots.length || !context.length) return null;
  const width = 680;
  const height = 220;
  const top = 14;
  const bottom = 34;
  const left = 12;
  const right = 12;
  const slots = projection.slots;
  const projected = slots.map((slot) => ({
    ...slot,
    highPrice: entryPrice * (1 + slot.avgHigh / 100),
    lowPrice: entryPrice * (1 + slot.avgLow / 100),
    closePrice: entryPrice * (1 + slot.avgClose / 100),
  }));
  const references = [...levels.support, ...levels.resistance, ...(levels.sma20 ? [levels.sma20] : [])];
  const low = Math.min(...context.map((c) => c.low), ...projected.map((s) => s.lowPrice), ...references);
  const high = Math.max(...context.map((c) => c.high), ...projected.map((s) => s.highPrice), ...references);
  const span = Math.max(0.000001, high - low);
  const totalSlots = 48;
  const step = (width - left - right) / totalSlots;
  const x = (hour: number) => left + hour * step + step / 2;
  const y = (value: number) => top + ((high - value) / span) * (height - top - bottom);
  const upper = projected.map((slot) => `${x(24 + slot.hourOffset)},${y(slot.highPrice)}`).join(" ");
  const lower = [...projected].reverse().map((slot) => `${x(24 + slot.hourOffset)},${y(slot.lowPrice)}`).join(" ");
  const meanPath = projected.map((slot) => `${x(24 + slot.hourOffset)},${y(slot.closePrice)}`).join(" ");

  return <div className="min-w-0">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${scenario.title}: actual prior 24 hours and normalized historical next-session range`}>
      <polygon points={`${upper} ${lower}`} fill="currentColor" fillOpacity="0.16" className={directionColor[scenario.direction]} />
      <polyline points={meanPath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" className={directionColor[scenario.direction]} />
      {context.map((candle, i) => {
        const cx = x(i);
        const rising = candle.close >= candle.open;
        const bodyTop = y(Math.max(candle.open, candle.close));
        const bodyHeight = Math.max(1, Math.abs(y(candle.open) - y(candle.close)));
        return <g key={candle.t} className={rising ? "text-bull" : "text-bear"}>
          <line x1={cx} x2={cx} y1={y(candle.high)} y2={y(candle.low)} stroke="currentColor" strokeWidth="1" />
          <rect x={cx - step * 0.27} y={bodyTop} width={Math.max(2, step * 0.54)} height={bodyHeight} fill="currentColor" />
        </g>;
      })}
      <line x1={x(24) - step / 2} x2={x(24) - step / 2} y1={top} y2={height - bottom} stroke="currentColor" strokeDasharray="5 4" className="text-muted-foreground" />
      {levels.support.map((level) => <g key={`s-${level}`} className="text-bull"><line x1={left} x2={width - right} y1={y(level)} y2={y(level)} stroke="currentColor" strokeOpacity="0.65" /><text x={left + 3} y={y(level) - 4} fill="currentColor" fontSize="9">20D low {price(level)}</text></g>)}
      {levels.resistance.map((level) => <g key={`r-${level}`} className="text-bear"><line x1={left} x2={width - right} y1={y(level)} y2={y(level)} stroke="currentColor" strokeOpacity="0.65" /><text x={left + 3} y={y(level) - 4} fill="currentColor" fontSize="9">20D high {price(level)}</text></g>)}
      {levels.sma20 !== null && <g className="text-primary"><line x1={left} x2={width - right} y1={y(levels.sma20)} y2={y(levels.sma20)} stroke="currentColor" strokeDasharray="2 3" /><text x={width - 112} y={y(levels.sma20) - 4} fill="currentColor" fontSize="9">20D mean {price(levels.sma20)}</text></g>}
      <text x={left} y={height - 12} fill="currentColor" className="text-muted-foreground" fontSize="10">ACTUAL 24 HOURLY BARS</text>
      <text x={x(24)} y={height - 12} fill="currentColor" className="text-muted-foreground" fontSize="10">HISTORICAL RANGE · NOT A FORECAST</text>
    </svg>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
      <span>{projection.matchCount} measured sessions</span><span>Mean hourly high {pct(projection.slots.reduce((s, v) => s + v.avgHigh, 0) / projection.slots.length)}</span><span>Normalised to {price(entryPrice)}</span>
    </div>
  </div>;
}

function MatchExamples({ matches }: { matches: EnrichedMatch[] }) {
  if (!matches.length) return <p className="text-xs text-muted-foreground">No examples with complete hourly evidence.</p>;
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{matches.map((match) => <article key={`${match.patternStartMs}-${match.direction}`} className="min-w-0 border border-border bg-background p-3">
    <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-medium">{date(match.patternEndMs)}</div><div className="mt-1 font-mono text-[10px] text-muted-foreground">FORMATION → NEXT SESSION</div></div><span className={`font-mono text-sm ${match.netMovePct >= 0 ? "text-bull" : "text-bear"}`}>{pct(match.netMovePct)}</span></div>
    <MatchChart match={match} />
    <div className="flex justify-between gap-2 font-mono text-[10px] text-muted-foreground"><span>MFE {pct(match.mfe)}</span><span>MAE {pct(match.mae)}</span><span>DIST {match.distance.toFixed(2)}</span></div>
  </article>)}</div>;
}

export function HistoricalEvidenceView({ analysis }: { analysis: HistoricalResult }) {
  if (analysis.status !== "ok") return <div className="border-y border-border py-6"><h3 className="font-medium">No verified scenarios yet</h3><p className="mt-2 text-sm text-muted-foreground">Real prices were checked, but there is not enough aligned Daily and hourly evidence.</p>{analysis.warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-muted-foreground">{warning}</p>)}</div>;

  return <div className="space-y-5">
    <div className="flex items-start gap-3 border-y border-border py-4"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-bull" /><div><h3 className="text-sm font-medium">Verified from real OHLC prices</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{analysis.feed.provider} · {analysis.feed.symbol} · {analysis.summary.totalMatches} measured matches · next-session direction threshold ±0.5%</p></div></div>
    <div className="grid grid-cols-3 gap-2">{(["bull", "bear", "sideways"] as const).map((direction) => {
      const summary = analysis.summary[direction];
      return <div key={direction} className="border border-border bg-card p-3"><div className={`font-mono text-[10px] uppercase ${directionColor[direction]}`}>{directionLabel[direction]}</div><div className="mt-1 text-xl font-semibold">{summary.pct.toFixed(0)}%</div><div className="text-[11px] text-muted-foreground">{summary.count} sessions</div><div className="mt-2 h-1 bg-muted"><div className={`h-full ${direction === "bull" ? "bg-bull" : direction === "bear" ? "bg-bear" : "bg-primary"}`} style={{ width: `${summary.pct}%` }} /></div></div>;
    })}</div>
    <p className="text-xs leading-relaxed text-muted-foreground">Formation {date(analysis.queryDateMs)} → next session {date(analysis.projectedDayStartMs)}. Frequencies are descriptive, not predictive probabilities.</p>
    {analysis.scenarios.map((scenario) => <section key={scenario.direction} className="min-w-0 border-t border-border pt-4">
      <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className={`font-medium ${directionColor[scenario.direction]}`}>{scenario.title}</h3><p className="mt-1 text-xs text-muted-foreground">{analysis.summary[scenario.direction].count} of {analysis.summary.totalMatches} measured next sessions</p></div><span className="font-mono text-lg">{scenario.probability.toFixed(0)}%</span></div>
      <ScenarioPanel scenario={scenario} projection={analysis.projections[scenario.direction]} context={analysis.hourlyCandles} entryPrice={analysis.currentEntryPrice} levels={analysis.verifiedLevels} />
      <details className="group mt-3 border-t border-border pt-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium">Closest actual Daily examples <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /></summary><div className="mt-3"><MatchExamples matches={analysis.topMatches.filter((match) => match.direction === scenario.direction)} /></div></details>
    </section>)}
    <details className="group border-t border-border pt-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2"><Database className="size-3.5" />Feed & method</span><ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /></summary><div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground"><p>{analysis.feed.sessionNote}</p><p>Daily coverage: {date(analysis.feed.dailyFirstMs)}–{date(analysis.feed.dailyLastMs)} ({analysis.feed.dailyCount} candles). Hourly evidence: {analysis.feed.hourlyCount} bars through {new Date(analysis.feed.hourlyLastMs).toISOString().slice(0, 16).replace("T", " ")} UTC.</p><p>Ranking uses completed pre-formation Daily DTW and normalized 24-hour OHLC context equally. Overlapping windows are deduplicated before outcomes are measured. Historical ranges use each match’s formation close and actual next-session hourly bars; missing bars are never filled.</p>{analysis.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></details>
  </div>;
}
