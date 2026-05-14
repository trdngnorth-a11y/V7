# V7.2 — OB-LS + Trend Continuation Confluence Fix

## Why this version exists
V7.1 could show Tier 1 coins as bullish across MACD / Heikin Ashi / QQE / trend stack, but still output SKIP / NO_TRADE when the active structural order-block candidate was missing or conflicted with HTF trend. This created a practical mismatch: the chart looked bullish while the bot stayed inactive.

## Main fix
Added a trend-continuation confluence fallback. OB-LS remains the primary engine, but when no fresh valid OB-LS exists, the bot can now take a trend-continuation paper trade only when the full market stack agrees.

## Trend-continuation requirements
- Market stack direction confirmed.
- Trend stack has at least 4 agreeing signals and no more than 1 opposing signal.
- EMA channel supports continuation.
- MACD line + histogram color/fluctuation align with the side.
- Heikin Ashi confirms momentum.
- QQE Mod can add confirmation but cannot trigger a trade alone.
- Trend quality must pass the chop guard.
- RR and ADR filters must pass.

## UI fix
- Scanner column `Sc` renamed to `Signal%`.
- `Why` now shows the actual blocking/trade reason instead of only `NO_TRADE`.

## Still removed / blocked
The bot still does not use Supertrend, CCI, POC/VAH/VAL, RSI-only, MACD-only, EMA-only, HA-only, QQE-only, or breakout-chase entries.
