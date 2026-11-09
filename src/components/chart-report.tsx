import { AlertTriangle, ChevronDown, Eye, ScanLine, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import type { ChartReport } from "@/lib/xau/interpretation";

function TextSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-t border-border py-5"><h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h3><div className="space-y-2 text-sm leading-relaxed">{children}</div></section>;
}
function Items({ items }: { items: string[] }) {
  return items.length ? <ul className="space-y-2">{items.map((item, i) => <li key={i} className="flex gap-3"><span className="mt-2 size-1 shrink-0 rounded-full bg-primary" /><span>{item}</span></li>)}</ul> : <p className="text-muted-foreground">Not identifiable from the screenshot.</p>;
}
export function ChartReportView({ report }: { report: ChartReport }) {
  return <div className="min-w-0 break-words" aria-live="polite">
    <div className="mb-3 flex items-center gap-2 font-mono text-xs text-primary"><ScanLine className="size-4 shrink-0" />{report.timeframe}</div>
    <h2 className="text-xl font-semibold">{report.status === "readable" ? "Market at a glance" : report.status === "unsupported" ? "Unsupported chart" : "More chart detail needed"}</h2>
    <p className="my-4 text-sm leading-relaxed text-muted-foreground">{report.summary}</p>
    {report.status === "readable" && <>
      <div className="grid grid-cols-2 gap-4 border-y border-border py-4">
        <div><div className="mb-2 flex items-center gap-2 text-sm font-medium"><TrendingUp className="size-4 text-bull" />Buy area</div><p className="font-mono text-xs text-muted-foreground">Not verified</p></div>
        <div><div className="mb-2 flex items-center gap-2 text-sm font-medium"><TrendingDown className="size-4 text-bear" />Sell area</div><p className="font-mono text-xs text-muted-foreground">Not verified</p></div>
        <p className="col-span-2 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="size-4 shrink-0" />Entries, stops and targets withheld until prices and historical evidence are verified.</p>
      </div>
      <TextSection title="Zones to watch"><div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><Eye className="size-3.5" />Screenshot only · not trade signals</div><div className="space-y-3">{report.zones.length ? report.zones.map((zone, i) => <div key={i} className="flex gap-3 border-l-2 border-primary pl-3"><span className="shrink-0 font-mono text-xs text-primary">{String(i + 1).padStart(2, "0")}</span><p>{zone}</p></div>) : <p className="text-muted-foreground">No readable zones.</p>}</div></TextSection>
    </>}
    <details className="group border-t border-border py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">Structure & observations<ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
      <TextSection title="Visible observations"><Items items={report.observations} /></TextSection>
      {report.status === "readable" && <><TextSection title="Market structure"><p>{report.structure}</p></TextSection><TextSection title="Momentum & formations"><p>{report.momentum}</p><Items items={report.formations} /></TextSection></>}
    </details>
    <details className="group border-t border-border py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium"><span className="flex items-center gap-2"><AlertTriangle className="size-4 text-primary" />Evidence & uncertainty <span className="font-mono text-xs text-muted-foreground">({report.uncertainty.length})</span></span><ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
      <TextSection title="Instrument"><p>{report.instrument}</p></TextSection>
      <TextSection title="Date & volume evidence"><p>{report.dateEvidence}</p><p className="text-muted-foreground">{report.volume}</p></TextSection>
      <TextSection title="Uncertainty"><Items items={report.uncertainty} /></TextSection>
    </details>
  </div>;
}