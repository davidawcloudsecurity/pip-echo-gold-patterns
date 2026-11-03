# Screenshot-first XAUUSD chart analysis

## What changes

Replace the CSV-first, fixed three-candle workflow with a chart screenshot workspace for **XAUUSD Daily and 1-hour screenshots**. Keep the uploaded chart visible beside market interpretation, evidence-backed scenarios and real historical comparisons. The primary output is **two or three supported next-session hourly scenario panels**, combining Daily structure with hourly context.

Each panel shows the preceding 24 hours of actual hourly candles followed by a shaded historical scenario range for the next trading session, separated by a dashed session boundary. The range represents normalized historical hourly paths, not invented future candles or an exact-price forecast. The September 3 → September 4, 2026 example describes the intended workflow; August 11 and August 18 are illustrative candidate dates until verified against actual data.

The existing app has CSV validation, candle features, prior-candle ATR and fixed-pattern detection. It has no image interpretation, market-data connection, historical similarity search, chart rendering or scenario statistics. Its nine existing tests pass.

## Reuse and replace

- **Reuse:** validated candle types, OHLC consistency checks, prior-candle ATR, candle feature calculations, the existing page framework and design components.
- **Replace:** the two CSV upload boxes, fixed bear/small-bull/big-bull rules, latest-three-candle focus and occurrence-date chips.
- **Extend:** contextual formation descriptors, similarity ranking, outcome measurement and candlestick comparisons. Keep the existing fixed-pattern matcher only as an independent tested utility, not the primary workflow.

## Revised architecture

1. **Screenshot processing:** image upload, validation, preview, replacement and explicit analysis action. Accept XAUUSD Daily or 1-hour screenshots; show detected instrument/timeframe and request correction only when ambiguous. Do not retain personal screenshots by default.
2. **Vision interpretation:** Lovable AI reads surrounding price action, visible candles, zones and annotations. Separate visible observations from interpretation and uncertainty. Unreadable prices, dates and indicators remain unknown.
3. **Historical data:** connect a provider with genuine spot XAUUSD Daily and hourly OHLC coverage. Verify availability, access, licensing, session boundaries and timezone before choosing the feed. Cache validated candles and provenance in Lovable Cloud. Do not substitute gold futures or another instrument silently.
4. **Query formation:** use visible dates and instrument to retrieve the actual current Daily and hourly OHLC windows, ending at an explicit analysis cutoff. Ask for the chart's final completed date or broker/feed when needed. A screenshot's visually estimated prices are not authoritative OHLC data. If the source window cannot be reliably aligned, keep the interpretation but withhold numerical similarity results and probabilities. Never fetch the target session's realized candles into the scenario calculation, including when analysing a past date.
5. **Historical matching:** deterministic candle, trend, consolidation, breakout, zone-distance and volatility features, plus normalized price-sequence similarity and constrained DTW. Jointly compare Daily structure and pre-cutoff hourly paths, including accelerating bullish candles, V-reversals and position relative to relevant moving averages when present. Match using only information available at each candidate's formation date.
6. **Outcomes and scenarios:** measure each already-selected match's following trading session using actual hourly candles, calculate bullish/bearish/sideways outcome frequencies and directional excursions, and group by observed outcome. AI explains these measured results; it cannot invent or alter them.
7. **Charts and reporting:** render actual historical candles, highlight the formation, distinguish the outcome window, and show dates, relevant levels, favourable/adverse excursions and final outcomes. Alongside these comparisons, render next-session hourly panels with the actual prior-24-hour context, dashed session boundary, verified support/resistance and relevant MA reference levels, and shaded normalized historical high/low ranges. Label ranges as historical evidence, not forecasts; never render fabricated future candles.

## Staged implementation

### Stage 1 — Screenshot and chart interpretation

- Enable Lovable Cloud for server-side AI and historical-data storage.
- Build the screenshot-first workspace, image preview and analysis states.
- Add vision interpretation of structure, trend, momentum, formations, zones and current market condition.
- Support Daily and hourly screenshot interpretation and establish the analysis cutoff and next trading session.
- Preserve the screenshot when analysis fails; expose unclear-image, unsupported-chart and insufficient-evidence states.
- Verify upload and interpretation before adding the matching pipeline.

### Stage 2 — First end-to-end evidence milestone

- Connect and validate real Daily and hourly data; show feed name, coverage and last completed candle. Hourly evidence is required for the primary next-session scenario output, not deferred as an optional enhancement.
- Align the uploaded screenshot with a real completed OHLC window.
- Implement joint Daily/hourly contextual descriptors and similarity ranking with no future information in the ranking.
- Deduplicate overlapping historical formations and exclude the query window and candidates whose outcome would not yet be known at the query date.
- Render up to three closest examples per observed outcome, where available, using genuine prices. Matching thresholds and ranking stay independent of future outcome labels.
- Show bullish continuation, bearish reversal and sideways/alternative groups only where supported; otherwise explain the missing evidence.
- Build two or three next-session hourly panels where supported: actual prior-24-hour context followed by historical shaded ranges and measured outcome-group frequencies. Preserve gaps and label insufficient hourly coverage instead of filling prices.
- **Acceptance:** upload Daily or hourly screenshot → interpret joint market structure → retrieve similar formations → display real historical examples and next-session hourly historical scenario ranges.

### Stage 3 — Statistics and hourly evidence

- Define and disclose next-session hourly outcome-classification thresholds before calculating frequencies; the next trading session is the primary horizon. Any longer-horizon analysis is secondary, not a replacement for the requested next-day view.
- Report sample size, counts, measured percentages, favourable/adverse movement and drawdown with clear direction and reference-level definitions.
- Label small samples as descriptive historical frequencies, not reliable predictive probabilities; show uncertainty and excluded/missing outcomes.
- Retrieve each example's corresponding hourly session using the provider's Daily session boundaries, not a guessed UTC day. Label missing hourly coverage rather than synthesizing candles.
- Normalize each matched next-session hourly sequence to its formation-end price and pre-cutoff volatility, then re-anchor to the query's verified price and pre-cutoff volatility. Calculate the average normalized path and mean normalized high/low envelope per outcome group; show the envelope as a shaded descriptive historical range, not a confidence interval or guaranteed bound. Disclose the normalization and aggregation method and count valid observations at each hourly slot; do not interpolate missing bars.
- Render verified key levels as horizontal references. A moving average is calculated from genuine pre-cutoff candles using a known type and period; do not invent indicator settings or a future MA path. Withhold unreadable/unverified levels.

### Stage 4 — Conditional trading analysis

- For supported scenarios, show confirmation, invalidation and potential entry zones.
- Calculate stops, targets and risk/reward deterministically from verified prices and an explicit rule set. Keep these hypothetical, not executed trades.
- If prices, zones or historical support are insufficient, withhold numerical trade levels and recommendations.
- Identify the source and tick/proxy nature of volume when discussing Volume Profile; do not present CFD volume as centralized exchange volume.

## Technical details

- Preserve TanStack Start routing and existing design tokens; use small focused upload, interpretation, scenario and comparison components.
- Keep numerical modules pure TypeScript and independently testable. Use a proven DTW implementation for sequence alignment and a candlestick chart library for interactive price charts.
- Add separate server functions for vision interpretation and provider retrieval. Use the Lovable AI Gateway SDK and the workspace default vision-capable model after verifying its image-input contract and availability.
- Validate image inputs and AI report structure on the server. Treat screenshot text as untrusted data, not instructions. Keep private keys and prompts server-side.
- Persist shared historical candles with instrument, feed, timeframe, UTC timestamp and session provenance; prevent ordinary users from writing provider data. Do not add user accounts or saved report history unless required by service access.
- Record the revised server/pure-numerical boundaries in the project's architecture guidance and update the page's app-specific metadata.

## Verification and dependencies

- Keep existing candle/ATR regression tests and add tests for future-independent ranking, overlapping-match exclusion, exact outcome counts, horizon completion, directional excursions, stop/target arithmetic and risk/reward.
- Add tests for joint Daily/hourly matching, exact normalization and re-anchoring, hourly envelope aggregation, missing-bar exclusion and session-boundary alignment. Verify that changing the target session's realized candles cannot change a past-cutoff scenario panel.
- Test invalid images, unreadable screenshots, date/feed mismatch, unavailable historical data and incomplete hourly coverage.
- Verify the central flow in the browser with actual image input, real AI output and actual historical candle charts; check screenshot preview, comparison charts and narrow-screen layout.
- Only the requirements document is present so far; the **two referenced XAUUSD screenshots still need to be uploaded** for the requested acceptance tests.
- Market-provider access and sufficient Daily/hourly coverage must be verified during Stage 2. If credentials or provider fees are required, present the connection approval then; never fill a data gap with fabricated examples.

Implementation proceeds stage by stage, with each stage tested before the next. The first evidence milestone is not complete until actual historical comparisons are verified end to end.