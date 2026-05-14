# Dashboard Design Reference

The dashboard UI must match the latest user-provided reference screenshot:

- Dark navy / black grid background.
- Header: Delta Scanner, last update, tab buttons on the left, scanner filter buttons on the right.
- Toolbar row: LIVE MARKET-DATA, BOT ON, PAPER SIM, Scan Now, Start Bot, Stop Bot, Emergency Stop.
- Metric cards in 4-column layout:
  - Total Trades
  - Wins
  - Losses
  - Win Rate
  - Funds Used
  - Open P/L
  - Closed P/L
  - Equity
- Open Trades table first.
- Scanner Signals table second.
- Bottom row: Open Trades, Performance Summary, Closed Trades.
- Settings page controls simulated wallet/risk only and must immediately update dashboard equity/funds display after changing or saving capital fields.

Reference image files:

- public/assets/dashboard-reference.png
- public/assets/dashboard-reference-v2.jpg

Critical UX rule:

When the user changes Total Wallet Amount or Bot Usable Amount in Settings, the main Dashboard must reflect the updated Equity / Available / Usable values immediately. Settings also auto-save after a short debounce and persist to data/settings.json and data/paperWallet.json.


## V4 scanner-state fix
- No active order-block setup is displayed as WAIT, not SKIP.
- SKIP is reserved for hard blockers: market-data failure, spread too high, ADR exhaustion, HTF conflict, RR below minimum, or invalid SL.
- Non-actionable rows show score as `-` instead of forced `0`, while TQ and 1H bias still display when available.
- Settings wallet changes still auto-save and update dashboard equity/funds immediately.
