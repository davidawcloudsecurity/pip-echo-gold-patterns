import { z } from "zod";

export const chartReportSchema = z.object({
  status: z.enum(["readable", "unclear", "unsupported"]),
  instrument: z.string().max(120),
  timeframe: z.enum(["Daily", "1-hour", "Daily + 1-hour", "unknown", "unsupported"]),
  summary: z.string().max(1600),
  observations: z.array(z.string().max(1000)).max(10),
  structure: z.string().max(1800),
  momentum: z.string().max(1800),
  formations: z.array(z.string().max(1000)).max(8),
  zones: z.array(z.string().max(1000)).max(8),
  uncertainty: z.array(z.string().max(1000)).max(10),
  volume: z.string().max(1200),
  dateEvidence: z.string().max(1200),
});
export type ChartReport = z.infer<typeof chartReportSchema>;

const stringField = { type: "string" };
const listField = { type: "array", items: stringField };
export const chartReportJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["readable", "unclear", "unsupported"] },
    instrument: stringField,
    timeframe: { type: "string", enum: ["Daily", "1-hour", "Daily + 1-hour", "unknown", "unsupported"] },
    summary: stringField, observations: listField, structure: stringField,
    momentum: stringField, formations: listField, zones: listField,
    uncertainty: listField, volume: stringField, dateEvidence: stringField,
  },
  required: ["status", "instrument", "timeframe", "summary", "observations", "structure", "momentum", "formations", "zones", "uncertainty", "volume", "dateEvidence"],
};

export const imageInputSchema = z.object({
  images: z.array(z.string().max(11_200_000).refine(validImageDataUrl, "Use a valid PNG, JPEG or WebP screenshot, up to 8 MB.")).min(1).max(2),
  timeframe: z.enum(["auto", "Daily", "1-hour", "Daily + 1-hour"]),
  cutoff: z.string().max(10).refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a date in YYYY-MM-DD format."),
  feed: z.string().max(120),
});
export type ImageInput = z.infer<typeof imageInputSchema>;

function validImageDataUrl(value: string): boolean {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const mime = match[1];
  const body = match[2];
  if (!body || body.length % 4 !== 0) return false;
  try {
    const bytes = atob(body);
    if (bytes.length > 8 * 1024 * 1024 || bytes.length < 12) return false;
    if (mime === "png") return bytes.slice(0, 8) === "\x89PNG\r\n\x1a\n";
    if (mime === "jpeg") return bytes.startsWith("\xff\xd8\xff");
    return bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP";
  } catch { return false; }
}