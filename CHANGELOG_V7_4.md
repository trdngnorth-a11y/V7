# CHANGELOG V7.4

## Professional Hard-Gate Strategy Build

- Rebuilt scanner logic around transcript-derived hard-gated modules instead of loose score/fallback entries.
- Added MACD + CCI alignment strategy with CCI zero-bias then +/-100 entry sequencing.
- Added EMA Channel + Heikin Ashi + MACD histogram pullback strategy.
- Reworked ICT Order Block logic to require imbalance/FVG, BOS/CHoCH, freshness, retest, and lower-timeframe rejection confirmation.
- Added EMA 7/17 scalping module using 5M execution and 1H confirmation.
- Added strict candle trigger detection: engulfing, big momentum candle, pin/rejection candle.
- Added CCI calculations and MACD transcript-state detection: recent cross, histogram flip, strengthening, and weakening warnings.
- Raised default minimum final reward target to 3R.
- Disabled trend-continuation fallback by default to prevent entries that do not match a full transcript sequence.
- Live auto-orders remain blocked; build is paper simulation by default.
- Added early momentum invalidation exits: EMA 7/17 scalps can close if an opposite trigger or EMA flip appears within the first few 5M bars; other modules can close if HA/MACD momentum invalidates shortly after entry.
