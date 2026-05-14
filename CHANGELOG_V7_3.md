# CHANGELOG V7.3

## Target-order safety fix

- Fixed TP ordering bug where a LONG trade could show TP1 above TP2 when a natural resistance target was farther than the R-based final target.
- Added `orderedTradeTargets()` so TP1 is always the nearer profit target and TP2 is always the farther profit target.
- Applied the same rule to both:
  - OB-LS structural trade plans
  - Trend-continuation fallback trade plans
- Added automatic open-trade target normalization. If an existing paper trade has reversed TP1/TP2 from an older build, the server corrects it on the next trade update.
- Existing example fix:
  - LONG entry `1.06485`
  - old wrong display: `TP1 1.12`, `TP2 1.107225`
  - corrected display: `TP1 1.107225`, `TP2 1.12`

## Rule

For LONG:

```text
SL < Entry < TP1 < TP2
```

For SHORT:

```text
SL > Entry > TP1 > TP2
```
