'use strict';

const $ = (id) => document.getElementById(id);
let appState = null;
let signals = [];
let openTrades = [];
let closedTrades = [];
let logs = [];
let settings = null;
let scannerFilter = 'ALL';
let scannerSort = 'SCORE';

const symbols = ['BTCUSD','ETHUSD','SOLUSD','BNBUSD','XRPUSD','ADAUSD','AVAXUSD','LINKUSD','DOGEUSD','POLUSD','MATICUSD','LTCUSD','DOTUSD','BCHUSD','INJUSD','APTUSD','ARBUSD','ATOMUSD'];

const SETTINGS_INPUTS = {
  wallet: {
    totalWallet: 'totalWalletAmount',
    botUsable: 'botUsableAmount'
  },
  risk: {
    riskPct: 'defaultRiskPct',
    leverage: 'defaultLeverage',
    maxOpenTrades: 'maxOpenTrades',
    maxTradesPerDay: 'maxTradesPerDay',
    maxDailyLossPct: 'maxDailyLossPct',
    maxConsecutiveLosses: 'maxConsecutiveLosses',
    minScore: 'minScore',
    paperMinScore: 'paperMinScore',
    minRR: 'minRR',
    adrUsedLimitPct: 'adrUsedLimitPct',
    timeFailureCandles: 'timeFailureCandles',
    pendingExpiryMinutes: 'pendingExpiryMinutes',
    atrBufferMult: 'atrBufferMult',
    minSlAtrMult: 'minSlAtrMult',
    maxSlAtrMult: 'maxSlAtrMult',
    minTrendQuality: 'minTrendQuality',
    moveSlAfterTp1MinR: 'moveSlAfterTp1MinR',
    moveSlAfterTp1MinAge: 'moveSlAfterTp1MinAge'
  }
};
let settingsAutoSaveTimer = null;


function fmt(n, d=2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
}
function money(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '₹0.00';
  return '₹' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
function clsPnl(n) { return Number(n) >= 0 ? 'positive' : 'negative'; }
function safe(v, fallback='-') { return v === null || v === undefined || v === '' ? fallback : v; }
function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function tagClass(v){ return String(v || '').toUpperCase().replace(/[^A-Z0-9]+/g,'_'); }
function tag(v, label) { return `<span class="tag ${tagClass(label || v)}">${label || v || '-'}</span>`; }
function td(v) { return `<td>${v ?? '-'}</td>`; }
function scorePct(score, max=15) {
  if (score === null || score === undefined || score === '' || Number.isNaN(Number(score))) return '-';
  const denom = Number(max || 15);
  return Math.round((Number(score) / denom) * 100);
}
function decisionSide(v) { return ['LONG','SHORT'].includes(v) ? v : (v === 'WAIT' ? 'WAIT' : 'SKIP'); }
function shortTrend(v) {
  const s = String(v || '').toUpperCase();
  if (s.includes('BULL')) return 'Bull';
  if (s.includes('BEAR')) return 'Bear';
  return '-';
}
function oneHourTrend(s) {
  const st = String(s?.indicators?.ema1h?.direction || s?.trend || '').toUpperCase();
  if (st.includes('BULL')) return 'BULLISH';
  if (st.includes('BEAR')) return 'BEARISH';
  return s?.decision === 'WAIT' ? 'WAIT' : '-';
}
function quality(score) {
  if (score === null || score === undefined || score === '' || Number.isNaN(Number(score))) return 'WEAK';
  const n = Number(score);
  if (n >= 12) return 'STRONG';
  if (n >= 9) return 'MEDIUM';
  return 'WEAK';
}
function slqLabel(v) {
  const s = String(v || '').toUpperCase();
  if (s.includes('GOOD')) return 'SL OK';
  if (s.includes('WIDE')) return 'SL WIDE';
  if (s.includes('BAD')) return 'SL BAD';
  return 'SL -';
}
function tqDisplay(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  return fmt(Number(v) * 100, 0);
}
function dirShort(v) {
  const s = String(v || '').toUpperCase();
  if (s.includes('BULL')) return 'BULL';
  if (s.includes('BEAR')) return 'BEAR';
  if (s.includes('GREEN')) return 'GREEN';
  if (s.includes('RED')) return 'RED';
  return 'NEUTRAL';
}
function dirTag(v) {
  const d = dirShort(v);
  return tag(d, d);
}
function macdCell(s) {
  const m = s?.indicators?.macd15m || {};
  const label = m.color ? `${m.color}/${dirShort(m.direction)}` : '-';
  return tag(label, label);
}
function trendVotes(s) {
  const ts = s?.indicators?.trendStack || s?.indicators?.marketStack;
  if (!ts) return '-';
  const total = (ts.agree||0)+(ts.oppose||0)+(ts.neutral||0);
  return `${ts.required || ts.marketDirection || '-'} ${ts.agree || 0}/${total || 8}`;
}
function trendStackHtml(s) {
  const ts = s?.indicators?.trendStack || s?.indicators?.marketStack;
  if (!ts?.details?.length) return '<div>No trend stack details.</div>';
  return `<div class="trend-stack-list">${ts.details.map(x => `<div><span>${escapeHtml(x.name)}</span><b class="${x.vote === 'AGREE' ? 'positive' : x.vote === 'OPPOSE' ? 'negative' : 'text-wait'}">${escapeHtml(x.value)} / ${x.vote}</b></div>`).join('')}</div>`;
}
function pnlTotal(t) { return Number(t.realizedPnl || 0) + Number(t.unrealizedPnl || 0); }
function age(openedAt) {
  const t = Date.parse(openedAt || '');
  if (!t) return '-';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [h,m,s].map(x => String(x).padStart(2,'0')).join(':');
}
function coinAsset(symbol) { return String(symbol || '').replace(/USD.*/, '').replace('MATIC','POL'); }
function coinLogo(symbol) {
  const a = coinAsset(symbol);
  const cls = ['BTC','ETH','SOL','BNB','XRP','AVAX','INJ','ADA','LINK','DOGE','DOT','BCH','ARB','APT','POL','LTC'].includes(a) ? a : 'OTHER';
  const text = { BTC:'₿', ETH:'◆', SOL:'SO', BNB:'BN', XRP:'XR', AVAX:'AV', INJ:'IN', ADA:'AD', LINK:'LI', DOGE:'DO', DOT:'DT', BCH:'BC', ARB:'AR', APT:'AP', POL:'PO', LTC:'LT', OTHER:a.slice(0,2) }[cls] || a.slice(0,2);
  return `<span class="coin-logo logo-${cls}"><span>${text}</span></span>`;
}
function coinCell(symbol) { return `<div class="coin-cell">${coinLogo(symbol)}<span class="coin-symbol">${symbol || '-'}</span></div>`; }
async function api(path, options={}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function formatClock(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderMetrics() {
  const m = appState?.metrics || {};
  const items = [
    { label: 'Total Trades', val: m.totalTrades ?? 0, icon: '▦' },
    { label: 'Wins', val: m.wins ?? 0, icon: '✓', cls: 'positive' },
    { label: 'Losses', val: m.losses ?? 0, icon: '×', cls: 'negative' },
    { label: 'Win Rate', val: fmt(m.winRate || 0) + '%', icon: '◔', cls: Number(m.winRate || 0) >= 50 ? 'positive' : '' },
    { label: 'Funds Used', val: money(m.fundsUsed || 0), icon: '▥', cls: 'funds', sub: `Available ${money(appState?.wallet?.available ?? 0)}` },
    { label: 'Open P/L', val: money(m.openPnl || 0), icon: '↗', cls: clsPnl(m.openPnl || 0) },
    { label: 'Closed P/L', val: money(m.closedPnl || 0), icon: '▣', cls: clsPnl(m.closedPnl || 0) },
    { label: 'Equity', val: money(m.simEquity ?? settings?.wallet?.botUsableAmount ?? 0), icon: '▤', cls: 'positive', sub: `Usable ${money(settings?.wallet?.botUsableAmount ?? appState?.wallet?.baseUsableAmount ?? 0)}` }
  ];
  $('metrics').innerHTML = items.map(it => `<div class="metric ${it.cls || ''}" data-icon="${it.icon}"><div class="label">${it.label}</div><div class="value">${it.val}</div>${it.sub ? `<div class="sub">${it.sub}</div>` : ''}</div>`).join('');

  $('modeBadge').textContent = appState?.mode === 'PAPER' ? 'PAPER SIM' : (appState?.mode || 'PAPER');
  $('modeBadge').className = 'badge paper';
  const marketOk = appState?.marketStatus === 'OK';
  $('marketBadge').textContent = marketOk ? 'LIVE MARKET-DATA' : (appState?.marketStatus === 'ERROR' ? 'MARKET ERROR' : 'MARKET DATA CHECK');
  $('marketBadge').className = 'badge ' + (marketOk ? 'green' : appState?.marketStatus === 'ERROR' ? 'red' : 'wait');
  $('botBadge').textContent = appState?.bot?.running ? 'BOT ON' : (appState?.bot?.emergencyStopped ? 'EMERGENCY' : 'BOT OFF');
  $('botBadge').className = 'badge ' + (appState?.bot?.running ? 'green' : appState?.bot?.emergencyStopped ? 'red' : 'neutral');
  $('lastUpdate').textContent = `Last update: ${formatDateTime(appState?.lastScanAt)} | Coins: ${signals.length || symbols.length}`;
  if ($('openCount')) $('openCount').textContent = `(${openTrades.length}) ${openTrades.length}`;
  if ($('openCountSmall')) $('openCountSmall').textContent = `(${openTrades.length})`;
  if ($('closedCountSmall')) $('closedCountSmall').textContent = `(${closedTrades.length})`;
}
function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function normalizeSlQuality(v) {
  const s = String(v || '-').toUpperCase();
  if (s.includes('GOOD') || s.includes('OK')) return 'SL OK';
  if (s.includes('WIDE')) return 'SL WIDE';
  if (s.includes('CLOSE')) return 'SL CLOSE';
  return 'SL -';
}
function renderOpenTrades(targetId='openTradesTable') {
  const compact = targetId === 'openTradesTable';
  const headers = compact ? ['Coin','Side','Mode','Entry','Price','Qty','Funds Used','SL','SLQ','TP1','TP2','P/L','P/L %','Time','RR','Action'] : ['Coin','Side','Status','Qty','Funds Used','Entry','Price','SL','TP1','TP2','P/L','P/L %','RR','Mode','SL Reason'];
  const rows = openTrades.map(t => {
    const side = decisionSide(t.side);
    if (compact) return `<tr class="side-${side}">
      ${td(coinCell(t.symbol))}${td(tag(t.side))}${td(t.mode || 'PAPER')}${td(fmt(t.entry, 6))}${td(fmt(t.currentPrice, 6))}${td(fmt(t.remainingQty || t.qty, 6))}${td(money(t.marginUsed))}${td(`<span class="negative">${fmt(t.sl, 6)}</span>`)}${td(tag(normalizeSlQuality(t.slQuality)))}${td(`<span class="positive">${fmt(t.tp1, 6)}</span>`)}${td(`<span class="positive">${fmt(t.tp2, 6)}</span>`)}
      ${td(`<span class="${clsPnl(pnlTotal(t))}">${pnlTotal(t) >= 0 ? '+' : ''}${fmt(pnlTotal(t), 2)}</span>`)}${td(`<span class="${clsPnl(t.pnlPct)}">${Number(t.pnlPct || 0) >= 0 ? '+' : ''}${fmt(t.pnlPct)}%</span>`)}${td(age(t.openedAt))}${td(fmt(t.rr))}${td(`<button class="action-close" data-close-id="${escapeHtml(t.id)}">Close</button>`)}
    </tr>`;
    return `<tr class="side-${side}">
      ${td(coinCell(t.symbol))}${td(tag(t.side))}${td(tag(t.status))}${td(fmt(t.remainingQty || t.qty, 6))}${td(money(t.marginUsed))}
      ${td(fmt(t.entry, 6))}${td(fmt(t.currentPrice, 6))}${td(fmt(t.sl, 6))}${td(fmt(t.tp1, 6))}${td(fmt(t.tp2, 6))}
      ${td(`<span class="${clsPnl(pnlTotal(t))}">${money(pnlTotal(t))}</span>`)}${td(fmt(t.pnlPct)+'%')}${td(fmt(t.rr))}${td(t.mode)}${td(t.slReason || '-')}
    </tr>`;
  }).join('');
  $(targetId).innerHTML = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="empty-row">No open or pending paper trades.</td></tr>`}</tbody>`;
  document.querySelectorAll('[data-close-id]').forEach(btn => btn.onclick = () => manualCloseTrade(btn.dataset.closeId));
}

function filteredSignals() {
  let arr = [...signals];
  if (scannerFilter === 'LONG') arr = arr.filter(s => s.decision === 'LONG');
  if (scannerFilter === 'SHORT') arr = arr.filter(s => s.decision === 'SHORT');
  if (scannerFilter === 'WAIT') arr = arr.filter(s => s.decision === 'WAIT' || s.decision === 'SKIP');
  if (scannerFilter === 'STRONG') arr = arr.filter(s => Number(s.score || 0) >= 8 || ['LONG','SHORT'].includes(s.decision));
  arr.sort((a,b) => {
    const ta = a.tier === 'Tier 1' ? 1 : 2;
    const tb = b.tier === 'Tier 1' ? 1 : 2;
    if (ta !== tb) return ta - tb;
    return scannerSort === 'RR'
      ? (Number(b.rr || 0) - Number(a.rr || 0) || Number(b.score || 0) - Number(a.score || 0))
      : (Number(b.score || 0) - Number(a.score || 0) || Number(b.rr || 0) - Number(a.rr || 0));
  });
  return arr;
}
function renderSignals() {
  const headers = ['Coin','Dec','Trend Stack','MACD','HA','QQE','Signal%','TQ','Q','En','SL','TP1','TP2','RR','Why'];
  const arr = filteredSignals();
  let lastTier = null;
  const rows = [];
  for (const s of arr) {
    if (s.tier !== lastTier) {
      lastTier = s.tier;
      const label = s.tier === 'Tier 1' ? 'TIER 1 — MAJOR COINS' : 'TIER 2 — MID CAP / INTRADAY';
      rows.push(`<tr class="tier-row"><td colspan="${headers.length}">${label}</td></tr>`);
    }
    const dec = s.decision || 'WAIT';
    const side = decisionSide(dec);
    const q = quality(s.score);
    const tq = s.tq === null || s.tq === undefined ? '-' : Math.round(Number(s.tq) * 100);
    const sc = scorePct(s.score, s.scoreMax);
    const ha = s?.indicators?.heikinAshi15m?.direction || '-';
    const qqe = s?.indicators?.qqeMod15m?.direction || '-';
    rows.push(`<tr class="side-${side}" title="${escapeHtml(s.reason || '')}">
      ${td(coinCell(s.symbol))}${td(tag(dec))}${td(`<span class="${String(trendVotes(s)).includes('BULL') ? 'text-long' : String(trendVotes(s)).includes('BEAR') ? 'text-short' : 'text-wait'}">${trendVotes(s)}</span>`)}${td(macdCell(s))}${td(dirTag(ha))}${td(dirTag(qqe))}${td(`<span class="${Number(sc) >= 70 ? 'positive' : 'text-wait'}">${sc}</span>`)}${td(`<span class="${Number(tq) >= 30 ? 'positive' : 'text-wait'}">${tq}</span>`)}${td(tag(q))}${td(fmt(s.entry,6))}${td(fmt(s.sl,6))}${td(fmt(s.tp1,6))}${td(fmt(s.tp2,6))}${td(fmt(s.rr))}${td(`<span class="small-reason">${escapeHtml(s.reason || s.action || '-')}</span>`)}
    </tr>`);
  }
  $('signalsTable').innerHTML = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${headers.length}">No scan data yet.</td></tr>`}</tbody>`;
}

function renderSummaries() {
  const openPnl = openTrades.reduce((s,t)=>s+Number(t.unrealizedPnl||0),0);
  const used = openTrades.reduce((s,t)=>s+Number(t.marginUsed||0),0);
  $('openSummary').innerHTML = openTrades.length
    ? `<div class="summary-list">${openTrades.slice(0,6).map(t => `<div class="summary-row"><span>${t.symbol}</span><span>${tag(t.side)}</span><span>${fmt(t.entry,6)}</span><span>${fmt(t.currentPrice,6)}</span><span class="${clsPnl(pnlTotal(t))}">${money(pnlTotal(t))}</span></div>`).join('')}</div>`
    : `<div class="summary-list"><p class="muted">No open trades.</p></div>`;

  const wins = closedTrades.filter(t=>Number(t.realizedPnl)>0).length;
  const losses = closedTrades.filter(t=>Number(t.realizedPnl)<0).length;
  const open = openTrades.length;
  const closedPnl = closedTrades.reduce((s,t)=>s+Number(t.realizedPnl||0),0);
  const best = closedTrades.length ? Math.max(...closedTrades.map(t=>Number(t.realizedPnl||0))) : 0;
  const worst = closedTrades.length ? Math.min(...closedTrades.map(t=>Number(t.realizedPnl||0))) : 0;
  const equity = appState?.metrics?.simEquity || 0;
  $('perfSummary').innerHTML = `<div class="summary-stat-grid">
    <div class="summary-stat"><div class="k">Total Trades</div><div class="v">${closedTrades.length}</div></div>
    <div class="summary-stat"><div class="k">Wins</div><div class="v">${wins}</div></div>
    <div class="summary-stat"><div class="k">Losses</div><div class="v">${losses}</div></div>
    <div class="summary-stat"><div class="k">Open</div><div class="v">${open}</div></div>
    <div class="summary-stat"><div class="k">Funds Used</div><div class="v text-wait">${money(used)}</div></div>
    <div class="summary-stat"><div class="k">Total P/L</div><div class="v ${clsPnl(closedPnl)}">${money(closedPnl)}</div></div>
    <div class="summary-stat"><div class="k">Worst</div><div class="v ${clsPnl(worst)}">${money(worst)}</div></div>
    <div class="summary-stat"><div class="k">Equity</div><div class="v positive">${money(equity)}</div></div>
  </div>`;
  $('closedSummary').innerHTML = closedTrades.length
    ? `<div class="summary-list">${closedTrades.slice().reverse().slice(0,5).map(t => `<div class="summary-row"><span>${t.symbol}</span><span>${tag(t.side)}</span><span></span><span class="${clsPnl(t.realizedPnl)}">${money(t.realizedPnl)}</span><span>${tag(Number(t.realizedPnl||0) >= 0 ? 'WIN' : 'LOSS')}</span></div>`).join('')}</div>`
    : `<div class="summary-list"><p class="muted">No closed trades.</p></div>`;
}

function renderTrades() {
  renderOpenTrades('tradesOpenTable');
  const headers = ['Coin','Side','Status','Entry','Exit','Qty','Realized P/L','P/L %','RR','Score','Closed At','Exit Reason'];
  const rows = closedTrades.slice().reverse().map(t => `<tr class="side-${decisionSide(t.side)}">${td(coinCell(t.symbol))}${td(tag(t.side))}${td(tag(t.status))}${td(fmt(t.entry,6))}${td(fmt(t.exit,6))}${td(fmt(t.qty,6))}${td(`<span class="${clsPnl(t.realizedPnl)}">${money(t.realizedPnl)}</span>`)}${td(fmt(t.pnlPct)+'%')}${td(fmt(t.rr))}${td(fmt(t.score,0))}${td(safe(t.closedAt))}${td(safe(t.exitReason))}</tr>`).join('');
  $('tradesClosedTable').innerHTML = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">No closed trades.</td></tr>`}</tbody>`;
}
function renderLogs() {
  const headers = ['Time','Type','Message','Data'];
  const rows = logs.map(l => `<tr>${td(l.at)}${td(tag(l.type))}${td(l.message)}${td(`<code>${escapeHtml(JSON.stringify(l.data || {}))}</code>`)}</tr>`).join('');
  $('logsTable').innerHTML = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">No logs.</td></tr>`}</tbody>`;
}
function setInputValue(id, value) {
  const el = $(id);
  if (!el) return;
  el.value = value ?? '';
}
function readNumberInput(id, fallback) {
  const el = $(id);
  if (!el) return fallback;
  const n = Number(el.value);
  return Number.isFinite(n) ? n : fallback;
}
function collectSettingsFromInputs() {
  const current = settings || { wallet: {}, risk: {} };
  const body = { wallet: { currency: 'INR' }, risk: {} };
  for (const [id, key] of Object.entries(SETTINGS_INPUTS.wallet)) {
    const fallback = current.wallet?.[key] ?? 0;
    if ($(id)) body.wallet[key] = readNumberInput(id, fallback);
  }
  for (const [id, key] of Object.entries(SETTINGS_INPUTS.risk)) {
    const fallback = current.risk?.[key] ?? 0;
    if ($(id)) body.risk[key] = readNumberInput(id, fallback);
  }
  return body;
}
function renderSettings() {
  if (!settings) return;
  const active = document.activeElement;
  const editingSettings = active && active.closest && active.closest('#settings') && ['INPUT','SELECT'].includes(active.tagName);
  if (!editingSettings) {
    for (const [id, key] of Object.entries(SETTINGS_INPUTS.wallet)) setInputValue(id, settings.wallet?.[key]);
    for (const [id, key] of Object.entries(SETTINGS_INPUTS.risk)) setInputValue(id, settings.risk?.[key]);
  }
  const apiState = appState?.api || {};
  if ($('apiStatus')) $('apiStatus').textContent = `Saved: ${apiState.hasKey ? apiState.apiKeyMasked : 'No'} | Test passed: ${apiState.testPassed ? 'Yes' : 'No'} | Last: ${apiState.lastTestAt || '-'} ${apiState.lastError ? '| ' + apiState.lastError : ''}`;
}
function applySettingsPreview() {
  const draft = collectSettingsFromInputs();
  if (!settings) settings = { wallet: {}, risk: {} };
  settings.wallet = { ...(settings.wallet || {}), ...draft.wallet };
  settings.risk = { ...(settings.risk || {}), ...draft.risk };

  const botUsable = Number(settings.wallet.botUsableAmount || 0);
  const totalWallet = Number(settings.wallet.totalWalletAmount || botUsable || 0);
  const openPnl = Number(appState?.metrics?.openPnl || 0);
  const closedPnl = Number(appState?.metrics?.closedPnl || 0);
  const fundsUsed = Number(appState?.metrics?.fundsUsed || 0);
  if (!appState) appState = { metrics: {}, wallet: {}, mode: 'PAPER', bot: { running: false } };
  appState.metrics = { ...(appState.metrics || {}), simEquity: botUsable + openPnl + closedPnl, fundsUsed, openPnl, closedPnl };
  appState.wallet = { ...(appState.wallet || {}), totalWalletAmount: totalWallet, baseUsableAmount: botUsable, equity: botUsable + openPnl + closedPnl, available: Math.max(0, botUsable + closedPnl - fundsUsed) };
  renderMetrics();
  const status = $('settingsSaveStatus');
  if (status) { status.className = 'muted'; status.textContent = 'Changed locally. Auto-saving...'; }
}
function scheduleSettingsAutoSave() {
  clearTimeout(settingsAutoSaveTimer);
  settingsAutoSaveTimer = setTimeout(() => saveSettings(true).catch(err => {
    const status = $('settingsSaveStatus');
    if (status) { status.className = 'muted err'; status.textContent = 'Auto-save failed: ' + err.message; }
  }), 550);
}
async function loadAll(scan=false) {
  if (scan) await api('/api/scan/now', { method: 'POST', body: '{}' }).catch(e => alert(e.message));
  const [st, sig, trOpen, trClosed, logData, setData] = await Promise.all([
    api('/api/state'), api('/api/signals'), api('/api/trades/open'), api('/api/trades/closed'), api('/api/logs'), api('/api/settings')
  ]);
  appState = st; signals = sig.signals || []; openTrades = trOpen.open || []; closedTrades = trClosed.closed || []; logs = logData.logs || []; settings = setData;
  renderMetrics(); renderOpenTrades(); renderSignals(); renderSummaries(); renderTrades(); renderLogs(); renderSettings(); populateSymbols();
}
function populateSymbols() {
  if ($('chartSymbol').children.length) return;
  $('chartSymbol').innerHTML = symbols.map(s => `<option>${s}</option>`).join('');
}
function drawChart(data) {
  const canvas = $('chartCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = '#06101d'; ctx.fillRect(0,0,w,h);
  const candles = (data.candles || []).slice(-120);
  if (!candles.length) { ctx.fillStyle = '#a5b8ce'; ctx.fillText('No candle data.', 30, 30); return; }
  const prices = candles.flatMap(c => [c.high, c.low]);
  const signal = data.signal;
  if (signal) [signal.entry, signal.sl, signal.tp1, signal.tp2].forEach(x => { if (x) prices.push(Number(x)); });
  const min = Math.min(...prices), max = Math.max(...prices); const pad = (max-min)*0.08 || 1;
  const y = p => h - 35 - ((p - (min-pad)) / ((max+pad) - (min-pad))) * (h-65);
  const xStep = (w-70) / candles.length;
  ctx.strokeStyle = '#1d3a57'; ctx.lineWidth = 1;
  for (let i=0;i<6;i++){ const yy=30+i*(h-65)/5; ctx.beginPath(); ctx.moveTo(50,yy); ctx.lineTo(w-20,yy); ctx.stroke(); }
  candles.forEach((c,i)=>{
    const x = 55 + i*xStep;
    const up = c.close >= c.open;
    ctx.strokeStyle = up ? '#00f29a' : '#ff3d4f';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(x+xStep/2, y(c.high)); ctx.lineTo(x+xStep/2, y(c.low)); ctx.stroke();
    const bodyY = y(Math.max(c.open,c.close)); const bodyH = Math.max(1, Math.abs(y(c.open)-y(c.close)));
    ctx.fillRect(x+1, bodyY, Math.max(2,xStep-3), bodyH);
  });
  function line(price, color, label){ if(!price) return; const yy=y(Number(price)); ctx.strokeStyle=color; ctx.setLineDash([6,5]); ctx.beginPath(); ctx.moveTo(50,yy); ctx.lineTo(w-20,yy); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=color; ctx.fillText(`${label} ${fmt(price,6)}`, 58, yy-5); }
  if (signal) { line(signal.entry, '#23a8ff', 'ENTRY'); line(signal.sl, '#ff3d4f', 'SL'); line(signal.tp1, '#ffd400', 'TP1'); line(signal.tp2, '#00f29a', 'TP2'); }
  const ob = signal?.orderBlock;
  if (ob?.low && ob?.high) { ctx.fillStyle = 'rgba(209,75,255,.13)'; ctx.fillRect(50, y(ob.high), w-70, Math.max(2, y(ob.low)-y(ob.high))); ctx.fillStyle='#d14bff'; ctx.fillText('Order Block', w-140, y(ob.high)-6); }
  ctx.fillStyle = '#f4f7fb'; ctx.font = '13px Segoe UI'; ctx.fillText(`${data.symbol} ${data.tf}`, 20, 20);
}
async function loadChart() {
  const symbol = $('chartSymbol').value, tf = $('chartTf').value;
  const data = await api(`/api/chart?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`);
  drawChart(data);
  const s = data.signal;
  $('signalPanel').innerHTML = s ? [
    ['Decision', tag(s.decision)], ['Score', `${fmt(s.score,0)} / ${fmt(s.scoreMax || 15,0)}`], ['RR', fmt(s.rr)], ['Reason', s.reason],
    ['Trend', s.trend], ['Trend Stack', trendVotes(s)], ['MACD', `${s.indicators?.macd15m?.fluctuation || '-'}`], ['HA / QQE', `${s.indicators?.heikinAshi15m?.direction || '-'} / ${s.indicators?.qqeMod15m?.direction || '-'}`],
    ['SL Quality', slqLabel(s.slQuality)], ['Funds Used', money(s.position?.marginUsed)], ['SL Reason', s.slReason || '-']
  ].map(([k,v]) => `<div><span class="muted">${k}</span><br><b>${v}</b></div>`).join('') + trendStackHtml(s) : '<div>No signal.</div>';
}
async function saveSettings(auto=false) {
  const body = collectSettingsFromInputs();
  const status = $('settingsSaveStatus');
  if (status) { status.className = 'muted'; status.textContent = auto ? 'Auto-saving settings...' : 'Saving settings...'; }
  const res = await api('/api/settings', { method: 'POST', body: JSON.stringify(body) });
  settings = res.settings || settings;
  if (!appState) appState = { metrics: {}, wallet: {}, mode: 'PAPER', bot: { running: false } };
  if (res.wallet) appState.wallet = res.wallet;
  const st = await api('/api/state');
  appState = st;
  renderMetrics();
  renderSummaries();
  renderSettings();
  if (status) { status.className = 'muted ok'; status.textContent = 'Saved. Dashboard equity/funds updated.'; }
}
async function manualCloseTrade(id) {
  const trade = openTrades.find(t => t.id === id);
  if (!trade) return;
  if (!confirm(`Manually close ${trade.symbol} paper trade at current mark price?`)) return;
  await api('/api/trades/close', { method: 'POST', body: JSON.stringify({ id }) });
  await loadAll(true);
}
function exportCsv() {
  const headers = ['symbol','side','status','entry','exit','qty','realizedPnl','pnlPct','rr','score','closedAt','exitReason'];
  const csv = [headers.join(',')].concat(closedTrades.map(t => headers.map(h => JSON.stringify(t[h] ?? '')).join(','))).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'v7_closed_trades.csv'; a.click();
}
function jumpTab(name) {
  const btn = document.querySelector(`.tab[data-tab="${name}"]`);
  if (btn) btn.click();
}
function previewWalletOnMain() {
  if (!settings) settings = { wallet: {}, risk: {} };
  settings.wallet = settings.wallet || {};
  settings.risk = settings.risk || {};
  const totalWallet = Number($('totalWallet')?.value || settings.wallet.totalWalletAmount || 0);
  const botUsable = Number($('botUsable')?.value || settings.wallet.botUsableAmount || 0);
  settings.wallet.totalWalletAmount = totalWallet;
  settings.wallet.botUsableAmount = botUsable;
  if (appState) {
    appState.wallet = appState.wallet || {};
    appState.wallet.baseUsableAmount = botUsable;
    appState.wallet.available = Math.max(0, botUsable + Number(appState.metrics?.closedPnl || 0) - Number(appState.metrics?.fundsUsed || 0));
    appState.metrics = appState.metrics || {};
    appState.metrics.simEquity = botUsable + Number(appState.metrics.closedPnl || 0) + Number(appState.metrics.openPnl || 0);
  }
  renderMetrics();
}
function bind() {
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active')); $(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'chart') loadChart().catch(e=>alert(e.message));
  }));
  document.querySelectorAll('[data-jump]').forEach(btn => btn.addEventListener('click', () => jumpTab(btn.dataset.jump)));
  document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => btn.addEventListener('click', () => {
    scannerFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderSignals();
  }));
  $('sortScoreBtn').onclick = () => { scannerSort = 'SCORE'; renderSignals(); };
  $('sortRrBtn').onclick = () => { scannerSort = 'RR'; renderSignals(); };
  $('refreshBtn').onclick = () => loadAll(true);
  if ($('scanBtn')) $('scanBtn').onclick = () => loadAll(true);
  $('startBtn').onclick = async () => { await api('/api/bot/start', { method:'POST', body:'{}' }); await loadAll(true); };
  $('stopBtn').onclick = async () => { await api('/api/bot/stop', { method:'POST', body:'{}' }); await loadAll(); };
  if ($('emergencyBtnTop')) $('emergencyBtnTop').onclick = async () => { await api('/api/bot/emergency-stop', { method:'POST', body:'{}' }); await loadAll(); };
  $('loadChartBtn').onclick = () => loadChart().catch(e=>alert(e.message));
  $('reloadLogsBtn').onclick = () => loadAll();
  $('saveSettingsBtn').onclick = () => saveSettings(false).catch(e=>alert(e.message));
  [...Object.keys(SETTINGS_INPUTS.wallet), ...Object.keys(SETTINGS_INPUTS.risk)].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener('input', () => { applySettingsPreview(); scheduleSettingsAutoSave(); });
      el.addEventListener('change', () => { applySettingsPreview(); scheduleSettingsAutoSave(); });
    }
  });
  $('resetPaperBtn').onclick = async () => { if(confirm('Reset all paper trades and wallet?')) { await api('/api/paper/reset', { method:'POST', body:'{}' }); await loadAll(); } };
  $('emergencyBtn').onclick = async () => { await api('/api/bot/emergency-stop', { method:'POST', body:'{}' }); await loadAll(); };
  $('exportCsvBtn').onclick = exportCsv;
  $('saveKeysBtn').onclick = async () => { await api('/api/live/save-keys', { method:'POST', body: JSON.stringify({ apiKey: $('apiKey').value, apiSecret: $('apiSecret').value }) }).catch(e=>alert(e.message)); $('apiKey').value=''; $('apiSecret').value=''; await loadAll(); };
  $('testKeysBtn').onclick = async () => { await api('/api/live/test-connection', { method:'POST', body:'{}' }).then(()=>alert('Connection test passed')).catch(e=>alert(e.message)); await loadAll(); };
  $('deleteKeysBtn').onclick = async () => { await api('/api/live/delete-keys', { method:'POST', body:'{}' }); await loadAll(); };
  $('liveModeBtn').onclick = async () => { const enabled = !(appState?.bot?.liveMode); await api('/api/live/mode', { method:'POST', body: JSON.stringify({ enabled }) }).catch(e=>alert(e.message)); await loadAll(); };
  $('autoOrdersBtn').onclick = async () => { if(!$('ackLive').checked) return alert('Acknowledgement required.'); await api('/api/live/auto-orders', { method:'POST', body: JSON.stringify({ enabled: true }) }).catch(e=>alert(e.message)); await loadAll(); };
}

bind();
loadAll().then(()=>loadChart().catch(()=>{})).catch(e => alert(e.message));
setInterval(() => loadAll().catch(()=>{}), 20000);
