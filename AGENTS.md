<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- XAUUSD analysis logic lives in pure TS modules under src/lib/xau (data, features, pattern) and runs in the browser — keeps it testable and free of backend needs.
- ATR used for candle i is computed from candles before i only — prevents look-ahead bias.
