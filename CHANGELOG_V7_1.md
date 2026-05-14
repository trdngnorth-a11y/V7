# V7.1 Fix - Scanner Confluence + Trade Activation Tuning

## Fixed
- Scanner rows now show trend-stack diagnostics even when there is no active trade setup.
- Added a `Why` column so WAIT/SKIP rows show the reason/action instead of leaving the user blind.
- Reduced excessive no-trade blocking from trend quality. Low trend quality now blocks only in extreme chop; otherwise it reduces confluence and shows WAIT.
- Relaxed liquidity-sweep requirement: FVG + BOS/CHOCH + fresh unmitigated order block remains required, while sweep/inducement is bonus confluence.
- Retest confirmation now checks the last three closed candles instead of only the last candle, reducing missed valid retests.
- MACD line + histogram color remains a hard conflict blocker when opposite to the trade.
- Trend stack hard-blocks only true multi-factor conflicts, not a single neutral/weak indicator.

## Trading behavior
- Paper minimum score changed from 11/15 to 9/16.
- Minimum RR changed from 2.0 to 1.8.
- Minimum trend quality changed from 50 to 30.
- QQE remains soft confirmation only and cannot open trades alone.

## Still blocked
- No trade if MACD line/histogram is opposite.
- No trade if HTF/EMA trend is clearly opposite.
- No trade if RR, SL quality, ADR, or risk limits fail.
