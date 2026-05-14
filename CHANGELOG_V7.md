# V7 Change Log

## Strategy cleanup

- Removed Supertrend, CCI, and POC/VAH/VAL value-area logic from active scoring.
- Removed standalone indicator-style entries from the active model.
- Kept only the OB-LS structure engine as the primary setup generator.

## New confluence engine

A trade recommendation now requires:

- Valid fresh OB with liquidity sweep / inducement
- FVG / imbalance
- BOS or CHOCH
- First retest and confirmation candle
- Higher-timeframe trend agreement
- EMA channel agreement
- Heikin Ashi agreement
- MACD line + histogram color agreement
- QQE Mod soft confirmation where available
- RR and ADR filters

## MACD correction

MACD is now treated as market fluctuation evidence:

- MACD line above/below signal line is checked.
- Histogram color is checked.
- Histogram expansion/contraction is shown in diagnostics.
- Opposite MACD line + color state blocks the trade.

## QQE Mod handling

QQE Mod is included only as a soft confirmation filter. It cannot generate trades independently.

## Anti-opposite-signal guard

The scanner now blocks signals when the chart stack disagrees with the proposed side. This is intended to reduce BUY signals during bearish chart conditions and SELL signals during bullish chart conditions.
