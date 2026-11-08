import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowRight, ChartNoAxesCombined, ImagePlus, LoaderCircle, LockKeyhole, ScanLine, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChartReportView } from "@/components/chart-report";
import { interpretChart } from "@/lib/xau/interpretation.functions";
import { imageInputSchema, type ChartReport, type ImageInput } from "@/lib/xau/interpretation";
import { analyseChart, type AnalyseResult } from "@/lib/analysis/api";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "XAUUSD Chart Research — Screenshot analysis" },
    { name: "description", content: "Interpret gold Daily and hourly chart screenshots with visible evidence, market structure and explicit uncertainty." },
    { property: "og:title", content: "XAUUSD Chart Research" },
    { property: "og:description", content: "Screenshot-first gold chart interpretation. Historical scenarios require verified market data." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Index,
});

type UploadedImage = { name: string; dataUrl: string };
const readImage = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image could not be read."));
  reader.onerror = () => reject(new Error("Image could not be read."));
  reader.readAsDataURL(file);
});

function Index() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [report, setReport] = useState<ChartReport | null>(null);
  const [analysis, setAnalysis] = useState<AnalyseResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [timeframe, setTimeframe] = useState<ImageInput["timeframe"]>("auto");
  const [cutoff, setCutoff] = useState("");
  const [feed, setFeed] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const analyze = useServerFn(interpretChart);
  const analyse = useServerFn(analyseChart);

  async function upload(files: File[]) {
    if (busy || reading) return;
    setError(""); setReading(true);
    try {
      if (!files.length) return;
      if (files.length + images.length > 2) throw new Error("Keep up to two charts: one Daily and one hourly. Remove a chart to replace it.");
      const next: UploadedImage[] = [];
      for (const file of files) {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG or WebP screenshot.");
        if (file.size > 8 * 1024 * 1024) throw new Error("Each screenshot must be 8 MB or smaller.");
        const dataUrl = await readImage(file);
        imageInputSchema.parse({ images: [dataUrl], timeframe: "auto", cutoff: "", feed: "" });
        const img = new Image(); img.src = dataUrl;
        await img.decode().catch(() => { throw new Error("This image could not be opened. Choose a different screenshot."); });
        next.push({ name: file.name, dataUrl });
      }
      setImages((previous) => [...previous, ...next]); setReport(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Screenshot could not be loaded."); }
    finally { setReading(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  async function submit() {
    if (!images.length || busy || reading) return;
    setBusy(true); setReport(null); setAnalysis(null); setError("");
    try {
      const result = await analyze({ data: { images: images.map((image) => image.dataUrl), timeframe, cutoff, feed } });
      if (result.report) setReport(result.report); else setError(result.error);
      // Run historical analysis in parallel using the first image
      if (images[0]) {
        try {
          const hist = await analyse({ data: { imageDataUrl: images[0].dataUrl } });
          setAnalysis(hist);
        } catch {
          // Non-fatal — chart interpretation may still succeed
        }
      }
    } catch { setError("Analysis could not finish. Your screenshots are still here; please try again when the service is available."); }
    finally { setBusy(false); }
  }

  return <div className="min-h-screen">
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 md:px-8">
        <div className="flex items-center gap-3"><ChartNoAxesCombined className="size-6 text-primary" /><span className="font-semibold">GOLD / RESEARCH</span></div>
        <span className="font-mono text-xs text-muted-foreground">XAUUSD · SPOT GOLD</span>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><div className="mb-3 font-mono text-xs uppercase tracking-widest text-primary">Chart workspace</div><h1 className="text-3xl font-semibold">XAUUSD Chart Research</h1><p className="mt-3 text-sm text-muted-foreground">Daily structure. Hourly context. Evidence before conviction.</p></div>
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />SCREENSHOT INTERPRETATION</div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        <section className="min-w-0">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-mono text-xs uppercase tracking-widest">01 / Your charts</h2><span className="text-xs text-muted-foreground">{images.length} / 2 screenshots</span></div>
          <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label="Upload chart screenshots" className="sr-only" disabled={busy || reading} onChange={(e) => void upload(Array.from(e.target.files ?? []))} />
          {images.length === 0 ? <div className={`flex min-h-80 flex-col items-center justify-center rounded-md border border-dashed px-6 py-10 text-center transition-colors ${dragging ? "border-primary bg-accent" : "border-border bg-card"}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(Array.from(e.dataTransfer.files)); }}>
            <ImagePlus className="mb-5 size-10 text-primary" strokeWidth={1} />
            <h3 className="text-lg font-medium">Your gold chart, in focus</h3>
            <p className="mb-6 mt-2 text-sm text-muted-foreground">XAUUSD · Daily or 1-hour</p>
            <Button onClick={() => fileInput.current?.click()} disabled={reading}><Upload />{reading ? "Opening screenshot…" : "Choose screenshots"}</Button>
            <p className="mt-4 font-mono text-xs text-muted-foreground">PNG, JPEG, WEBP · UP TO 8 MB EACH</p>
          </div> : <div className="space-y-4">
            {images.map((image, i) => <figure key={image.dataUrl} className="overflow-hidden rounded-md border border-border bg-card">
              <img src={image.dataUrl} alt={`Uploaded trading chart: ${image.name}`} className="max-h-[520px] w-full object-contain" />
              <figcaption className="flex items-center justify-between gap-3 border-t border-border px-4 py-2"><span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{image.name}</span><Button variant="ghost" size="icon" title="Remove screenshot" aria-label={`Remove screenshot ${i + 1}`} disabled={busy || reading} onClick={() => { setImages((current) => current.filter((_, index) => index !== i)); setReport(null); setError(""); }}><Trash2 /></Button></figcaption>
            </figure>)}
            {images.length < 2 && <Button variant="outline" className="w-full" disabled={busy || reading} onClick={() => fileInput.current?.click()}><ImagePlus />Add Daily / hourly context</Button>}
          </div>}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">Timeframe<select aria-label="Timeframe" value={timeframe} disabled={busy} onChange={(e) => { const value = imageInputSchema.shape.timeframe.parse(e.target.value); setTimeframe(value); setReport(null); }} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"><option value="auto">Detect from screenshot</option><option value="Daily">Daily</option><option value="1-hour">1-hour</option><option value="Daily + 1-hour">Daily + 1-hour</option></select></label>
            <label className="text-xs text-muted-foreground">Final completed date · optional<input type="date" aria-label="Final completed date" value={cutoff} disabled={busy} onChange={(e) => { setCutoff(e.target.value); setReport(null); }} className="mt-2 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground" /></label>
            <label className="text-xs text-muted-foreground sm:col-span-2">Broker / price feed · optional<input aria-label="Broker or price feed" value={feed} maxLength={120} placeholder="As shown on your chart" disabled={busy} onChange={(e) => { setFeed(e.target.value); setReport(null); }} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" /></label>
          </div>
          <Button className="mt-5 h-11 w-full" disabled={!images.length || busy || reading} onClick={() => void submit()}>{busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <ScanLine />}{busy ? "Reading chart structure…" : "Analyse chart"}{!busy && <ArrowRight />}</Button>
          {error && <p role="alert" className="mt-4 break-words text-sm text-destructive">{error}</p>}
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><LockKeyhole className="size-3.5 shrink-0" />Screenshots are sent for AI interpretation, not saved to report history.</p>
        </section>
        <section className="min-w-0 lg:border-l lg:border-border lg:pl-8">
          <h2 className="mb-5 font-mono text-xs uppercase tracking-widest">02 / Market reading</h2>
          {report ? <ChartReportView report={report} /> : <div className="flex min-h-64 flex-col items-center justify-center border-y border-border px-5 py-10 text-center">
            {busy ? <LoaderCircle className="mb-5 size-7 animate-spin text-primary motion-reduce:animate-none" /> : <ScanLine className="mb-5 size-7 text-muted-foreground" strokeWidth={1} />}
            <h3 className="font-medium">{busy ? "Examining the visible evidence" : "Awaiting your chart"}</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{busy ? "Structure, momentum, formations and visible zones." : "No market interpretation yet."}</p>
          </div>}
          <section className="mt-7 border-t border-border pt-5"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-mono text-xs uppercase tracking-widest">Historical evidence</h3><span className={`text-xs ${analysis ? "text-primary" : "text-muted-foreground"}`}>{analysis ? "Connected" : "Not connected"}</span></div>{analysis ? (<div className="space-y-4"><p className="text-sm leading-relaxed text-muted-foreground">{analysis.summary.totalMatches > 0 ? `${analysis.summary.totalMatches} historical matches found across ${analysis.dailyCandles.length} daily candles.` : "No close historical matches found for this pattern."}</p>{analysis.summary.totalMatches > 0 && (<div className="grid grid-cols-3 gap-2">{(["bull","bear","sideways"] as const).map((dir) => { const s = analysis.summary[dir]; return s.count > 0 ? (<div key={dir} className="rounded-md border border-border bg-card p-3"><div className="mb-1 font-mono text-xs uppercase text-muted-foreground">{dir}</div><div className="text-lg font-semibold">{s.pct.toFixed(0)}%</div><div className="text-xs text-muted-foreground">{s.count} matches</div></div>) : null; })}</div>)}{analysis.scenarios.map((sc) => (<div key={sc.direction} className="rounded-md border border-border bg-card p-3"><div className="mb-1 font-semibold text-sm">{sc.title}</div><p className="text-xs leading-relaxed text-muted-foreground">{sc.description}</p></div>))}{analysis.warnings.length > 0 && (<div className="space-y-1">{analysis.warnings.map((w, i) => (<p key={i} className="text-xs text-muted-foreground">{w}</p>))}</div>)}</div>) : (<p className="text-sm leading-relaxed text-muted-foreground">Verified Daily and hourly prices are not available yet. Historical matches, next-session ranges, frequencies and numerical trade levels are withheld.</p>)}</section>
        </section>
      </div>
      <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t border-border pt-5 font-mono text-xs text-muted-foreground"><span>CHART OBSERVATIONS ≠ VERIFIED MARKET DATA</span><span>Research only · Not financial advice</span></footer>
    </main>
  </div>;
}
