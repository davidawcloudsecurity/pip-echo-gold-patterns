import { AlertTriangle, Eye, ScanLine } from "lucide-react";
import type { ChartReport } from "@/lib/xau/interpretation";

function TextSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-t border-border py-5"><h3 className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h3><div className="space-y-2 text-sm leading-relaxed">{children}</div></section>;
}
function Items({ items }: { items: string[] }) {
  return items.length ? <ul className="space-y-2">{items.map((item, i) => <li key={i} className="flex gap-3"><span className="mt-2 size-1 shrink-0 rounded-full bg-primary" /><span>{item}</span></li>)}</ul> : <p className="text-muted-foreground">Not identifiable from the screenshot.</p>;
}
export function ChartReportView({ report }: { report: ChartReport }) {
  return <div className="min-w-0 break-words" aria-live="polite">
    <div className="mb-5 flex items-center gap-2 font-mono text-xs text-primary"><ScanLine className="size-4" />{report.instrument} · {report.timeframe}</div>
    <h2 className="text-xl font-semibold">{report.status === "readable" ? "Current market interpretation" : report.status === "unsupported" ? "Unsupported chart" : "More chart detail needed"}</h2>
    <p className="my-4 text-sm leading-relaxed text-muted-foreground">{report.summary}</p>
    <TextSection title="Visible observations"><Items items={report.observations} /></TextSection>
    {report.status === "readable" && <>
      <TextSection title="Market structure"><p>{report.structure}</p></TextSection>
      <TextSection title="Momentum & formations"><p>{report.momentum}</p><Items items={report.formations} /></TextSection>
      <TextSection title="Visible price zones"><div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><Eye className="size-3.5" />Screenshot observations · prices not feed-verified</div><Items items={report.zones} /></TextSection>
    </>}
    <TextSection title="Date & volume evidence"><p>{report.dateEvidence}</p><p className="text-muted-foreground">{report.volume}</p></TextSection>
    <TextSection title="Uncertainty"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" /><Items items={report.uncertainty} /></div></TextSection>
  </div>;
}