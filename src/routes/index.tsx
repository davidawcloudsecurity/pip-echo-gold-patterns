import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { parseOhlcCsv, dropIncomplete, DAY_MS, HOUR_MS, type LoadReport } from "@/lib/xau/data";
import { computeFeatures } from "@/lib/xau/features";
import { DEFAULT_PATTERN, checkCandle, findOccurrences, type PatternConfig } from "@/lib/xau/pattern";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "XAUUSD Pattern Matcher — Historical candlestick research" },
      { name: "description", content: "Find historical XAUUSD three-candle daily patterns and study the following day." },
      { property: "og:title", content: "XAUUSD Pattern Matcher" },
      { property: "og:description", content: "Historical candlestick pattern research for gold. Not a trading system." },
    ],
  }),
  component: Index,
});

const fmtDate = (t: number) => new Date(t).toISOString().slice(0, 10);

function Upload({ label, onLoad, report }: { label: string; onLoad: (text: string) => void; report: LoadReport | null }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <input
        type="file"
        accept=".csv,text/csv"
        className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
        onChange={async (e) => { const f = e.target.files?.[0]; if (f) onLoad(await f.text()); }}
      />
      {report && (
        <div className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
          <div><span className="text-foreground">{report.candles.length}</span> valid candles of {report.totalRows} rows</div>
          {report.candles.length > 0 && <div>{fmtDate(report.candles[0].t)} → {fmtDate(report.candles[report.candles.length - 1].t)} (UTC)</div>}
          <div>Invalid rows: <span className={report.invalidRows.length ? "text-bear" : ""}>{report.invalidRows.length}</span> · Duplicates: {report.duplicates} · Gaps: {report.gaps.length}</div>
          {report.invalidRows.slice(0, 3).map((r) => <div key={r.line} className="text-bear">line {r.line}: {r.reason}</div>)}
        </div>
      )}
    </div>
  );
}

function Index() {
  const [daily, setDaily] = useState<LoadReport | null>(null);
  const [hourly, setHourly] = useState<LoadReport | null>(null);
  const [error, setError] = useState("");
  const [cfg, setCfg] = useState<PatternConfig>(DEFAULT_PATTERN);

  const load = (step: number, set: (r: LoadReport) => void) => (text: string) => {
    try { setError(""); const r = parseOhlcCsv(text, step); set({ ...r, candles: dropIncomplete(r.candles, step) }); }
    catch (e) { setError((e as Error).message); }
  };

  const analysis = useMemo(() => {
    if (!daily || daily.candles.length < 20) return null;
    const f = computeFeatures(daily.candles);
    const last3 = f.slice(-3);
    return { f, last3, occ: findOccurrences(f, cfg) };
  }, [daily, cfg]);

  const setNum = (i: number, key: keyof PatternConfig[number], v: string) => {
    const next = cfg.map((r) => ({ ...r })) as PatternConfig;
    (next[i] as Record<string, unknown>)[key] = v === "" ? undefined : Number(v);
    setCfg(next);
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 border-b border-border pb-6">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-primary">XAU / USD · Research</div>
        <h1 className="mt-2 text-3xl font-semibold">Historical Candlestick Pattern Matcher</h1>
        <p className="mt-2 text-sm text-muted-foreground">Stage 1–2: data loading & pattern detection. Historical research only — no buy/sell signals.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Upload label="Daily CSV" onLoad={load(DAY_MS, setDaily)} report={daily} />
        <Upload label="1-Hour CSV" onLoad={load(HOUR_MS, setHourly)} report={hourly} />
      </section>
      <p className="mt-2 font-mono text-xs text-muted-foreground">Columns: timestamp, open, high, low, close. Timestamps without an offset are read as UTC. A still-forming last candle is dropped.</p>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <section className="mt-10">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">Pattern rules (editable)</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {cfg.map((r, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-4 text-sm">
              <div className={`mb-3 font-mono font-semibold ${r.direction === "bull" ? "text-bull" : "text-bear"}`}>Candle {i + 1} · {r.direction === "bull" ? "Bullish" : "Bearish"}</div>
              {(["minBodyRatio", "maxBodyRatio", "minBodyAtr", "maxBodyAtr"] as const).map((k) => (
                <label key={k} className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{{ minBodyRatio: "Body/range ≥", maxBodyRatio: "Body/range ≤", minBodyAtr: "Body ≥ ATR×", maxBodyAtr: "Body ≤ ATR×" }[k]}</span>
                  <input type="number" step="0.05" value={r[k] ?? ""} placeholder="—" onChange={(e) => setNum(i, k, e.target.value)}
                    className="w-20 rounded border border-input bg-background px-2 py-1 text-right font-mono" />
                </label>
              ))}
            </div>
          ))}
        </div>
      </section>

      {!daily && <p className="mt-10 text-center text-muted-foreground">Upload your Daily CSV to begin.</p>}
      {daily && !analysis && <p className="mt-10 text-center text-muted-foreground">Need at least 20 valid daily candles.</p>}

      {analysis && (
        <>
          <section className="mt-10">
            <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">Latest three completed daily candles</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {analysis.last3.map((f, i) => {
                const checks = checkCandle(f, cfg[i]);
                return (
                  <div key={f.t} className="rounded-md border border-border bg-card p-4 font-mono text-xs">
                    <div className="mb-2 flex justify-between"><span className="text-foreground">{fmtDate(f.t)}</span><span className={f.direction === "bull" ? "text-bull" : "text-bear"}>{f.direction}</span></div>
                    <div className="grid grid-cols-2 gap-y-1 text-muted-foreground">
                      <span>O/H/L/C</span><span className="text-right text-foreground">{f.open.toFixed(2)} / {f.high.toFixed(2)} / {f.low.toFixed(2)} / {f.close.toFixed(2)}</span>
                      <span>Body / Range</span><span className="text-right">{f.body.toFixed(2)} / {f.range.toFixed(2)}</span>
                      <span>Upper / Lower wick</span><span className="text-right">{f.upperWickRatio.toFixed(2)} / {f.lowerWickRatio.toFixed(2)}</span>
                      <span>Prior ATR(14)</span><span className="text-right">{f.atr?.toFixed(2) ?? "n/a"}</span>
                      <span>Range / ATR</span><span className="text-right">{f.rangeAtr?.toFixed(2) ?? "n/a"}</span>
                    </div>
                    <div className="mt-3 space-y-1 border-t border-border pt-2">
                      {checks.map((c) => <div key={c.label} className={c.pass ? "text-bull" : "text-bear"}>{c.pass ? "✓" : "✗"} {c.label} <span className="text-muted-foreground">({c.value})</span></div>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-10 rounded-md border border-border bg-card p-6">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Historical occurrences (rule-based, non-overlapping, with completed 4th candle)</div>
            <div className="mt-2 text-4xl font-semibold text-primary">{analysis.occ.length}</div>
            <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs">
              {analysis.occ.slice(-30).map((i) => <span key={i} className="rounded bg-secondary px-2 py-1">{fmtDate(analysis.f[i - 2].t)} → {fmtDate(analysis.f[i].t)}</span>)}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Similarity ranking, charts and 4th-day outcomes come in the next stage.</p>
          </section>
        </>
      )}
    </main>
  );
}
