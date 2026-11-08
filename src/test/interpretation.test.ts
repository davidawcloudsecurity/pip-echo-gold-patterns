import { describe, expect, it } from "vitest";
import { chartReportSchema, imageInputSchema } from "@/lib/xau/interpretation";

const png = `data:image/png;base64,${btoa("\x89PNG\r\n\x1a\n" + "12345678")}`;
const context = { timeframe: "auto", cutoff: "", feed: "" };

describe("Screenshot validation", () => {
  it("rejects a CSV instead of a screenshot", () => {
    expect(imageInputSchema.safeParse({ ...context, images: ["data:text/csv;base64,dGVzdA=="] }).success).toBe(false);
  });
  it("rejects unsupported instruments' input timeframe settings", () => {
    expect(imageInputSchema.safeParse({ ...context, timeframe: "5-minute", images: [png] }).success).toBe(false);
  });
  it("accepts Daily and hourly context together", () => {
    expect(imageInputSchema.parse({ ...context, timeframe: "Daily + 1-hour", images: [png, png] }).timeframe).toBe("Daily + 1-hour");
  });
  it("rejects bytes that do not match the declared image format", () => {
    expect(imageInputSchema.safeParse({ ...context, images: ["data:image/png;base64,dGhpcyBpcyBub3QgYW4gaW1hZ2U="] }).success).toBe(false);
  });
  it("rejects malformed analysis rather than displaying unvalidated output", () => {
    expect(chartReportSchema.safeParse({ status: "readable", probability: 80 }).success).toBe(false);
  });
});