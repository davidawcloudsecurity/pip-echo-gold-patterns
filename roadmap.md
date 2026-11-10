# Screenshot-first chart analysis rewrite

- [x] Review and approve the revised architecture and staged implementation plan.
- [x] Incorporate next-day hourly scenario panels into the plan: actual prior-24-hour context and normalized historical shaded ranges, never synthetic candles.
- [x] Implement screenshot upload and vision interpretation with uncertainty and instrument/timeframe confirmation. Verified upload, real AI non-chart response, removal and mobile layout.
- [x] Securely connect the user's Twelve Data API key and confirm XAU/USD Daily and hourly endpoint access; both returned prices successfully.
- [x] Validate Twelve Data timestamp timezone and completed-session convention: intraday UTC requested; Daily OHLC exactly matched to aligned 24-hour sessions (20:00 UTC in the current sample), with forming candles excluded. Hosted-use entitlement remains the user's provider-plan responsibility.
- [ ] Implement contextual, outcome-blind historical matching and measured outcomes. Blocked on a validated market feed and session convention.
- [ ] Display actual Daily comparisons and corresponding hourly sessions. Blocked on genuine historical data and matches.
- [ ] Add evidence-backed scenario statistics and conditional trading calculations. Blocked on measured historical outcomes and verified prices.
- [ ] Test the full workflow with the two requested screenshots (not present in this upload).
- [x] Review the supplied market-reading sample and simplify results to watch zones, collapsed detail and clearly unverified buy/sell areas.