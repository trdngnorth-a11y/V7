# Delta Scanner V7.4 Professional Hard-Gate Bot

This build replaces the loose V7.3 confluence/fallback behavior with transcript-derived hard gates. A trade is allowed only when one complete strategy module finishes its full entry sequence and global risk filters pass. Live auto-orders remain blocked; the default mode is PAPER simulation.

## V7.4 Strategy Modules

1. **MACD + CCI Alignment** — requires MACD cross direction + matching histogram + CCI zero-bias then +/-100 entry cross + candle/trend confirmation.
2. **EMA Channel + Heikin Ashi + MACD** — requires EMA channel trend, real pullback into/near the channel, Heikin Ashi turn after correction, MACD histogram flip/strengthening, no extension.
3. **ICT Order Block** — requires imbalance/FVG, fresh/unmitigated OB, BOS/CHoCH, retest, lower-timeframe rejection candle, MACD/HA confirmation.
4. **EMA 7/17 Scalping** — requires EMA7/EMA17 direction, strong slope around 30°+, non-sideways 5M conditions, trigger candle, and 1H confirmation.

## Risk Rules

- Minimum final target: 3R by default.
- Always uses SL before opening paper trade.
- Default risk remains small: 0.5% on Tier 1 and 0.25% on Tier 2 unless changed.
- Hard daily controls remain active: max trades/day, max daily loss, max consecutive losses, max open trades.
- No live auto-orders in this package.

## Why this version is stricter

V7.4 does not allow MACD-only, CCI-only, EMA-only, Heikin Ashi-only, OB-only, or scoring-only entries. Each module has its own exact checklist. If the checklist is incomplete, the scanner returns WAIT/SKIP instead of forcing a trade.

---

# Delta Scanner V7.3 OB-LS Confluence

Standalone Windows desktop webbot for Delta Exchange India crypto perpetual futures.

## Build

- Runtime: Node.js only
- No npm install
- No Python / Docker / Redis / database
- Backend + frontend served from one Node process
- URL: `http://127.0.0.1:4000`
- Default mode: `PAPER`
- Live auto-orders: intentionally blocked in this build

## V7 Strategy

Primary model: **V7.3 OB-LS Confluence Model**

The bot only recommends a trade when the following structure exists first:

1. Liquidity sweep / inducement
2. Valid fresh unmitigated order block
3. Imbalance / FVG
4. BOS or CHOCH candle close
5. First pullback / retest into the OB zone
6. Retest confirmation candle
7. Trend-stack agreement
8. Structure-first SL
9. Minimum RR and ADR checks

## Active confirmation stack

Indicators are confirmation gates only. They cannot open trades by themselves.

- EMA20/50/200 trend channel
- Heikin Ashi momentum confirmation
- MACD line + signal-line relation
- MACD histogram color and expansion/contraction
- QQE Mod as a soft confirmation only
- ATR and ADR risk filters
- Volume impulse
- Previous-day high/low and support/resistance location

## Removed / rejected from active scoring

The following are not standalone strategies and are not allowed to override structure:

- Supertrend
- CCI
- POC / VAH / VAL value-area bounce logic
- RSI-only entries
- EMA crossover-only entries
- MACD-only entries
- QQE-only entries
- Breakout chasing
- 1-minute scalping

## Anti-opposite-signal rule

V7 includes a trend-consistency layer. A signal is blocked when the bot side conflicts with the chart stack, especially:

- 4H and 1H bias both oppose the proposed side
- EMA15M and EMA1H both oppose the proposed side
- MACD line and histogram color oppose the proposed side
- Heikin Ashi closed candle opposes the proposed side
- Trend-stack agreement is too weak

This is designed to prevent the earlier issue where the chart appeared bearish while the scanner showed BUY, or bullish while the scanner showed SELL.

## QQE Mod handling

QQE Mod is included only as a soft momentum filter. It adds confirmation when QQE line and bar agree with the trade direction. It does not trigger trades independently.

## Windows Run Flow

1. Extract the ZIP so the folder is:

```cmd
C:\Users\Om\Desktop\V7
```

2. Open Windows CMD:

```cmd
cd C:\Users\Om\Desktop\V7
check-system.cmd
start-backend.cmd
```

3. Open browser:

```text
http://127.0.0.1:4000
```

Keep the CMD window open. Closing CMD stops the bot.

## Main Files

```text
V7/
  server.js
  README.md
  check-system.cmd
  start-backend.cmd
  start-v7.cmd
  data/
    settings.json
    trades.json
    logs.json
    paperWallet.json
    apiKeys.json
  public/
    index.html
    styles.css
    app.js
```

## Paper Trading

Paper mode uses live Delta India public market data and simulated wallet capital.

Default paper capital:

- Total wallet: ₹100,000
- Bot usable amount: ₹25,000
- Risk per trade: 0.5%
- Max open trades: 3
- Max trades/day: 2
- Default leverage: 3x
- Hard cap leverage: 5x
- Minimum RR: 2R
- Paper minimum score: 11 / 15

Leverage only affects margin used. It does not increase intended true risk.

## Live Trading

This build includes guarded API key storage and connection testing, but real auto-orders are blocked.

Reason: live auto-ordering must not be enabled until exchange-side protection logic is implemented and audited:

- Stop-loss order
- Reduce-only TP orders
- Bracket protection or equivalent fail-safe
- Emergency stop behavior
- Order rejection and partial-fill handling

## API Key Handling

- API key is masked in UI.
- API secret is encrypted locally using a machine-local key.
- API secrets are not logged.
- After restart, re-save the API key if you want to test connection again. The raw key is not stored in readable form.

## Delta API Endpoints Used

- `GET /v2/products`
- `GET /v2/tickers`
- `GET /v2/history/candles`
- `GET /v2/profile` for API test only

Base URL:

```text
https://api.india.delta.exchange
```

## Important Warning

This bot does not guarantee profit. Crypto futures are high-risk instruments. Losses can happen even on high-quality setups. Paper test first. Use live funds only after manual review, strong evidence, and full exchange-side protection controls.

## UI Reference

This build keeps the dark scanner dashboard style and adds V7 confluence diagnostics in the scanner and chart signal panel.


## V7.1 Scanner Fix

This build fixes the overly strict V7 gate that could leave scanner rows half-empty and prevent otherwise valid paper trades. The bot still uses OB/FVG/BOS-CHOCH as the primary structure engine, but trend quality is no longer an early hard block unless the market is extreme chop. MACD line plus histogram color remains a hard conflict blocker. QQE is still only a soft confirmation.

Recommended starting settings:
- Paper min score: 9
- Minimum RR: 1.8
- Minimum trend quality: 30



## V7.2 note
V7.2 keeps OB-LS as the primary structure engine, but adds a strict trend-continuation fallback. This solves the case where Tier 1 coins show bullish MACD / HA / QQE / trend stack but no fresh OB-LS exists. The fallback is not a single-indicator entry; it requires market-stack agreement, EMA support, MACD line + histogram alignment, HA momentum, trend-quality pass, and RR/ADR validation. The scanner now shows `Signal%` and the real `Why` reason.


## V7.3 note
V7.3 fixes target ordering. TP1 is always the nearer profit target and TP2 is always the farther profit target. Existing open paper trades from older builds are normalized on update, so a LONG can no longer display TP1 above TP2, and a SHORT can no longer display TP1 below TP2.
