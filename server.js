'use strict';

/*
  Delta Scanner V7 - OB-LS Confluence High Probability Model
  Standalone Node.js server. No npm dependencies.
  Default: PAPER simulation only. Live auto-orders are intentionally blocked in this build.
*/

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { URL } = require('url');

const APP_VERSION = 'V7.4-PRO-HARD-GATE-PAPER';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4000);
const DELTA_BASE = 'https://api.india.delta.exchange';
const USER_AGENT = 'DeltaScannerV7.4-ProHardGate-Node';

const TIER1 = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
const TIER2 = ['ADA', 'AVAX', 'LINK', 'DOGE', 'POL', 'MATIC', 'LTC', 'DOT', 'BCH', 'INJ', 'APT', 'ARB', 'ATOM'];
const SYMBOL_CANDIDATES = {
  BTC: ['BTCUSD'], ETH: ['ETHUSD'], SOL: ['SOLUSD'], BNB: ['BNBUSD'], XRP: ['XRPUSD'],
  ADA: ['ADAUSD'], AVAX: ['AVAXUSD'], LINK: ['LINKUSD'], DOGE: ['DOGEUSD'], POL: ['POLUSD'], MATIC: ['MATICUSD'],
  LTC: ['LTCUSD'], DOT: ['DOTUSD'], BCH: ['BCHUSD'], INJ: ['INJUSD'], APT: ['APTUSD'], ARB: ['ARBUSD'], ATOM: ['ATOMUSD']
};

const TF_SECONDS = { '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function nowIso() { return new Date().toISOString(); }
function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function dataPath(name) { return path.join(DATA_DIR, name); }
function safeNumber(x, fallback = 0) { const n = Number(x); return Number.isFinite(n) ? n : fallback; }
function round(x, d = 4) { const n = Number(x); if (!Number.isFinite(n)) return null; const m = Math.pow(10, d); return Math.round(n * m) / m; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function pct(a, b) { return b ? (a / b) * 100 : 0; }
function uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`; }
function sideFactor(side) { return side === 'SHORT' ? -1 : 1; }
function tfSec(tf) { return TF_SECONDS[tf] || 900; }

const DEFAULT_SETTINGS = {
  appName: 'Delta Scanner V7.4 Professional Hard-Gate Bot',
  version: APP_VERSION,
  mode: 'PAPER',
  exchange: { baseUrl: DELTA_BASE, scope: 'Delta Exchange India perpetual futures only' },
  bot: { running: false, liveMode: false, autoOrders: false, emergencyStopped: false, scanIntervalSec: 90 },
  wallet: { totalWalletAmount: 100000, botUsableAmount: 25000, currency: 'INR' },
  risk: {
    maxOpenTrades: 3,
    maxTradesPerDay: 2,
    maxDailyLossPct: 2,
    maxConsecutiveLosses: 2,
    defaultLeverage: 3,
    hardLeverageCap: 5,
    minScore: 90,
    paperMinScore: 90,
    liveMinScore: 95,
    minRR: 3,
    defaultRiskPct: 0.5,
    tier1MaxRiskPct: 1,
    tier2RiskPct: 0.25,
    adrUsedLimitPct: 80,
    timeFailureCandles: 8,
    timeFailureMinR: 0.5,
    pendingExpiryMinutes: 45,
    maxSpreadPct: 0.25,
    atrBufferMult: 0.35,
    entryToleranceAtr: 0.35,
    minSlAtrMult: 0.6,
    maxSlAtrMult: 4.5,
    minTrendQuality: 30,
    moveSlAfterTp1MinR: 1,
    moveSlAfterTp1MinAge: 30
  },
  paper: { takerFeePct: 0.05, slippageBps: 2, tp1ClosePct: 50 },
  strategy: {
    name: 'V7.4 Professional Transcript Hard-Gate Model',
    primaryEntryOnly: true,
    allowTrendContinuationFallback: false,
    hardGateMode: true,
    enabledModules: ['MACD_CCI_ALIGNMENT', 'EMA_CHANNEL_HA_MACD', 'ICT_ORDER_BLOCK', 'EMA_7_17_SCALP'],
    requireLiquiditySweep: false,
    requireImbalance: true,
    requireBosChoch: true,
    requireRetest: true,
    requireStructureSL: true,
    requireTrendAgreement: true,
    requireMacdAgreement: true,
    requireHeikinAshiAgreement: true,
    qqeMode: 'SOFT_FILTER',
    scoreMax: 16,
    activeStack: ['MACD + CCI aligned crossings', 'EMA channel pullback + Heikin Ashi + MACD histogram', 'ICT Order Block with imbalance + BOS/CHOCH + first retest', 'EMA 7/17 strong-slope scalping', 'Higher-timeframe confirmation', 'Strict candle confirmation', 'ATR/ADR risk filters'],
    filtersOnly: ['Higher timeframe trend', 'Candle strength', 'MACD histogram momentum', 'CCI threshold crossings', 'EMA channel location', 'Order block freshness', 'ATR', 'ADR', 'Spread'],
    removedIndicators: ['Supertrend', 'POC/VAH/VAL value-area scoring', 'RSI-only', 'VWAP-only', 'Ichimoku-only', 'Stochastic-only'],
    rejectedStandalone: ['EMA color-only', 'EMA crossover-only', 'Heikin Ashi-only', 'MACD-only', 'CCI-only', 'QQE-only', 'RSI-only', 'POC bounce', 'breakout chase without retest', 'sideways scalping']
  },
  symbols: {
    tier1: TIER1,
    tier2: TIER2,
    candidates: SYMBOL_CANDIDATES
  }
};
const DEFAULT_TRADES = { open: [], pending: [], closed: [], stats: { totalTrades: 0, wins: 0, losses: 0, closedPnl: 0 } };
const DEFAULT_LOGS = [];
const DEFAULT_WALLET = { startingEquity: 25000, equity: 25000, available: 25000, usedMargin: 0, openPnl: 0, closedPnl: 0, baseUsableAmount: 25000, totalWalletAmount: 100000, updatedAt: nowIso() };
const DEFAULT_API_KEYS = { hasKey: false, apiKeyMasked: '', apiKeyHash: '', secretEncrypted: '', iv: '', tag: '', testPassed: false, lastTestAt: null, lastError: null };

function readJson(name, fallback) {
  try {
    const p = dataPath(name);
    if (!fs.existsSync(p)) {
      writeJson(name, fallback);
      return JSON.parse(JSON.stringify(fallback));
    }
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw.trim()) return JSON.parse(JSON.stringify(fallback));
    return JSON.parse(raw);
  } catch (err) {
    console.error('JSON read failed', name, err.message);
    return JSON.parse(JSON.stringify(fallback));
  }
}
function writeJson(name, obj) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(dataPath(name), JSON.stringify(obj, null, 2));
}
function mergeDeep(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = mergeDeep(base[k], v);
    else out[k] = v;
  }
  return out;
}
function loadSettings() {
  const existing = readJson('settings.json', DEFAULT_SETTINGS);
  const merged = mergeDeep(DEFAULT_SETTINGS, existing);
  if (!merged.mode) merged.mode = 'PAPER';
  if (!merged.bot) merged.bot = DEFAULT_SETTINGS.bot;
  merged.bot.liveMode = !!merged.bot.liveMode;
  merged.bot.autoOrders = false; // deliberate block in this build
  merged.strategy = merged.strategy || {};
  merged.strategy.hardGateMode = true;
  merged.strategy.allowTrendContinuationFallback = false;
  merged.risk = merged.risk || {};
  merged.risk.minRR = Math.max(3, safeNumber(merged.risk.minRR, 3));
  merged.risk.paperMinScore = Math.max(90, safeNumber(merged.risk.paperMinScore, 90));
  merged.risk.minScore = Math.max(90, safeNumber(merged.risk.minScore, 90));
  merged.risk.liveMinScore = Math.max(95, safeNumber(merged.risk.liveMinScore, 95));
  return merged;
}
function saveSettings(settings) { writeJson('settings.json', settings); }
function loadTrades() { return mergeDeep(DEFAULT_TRADES, readJson('trades.json', DEFAULT_TRADES)); }
function saveTrades(t) { writeJson('trades.json', t); }
function loadLogs() { return readJson('logs.json', DEFAULT_LOGS); }
function saveLogs(logs) { writeJson('logs.json', logs.slice(-1000)); }
function loadWallet() { return mergeDeep(DEFAULT_WALLET, readJson('paperWallet.json', DEFAULT_WALLET)); }
function saveWallet(w) { w.updatedAt = nowIso(); writeJson('paperWallet.json', w); }
function loadApiKeys() { return mergeDeep(DEFAULT_API_KEYS, readJson('apiKeys.json', DEFAULT_API_KEYS)); }
function saveApiKeys(k) { writeJson('apiKeys.json', k); }

let settings = loadSettings();
let trades = loadTrades();
let logs = loadLogs();
let wallet = loadWallet();
let apiKeys = loadApiKeys();

const state = {
  version: APP_VERSION,
  bootAt: nowIso(),
  lastScanAt: null,
  scanning: false,
  marketStatus: 'BOOTING',
  marketError: null,
  products: {},
  tickers: {},
  signals: [],
  chartCache: new Map(),
  lastScanMs: 0
};

function log(type, message, data = {}) {
  const entry = { at: nowIso(), type, message, data: scrubSecrets(data) };
  logs.push(entry);
  logs = logs.slice(-1000);
  saveLogs(logs);
  return entry;
}
function scrubSecrets(obj) {
  try {
    return JSON.parse(JSON.stringify(obj, (k, v) => {
      const lower = String(k).toLowerCase();
      if (lower.includes('secret') || lower.includes('api_key') || lower.includes('apikey') || lower.includes('signature')) return '***';
      return v;
    }));
  } catch { return {}; }
}

function localKey() {
  const identity = `${os.hostname()}|${os.userInfo().username}|DeltaScannerV7LocalOnly`;
  return crypto.createHash('sha256').update(identity).digest();
}
function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', localKey(), iv);
  const enc = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { secretEncrypted: enc.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64') };
}
function decryptSecret(record) {
  if (!record.secretEncrypted || !record.iv || !record.tag) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', localKey(), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(record.secretEncrypted, 'base64')), decipher.final()]).toString('utf8');
}
function maskKey(key) {
  const s = String(key || '');
  if (s.length <= 8) return s ? `${s.slice(0, 2)}***${s.slice(-2)}` : '';
  return `${s.slice(0, 4)}***${s.slice(-4)}`;
}
function signDelta(method, requestPath, queryString, body, secret) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = body || '';
  const prehash = method.toUpperCase() + timestamp + requestPath + (queryString || '') + payload;
  const signature = crypto.createHmac('sha256', secret).update(prehash).digest('hex');
  return { timestamp, signature };
}

function requestJson(fullUrl, { method = 'GET', headers = {}, body = null, timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const transport = u.protocol === 'http:' ? http : https;
    const options = {
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT, ...headers },
      timeout: timeoutMs
    };
    const req = transport.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const msg = json && json.error ? JSON.stringify(json.error) : data.slice(0, 200);
            reject(new Error(`HTTP ${res.statusCode}: ${msg}`));
            return;
          }
          resolve(json);
        } catch (err) {
          reject(new Error(`JSON parse failed: ${err.message}; raw=${data.slice(0, 200)}`));
        }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('request timeout')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
function deltaUrl(pathname, params = {}) {
  const u = new URL(DELTA_BASE + pathname);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }
  return u.toString();
}
async function deltaPublic(pathname, params = {}) {
  return requestJson(deltaUrl(pathname, params));
}
async function deltaPrivate(method, pathname, params = {}, payloadObj = null) {
  const record = loadApiKeys();
  if (!record.hasKey) throw new Error('No API key saved');
  const secret = decryptSecret(record);
  const u = new URL(DELTA_BASE + pathname);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  const qs = u.search ? u.search : '';
  const body = payloadObj ? JSON.stringify(payloadObj) : '';
  const { timestamp, signature } = signDelta(method, pathname, qs, body, secret);
  return requestJson(u.toString(), {
    method,
    body,
    headers: {
      'Content-Type': 'application/json',
      'api-key': record.apiKeyRaw || '',
      'timestamp': timestamp,
      'signature': signature,
      'User-Agent': USER_AGENT
    }
  });
}

// Because storing raw API key visibly is not desired, the encrypted file stores only secret encrypted and masked key.
// To test after restart, user should re-save keys. During same process, raw key is cached in memory only.
let memoryApiKeyRaw = null;
async function deltaPrivateWithMemory(method, pathname, params = {}, payloadObj = null) {
  const record = loadApiKeys();
  if (!record.hasKey || !memoryApiKeyRaw) throw new Error('API key saved metadata exists, but raw key is not in memory. Re-save key for connection test.');
  const secret = decryptSecret(record);
  const u = new URL(DELTA_BASE + pathname);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  const qs = u.search ? u.search : '';
  const body = payloadObj ? JSON.stringify(payloadObj) : '';
  const { timestamp, signature } = signDelta(method, pathname, qs, body, secret);
  return requestJson(u.toString(), {
    method,
    body,
    headers: {
      'Content-Type': 'application/json',
      'api-key': memoryApiKeyRaw,
      'timestamp': timestamp,
      'signature': signature,
      'User-Agent': USER_AGENT
    }
  });
}

function normalizeCandle(c) {
  return {
    time: safeNumber(c.time),
    open: safeNumber(c.open), high: safeNumber(c.high), low: safeNumber(c.low), close: safeNumber(c.close), volume: safeNumber(c.volume)
  };
}
function sortCandles(arr) {
  return (arr || []).map(normalizeCandle).filter(c => c.time && c.high && c.low && c.open && c.close).sort((a, b) => a.time - b.time);
}
async function fetchCandles(symbol, tf, count = 260) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - tfSec(tf) * count;
  const key = `${symbol}:${tf}`;
  const cached = state.chartCache.get(key);
  if (cached && (Date.now() - cached.at) < Math.min(60000, tfSec(tf) * 1000 / 2)) return cached.candles;
  const json = await deltaPublic('/v2/history/candles', { symbol, resolution: tf, start, end });
  const candles = sortCandles(json.result || []);
  state.chartCache.set(key, { at: Date.now(), candles });
  return candles;
}

async function refreshProducts() {
  const productsJson = await deltaPublic('/v2/products', { contract_types: 'perpetual_futures', states: 'live', page_size: 200 });
  const products = Array.isArray(productsJson.result) ? productsJson.result : [];
  const bySymbol = {};
  for (const p of products) {
    const sym = p.symbol || p.ticker || p.product_symbol;
    if (!sym) continue;
    const type = p.contract_type || p.product_type || '';
    const stateValue = p.state || p.trading_status || '';
    if (String(type).includes('perpetual') || String(p.description || '').toLowerCase().includes('perpetual')) {
      bySymbol[sym] = p;
    } else if (!type && sym.endsWith('USD')) {
      bySymbol[sym] = p;
    }
    if (stateValue && !String(stateValue).toLowerCase().includes('live')) {
      // keep product, ticker availability will decide final skip
    }
  }
  state.products = bySymbol;
  return bySymbol;
}
async function refreshTickers() {
  const tickJson = await deltaPublic('/v2/tickers', { contract_types: 'perpetual_futures' });
  const arr = Array.isArray(tickJson.result) ? tickJson.result : [];
  const bySymbol = {};
  for (const t of arr) {
    const sym = t.symbol || t.product_symbol || t.contract_symbol;
    if (sym) bySymbol[sym] = t;
  }
  state.tickers = bySymbol;
  return bySymbol;
}
function chooseAvailableSymbols(products, tickers) {
  const chosen = [];
  const addAsset = (asset, tier) => {
    const candidates = settings.symbols?.candidates?.[asset] || SYMBOL_CANDIDATES[asset] || [`${asset}USD`];
    let symbol = candidates.find(s => products[s] || tickers[s]) || candidates[0];
    const available = !!(products[symbol] || tickers[symbol]);
    chosen.push({ asset, tier, symbol, available });
  };
  for (const a of TIER1) addAsset(a, 'Tier 1');
  for (const a of TIER2) addAsset(a, 'Tier 2');
  return chosen;
}

function ema(values, period) {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    const v = Number(values[i]);
    prev = Number.isFinite(v) ? (v * k + prev * (1 - k)) : prev;
    out[i] = prev;
  }
  return out;
}
function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = safeNumber(values[i]);
    sum += v;
    if (i >= period) sum -= safeNumber(values[i - period]);
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}
function atr(candles, period = 14) {
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  return ema(tr, period);
}
function recentHigh(candles, lookback = 20) {
  const s = candles.slice(-lookback);
  return Math.max(...s.map(c => c.high));
}
function recentLow(candles, lookback = 20) {
  const s = candles.slice(-lookback);
  return Math.min(...s.map(c => c.low));
}
function trendQuality(candles, lookback = 24) {
  if (candles.length < lookback + 2) return 0;
  const s = candles.slice(-lookback);
  const net = Math.abs(s[s.length - 1].close - s[0].close);
  let pathLen = 0;
  for (let i = 1; i < s.length; i++) pathLen += Math.abs(s[i].close - s[i - 1].close);
  return pathLen ? net / pathLen : 0;
}

function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return out;
}
function compactDirection(side) { return side === 'LONG' ? 'BULLISH' : 'BEARISH'; }
function oppositeDirection(side) { return side === 'LONG' ? 'BEARISH' : 'BULLISH'; }
function directionMatches(side, direction) { return String(direction || '').toUpperCase().includes(compactDirection(side)); }
function directionOpposes(side, direction) { return String(direction || '').toUpperCase().includes(oppositeDirection(side)); }
function macdState(candles, fast = 12, slow = 26, signalPeriod = 9) {
  const closed = candles.slice(0, -1).length >= slow + signalPeriod + 5 ? candles.slice(0, -1) : candles;
  const closes = closed.map(c => c.close);
  if (closes.length < slow + signalPeriod + 5) return { direction: 'NEUTRAL', color: 'GRAY', line: null, signal: null, histogram: null, histogramPrev: null, fluctuation: 'INSUFFICIENT_DATA' };
  const fastE = ema(closes, fast), slowE = ema(closes, slow);
  const macdLine = closes.map((_, i) => (fastE[i] !== null && slowE[i] !== null) ? fastE[i] - slowE[i] : null);
  const usable = macdLine.map(v => v === null ? 0 : v);
  const signalLine = ema(usable, signalPeriod);
  const line = macdLine.at(-1), sig = signalLine.at(-1), prevLine = macdLine.at(-2), prevSig = signalLine.at(-2);
  const hist = line - sig;
  const prevHist = prevLine - prevSig;
  const color = hist > 0 ? 'GREEN' : hist < 0 ? 'RED' : 'GRAY';
  const lineRelation = line > sig ? 'ABOVE_SIGNAL' : line < sig ? 'BELOW_SIGNAL' : 'ON_SIGNAL';
  const slope = line > prevLine ? 'RISING' : line < prevLine ? 'FALLING' : 'FLAT';
  const histFlow = hist > prevHist ? 'EXPANDING_UP' : hist < prevHist ? 'EXPANDING_DOWN' : 'FLAT';
  let direction = 'NEUTRAL';
  if (line > sig && hist > 0 && line >= prevLine) direction = 'BULLISH';
  else if (line < sig && hist < 0 && line <= prevLine) direction = 'BEARISH';
  else if (hist > 0 && hist > prevHist) direction = 'BULLISH_SOFT';
  else if (hist < 0 && hist < prevHist) direction = 'BEARISH_SOFT';
  else direction = 'NEUTRAL_MIXED';
  return { direction, color, line: round(line, 8), signal: round(sig, 8), histogram: round(hist, 8), histogramPrev: round(prevHist, 8), lineRelation, slope, histFlow, fluctuation: `${color}_${lineRelation}_${slope}_${histFlow}` };
}
function heikinAshiSeries(candles) {
  const out = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    out.push({ time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose });
  }
  return out;
}
function heikinState(candles) {
  const closed = candles.slice(0, -1).length >= 5 ? candles.slice(0, -1) : candles;
  if (closed.length < 5) return { direction: 'NEUTRAL', candle: 'NA', switched: false };
  const ha = heikinAshiSeries(closed);
  const last = ha.at(-1), prev = ha.at(-2);
  const bullish = last.close > last.open;
  const bearish = last.close < last.open;
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const body = Math.abs(last.close - last.open) || 1e-9;
  let candle = 'DOJI';
  if (bullish && lowerWick <= body * 0.25) candle = 'BULLISH_STRONG';
  else if (bullish) candle = 'BULLISH';
  else if (bearish && upperWick <= body * 0.25) candle = 'BEARISH_STRONG';
  else if (bearish) candle = 'BEARISH';
  const prevDir = prev.close > prev.open ? 'BULLISH' : prev.close < prev.open ? 'BEARISH' : 'NEUTRAL';
  const direction = bullish ? 'BULLISH' : bearish ? 'BEARISH' : 'NEUTRAL';
  return { direction, candle, switched: direction !== 'NEUTRAL' && prevDir !== 'NEUTRAL' && direction !== prevDir, open: round(last.open, 6), close: round(last.close, 6), upperWick: round(upperWick, 6), lowerWick: round(lowerWick, 6) };
}
function emaTrendState(candles) {
  const closed = candles.slice(0, -1).length >= 80 ? candles.slice(0, -1) : candles;
  const closes = closed.map(c => c.close);
  if (closes.length < 80) return { direction: 'NEUTRAL', priceZone: 'UNKNOWN' };
  const e20Arr = ema(closes, 20), e50Arr = ema(closes, 50), e200Arr = ema(closes, 200);
  const e20 = e20Arr.at(-1), e50 = e50Arr.at(-1), e200 = e200Arr.at(-1), last = closes.at(-1);
  const e20Prev = e20Arr.at(-4) ?? e20;
  const channelLow = Math.min(e20, e50), channelHigh = Math.max(e20, e50);
  let direction = 'NEUTRAL';
  if (last >= channelLow && e20 >= e50 && e50 >= e200 && e20 >= e20Prev) direction = 'BULLISH';
  else if (last <= channelHigh && e20 <= e50 && e50 <= e200 && e20 <= e20Prev) direction = 'BEARISH';
  const priceZone = last > channelHigh ? 'ABOVE_EMA_CHANNEL' : last < channelLow ? 'BELOW_EMA_CHANNEL' : 'INSIDE_EMA_CHANNEL';
  return { direction, priceZone, ema20: round(e20, 6), ema50: round(e50, 6), ema200: round(e200, 6), slope20: e20 >= e20Prev ? 'RISING' : 'FALLING' };
}
function qqeModState(candles, type = 'Line & Bar') {
  const closed = candles.slice(0, -1).length >= 90 ? candles.slice(0, -1) : candles;
  const closes = closed.map(c => c.close);
  if (closes.length < 80) return { direction: 'NEUTRAL', line: null, bar: 'NA', mode: 'INSUFFICIENT_DATA' };
  const RSI_Period = 6, SF = 5, QQE = 3, QQE2 = 1.61, ThreshHold2 = 3, BBLength = 50, BBMult = 0.35;
  const Wilders_Period = RSI_Period * 2 - 1;
  const rsi1 = rsi(closes, RSI_Period).map(v => v ?? 50);
  const rsiMa1 = ema(rsi1, SF);
  const atrRsi1 = rsiMa1.map((v, i) => i === 0 ? 0 : Math.abs(v - rsiMa1[i - 1]));
  const maAtrRsi1 = ema(atrRsi1, Wilders_Period);
  const dar1 = ema(maAtrRsi1, Wilders_Period).map(v => v * QQE);
  const tl1 = qqeTrailingLine(rsiMa1, dar1);
  const baseSeries = tl1.map(v => (v ?? 50) - 50);
  const basis = sma(baseSeries, BBLength);
  const upper = new Array(baseSeries.length).fill(null), lower = new Array(baseSeries.length).fill(null);
  for (let i = BBLength - 1; i < baseSeries.length; i++) {
    const slice = baseSeries.slice(i - BBLength + 1, i + 1);
    const mean = basis[i];
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / BBLength;
    const dev = Math.sqrt(variance) * BBMult;
    upper[i] = mean + dev; lower[i] = mean - dev;
  }
  const rsi2 = rsi(closes, RSI_Period).map(v => v ?? 50);
  const rsiMa2 = ema(rsi2, SF);
  const atrRsi2 = rsiMa2.map((v, i) => i === 0 ? 0 : Math.abs(v - rsiMa2[i - 1]));
  const maAtrRsi2 = ema(atrRsi2, Wilders_Period);
  const dar2 = ema(maAtrRsi2, Wilders_Period).map(v => v * QQE2);
  const tl2 = qqeTrailingLine(rsiMa2, dar2);
  const idx = closes.length - 1;
  const qqeline = (tl2[idx] ?? 50) - 50;
  const greenBar = (rsiMa2[idx] - 50 > ThreshHold2) && (rsiMa1[idx] - 50 > (upper[idx] ?? Infinity));
  const redBar = (rsiMa2[idx] - 50 < -ThreshHold2) && (rsiMa1[idx] - 50 < (lower[idx] ?? -Infinity));
  const lineBull = qqeline > 0, lineBear = qqeline < 0;
  let isBull = false, isBear = false;
  if (type === 'Line') { isBull = lineBull; isBear = lineBear; }
  else if (type === 'Bar') { isBull = greenBar; isBear = redBar; }
  else { isBull = lineBull && greenBar; isBear = lineBear && redBar; }
  return { direction: isBull ? 'BULLISH' : isBear ? 'BEARISH' : 'NEUTRAL', line: round(qqeline, 6), bar: greenBar ? 'BLUE' : redBar ? 'RED' : 'GRAY', mode: type };
}
function qqeTrailingLine(rsIndex, deltaFastAtrRsi) {
  const longband = new Array(rsIndex.length).fill(0);
  const shortband = new Array(rsIndex.length).fill(0);
  const trend = new Array(rsIndex.length).fill(1);
  const tl = new Array(rsIndex.length).fill(null);
  for (let i = 0; i < rsIndex.length; i++) {
    const rs = rsIndex[i] ?? 50;
    const d = deltaFastAtrRsi[i] ?? 0;
    const newShort = rs + d;
    const newLong = rs - d;
    if (i === 0) { longband[i] = newLong; shortband[i] = newShort; trend[i] = 1; tl[i] = longband[i]; continue; }
    longband[i] = rsIndex[i - 1] > longband[i - 1] && rs > longband[i - 1] ? Math.max(longband[i - 1], newLong) : newLong;
    shortband[i] = rsIndex[i - 1] < shortband[i - 1] && rs < shortband[i - 1] ? Math.min(shortband[i - 1], newShort) : newShort;
    const crossShort = rsIndex[i - 1] <= shortband[i - 1] && rs > shortband[i - 1];
    const crossLong = longband[i - 1] <= rsIndex[i - 1] && longband[i - 1] > rs;
    trend[i] = crossShort ? 1 : crossLong ? -1 : trend[i - 1];
    tl[i] = trend[i] === 1 ? longband[i] : shortband[i];
  }
  return tl;
}
function trendItems(parts) {
  return [
    ['4H bias', parts.bias4h], ['1H bias', parts.bias1h], ['15M EMA channel', parts.ema15?.direction], ['1H EMA channel', parts.ema1h?.direction],
    ['15M MACD', parts.macd15?.direction], ['1H MACD', parts.macd1h?.direction], ['15M Heikin Ashi', parts.ha15?.direction], ['QQE Mod', parts.qqe15?.direction]
  ];
}
function buildMarketStack(parts) {
  const items = trendItems(parts);
  let bull = 0, bear = 0, neutral = 0;
  for (const [, value] of items) {
    const v = String(value || 'NEUTRAL').toUpperCase();
    if (v.includes('BULL')) bull++;
    else if (v.includes('BEAR')) bear++;
    else neutral++;
  }
  let marketDirection = 'NEUTRAL';
  if (bull >= 4 && bull >= bear + 2) marketDirection = 'BULLISH';
  else if (bear >= 4 && bear >= bull + 2) marketDirection = 'BEARISH';
  const details = items.map(([name, value]) => {
    const v = String(value || 'NEUTRAL').toUpperCase();
    let vote = 'NEUTRAL';
    if (marketDirection !== 'NEUTRAL' && v.includes(marketDirection)) vote = 'AGREE';
    else if (marketDirection === 'BULLISH' && v.includes('BEAR')) vote = 'OPPOSE';
    else if (marketDirection === 'BEARISH' && v.includes('BULL')) vote = 'OPPOSE';
    return { name, value: value || 'NEUTRAL', vote };
  });
  return { required: marketDirection, marketDirection, agree: marketDirection === 'BULLISH' ? bull : marketDirection === 'BEARISH' ? bear : 0, oppose: marketDirection === 'BULLISH' ? bear : marketDirection === 'BEARISH' ? bull : 0, neutral, bull, bear, trendAligned: marketDirection !== 'NEUTRAL', blockingReasons: [], details };
}
function buildTrendStack(side, parts) {
  const required = compactDirection(side);
  const opposite = oppositeDirection(side);
  const items = trendItems(parts);
  let agree = 0, oppose = 0, neutral = 0;
  const details = items.map(([name, value]) => {
    const v = String(value || 'NEUTRAL').toUpperCase();
    let vote = 'NEUTRAL';
    if (v.includes(required)) { agree++; vote = 'AGREE'; }
    else if (v.includes(opposite)) { oppose++; vote = 'OPPOSE'; }
    else neutral++;
    return { name, value: value || 'NEUTRAL', vote };
  });
  const macdHardOpposite = directionOpposes(side, parts.macd15?.direction) && directionOpposes(side, parts.macd1h?.direction);
  const macdColorOpposite = (side === 'LONG' && parts.macd15?.color === 'RED' && parts.macd15?.lineRelation === 'BELOW_SIGNAL') || (side === 'SHORT' && parts.macd15?.color === 'GREEN' && parts.macd15?.lineRelation === 'ABOVE_SIGNAL');
  const emaHardOpposite = directionOpposes(side, parts.ema15?.direction) && directionOpposes(side, parts.ema1h?.direction);
  const htfHardOpposite = directionOpposes(side, parts.bias4h) && directionOpposes(side, parts.bias1h);
  const haHardOpposite = directionOpposes(side, parts.ha15?.direction) && (macdColorOpposite || emaHardOpposite || htfHardOpposite);
  const trendAligned = agree >= 4 && agree > oppose;
  const blockingReasons = [];
  if (htfHardOpposite) blockingReasons.push('HTF_TREND_OPPOSITE');
  if (emaHardOpposite) blockingReasons.push('EMA_CHANNEL_OPPOSITE');
  if (macdHardOpposite || macdColorOpposite) blockingReasons.push('MACD_LINE_HISTOGRAM_OPPOSITE');
  if (haHardOpposite) blockingReasons.push('HEIKIN_ASHI_WITH_TREND_OPPOSITE');
  return { required, agree, oppose, neutral, trendAligned, blockingReasons, alignmentWarning: trendAligned ? null : 'TREND_STACK_WEAK_NOT_BLOCKED', details };
}
function getBias(candles) {
  if (candles.length < 80) return 'NEUTRAL';
  const closed = candles.slice(0, -1).length >= 80 ? candles.slice(0, -1) : candles;
  const closes = closed.map(c => c.close);
  const e20Arr = ema(closes, 20), e50Arr = ema(closes, 50), e200Arr = ema(closes, 200);
  const e20 = e20Arr.at(-1), e50 = e50Arr.at(-1), e200 = e200Arr.at(-1);
  const e20Prev = e20Arr.at(-4) ?? e20;
  const last = closes.at(-1);
  if (last > e20 && e20 > e50 && e50 > e200 && e20 >= e20Prev) return 'BULLISH';
  if (last < e20 && e20 < e50 && e50 < e200 && e20 <= e20Prev) return 'BEARISH';
  return 'NEUTRAL';
}
function previousDayLevels(daily) {
  const closed = daily.slice(0, -1);
  const prev = closed.at(-1) || daily.at(-2) || daily.at(-1);
  const current = daily.at(-1);
  if (!prev) return { pdh: null, pdl: null, currentRange: null, adr: null, adrUsedPct: null };
  const ranges = closed.slice(-15, -1).map(c => c.high - c.low).filter(x => x > 0);
  const adr = ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : prev.high - prev.low;
  const currentRange = current ? current.high - current.low : 0;
  return { pdh: prev.high, pdl: prev.low, currentRange, adr, adrUsedPct: adr ? (currentRange / adr) * 100 : null };
}
function volumeImpulse(candles, index) {
  const vols = candles.map(c => c.volume || 0);
  const ma = sma(vols, 20);
  if (!ma[index]) return false;
  return vols[index] > ma[index] * 1.2;
}
function near(a, b, tolerance) { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance; }
function zoneEntered(candle, zoneLow, zoneHigh) { return candle.low <= zoneHigh && candle.high >= zoneLow; }

function detectOrderBlock(candles, side) {
  const closed = candles.slice(0, -1);
  if (closed.length < 60) return null;
  const maxLookback = Math.min(72, closed.length - 8);
  for (let back = 2; back < maxLookback; back++) {
    const i = closed.length - 1 - back;
    const c = closed[i], prev = closed[i - 1], prev2 = closed[i - 2], c1 = closed[i + 1], c2 = closed[i + 2];
    if (!c || !prev || !c1 || !c2) continue;
    const before = closed.slice(Math.max(0, i - 10), i);
    const after = closed.slice(i + 1, Math.min(closed.length, i + 7));
    if (before.length < 5 || after.length < 3) continue;
    const zoneLow = Math.min(c.open, c.close, c.low);
    const zoneHigh = Math.max(c.open, c.close, c.high);
    const enteredBeforeCurrentRetest = closed.slice(i + 3, -3).some(x => zoneEntered(x, zoneLow, zoneHigh));
    if (enteredBeforeCurrentRetest) continue;
    if (side === 'LONG') {
      const isLastSell = c.close < c.open;
      const sweep = c.low < Math.min(prev.low, prev2?.low ?? prev.low);
      const fvg = c.high < c2.low;
      const impulse = c2.close > Math.max(c.high, c1.high) && c1.close > c.open;
      const bosLevel = Math.max(...before.map(x => x.high));
      const bos = after.some(x => x.close > bosLevel);
      if (isLastSell && fvg && impulse && bos) {
        return { side, index: i, time: c.time, zoneLow, zoneHigh, mid: (zoneLow + zoneHigh) / 2, sweepLow: sweep ? c.low : null, sweepHigh: null, hasSweep: !!sweep, hasFvg: true, hasBosChoch: true, fvgLow: c.high, fvgHigh: c2.low, bosLevel, candidate: c, impulseIndex: i + 2, strength: Math.abs(c2.close - c.close) / Math.max(1e-9, c.high - c.low) };
      }
    } else {
      const isLastBuy = c.close > c.open;
      const sweep = c.high > Math.max(prev.high, prev2?.high ?? prev.high);
      const fvg = c.low > c2.high;
      const impulse = c2.close < Math.min(c.low, c1.low) && c1.close < c.open;
      const bosLevel = Math.min(...before.map(x => x.low));
      const bos = after.some(x => x.close < bosLevel);
      if (isLastBuy && fvg && impulse && bos) {
        return { side, index: i, time: c.time, zoneLow, zoneHigh, mid: (zoneLow + zoneHigh) / 2, sweepLow: null, sweepHigh: sweep ? c.high : null, hasSweep: !!sweep, hasFvg: true, hasBosChoch: true, fvgLow: c2.high, fvgHigh: c.low, bosLevel, candidate: c, impulseIndex: i + 2, strength: Math.abs(c.close - c2.close) / Math.max(1e-9, c.high - c.low) };
      }
    }
  }
  return null;
}

function retestState(candles, ob, side) {
  const closed = candles.slice(0, -1);
  const last = closed.at(-1) || candles.at(-1);
  if (!last || !ob) return { retestSeen: false, confirmed: false, candlesAgo: null };
  const recent = closed.slice(-3);
  const idx = recent.findIndex(x => zoneEntered(x, ob.zoneLow, ob.zoneHigh));
  const retestSeen = idx >= 0;
  const candlesAgo = idx >= 0 ? recent.length - 1 - idx : null;
  const body = Math.abs(last.close - last.open);
  const range = Math.max(1e-9, last.high - last.low);
  const strongBody = body >= range * 0.35;
  const zoneRange = Math.max(1e-9, ob.zoneHigh - ob.zoneLow);
  const reclaimed = side === 'LONG' ? last.close >= ob.zoneLow + zoneRange * 0.35 : last.close <= ob.zoneHigh - zoneRange * 0.35;
  const confirmed = side === 'LONG'
    ? retestSeen && last.close > last.open && reclaimed && strongBody
    : retestSeen && last.close < last.open && reclaimed && strongBody;
  return { retestSeen, confirmed, candlesAgo };
}
function confirmationForRetest(candles, ob, side) {
  return retestState(candles, ob, side).confirmed;
}
function priceNearZone(price, ob, atrValue, settingsRisk, candles, side) {
  if (!price || !ob) return false;
  const tolerance = Math.max((atrValue || price * 0.002) * settingsRisk.entryToleranceAtr, price * 0.0015);
  const currentNear = price >= ob.zoneLow - tolerance && price <= ob.zoneHigh + tolerance;
  if (currentNear) return true;
  const rs = candles && side ? retestState(candles, ob, side) : { retestSeen: false };
  const maxChase = Math.max((atrValue || price * 0.002) * 0.9, price * 0.0025);
  if (side === 'LONG') return !!rs.retestSeen && price <= ob.zoneHigh + maxChase;
  if (side === 'SHORT') return !!rs.retestSeen && price >= ob.zoneLow - maxChase;
  return false;
}

function emaDirectionalSupport(side, emaState) {
  if (!emaState) return false;
  if (directionMatches(side, emaState.direction)) return true;
  const zone = String(emaState.priceZone || '').toUpperCase();
  const slope = String(emaState.slope20 || '').toUpperCase();
  const e20 = safeNumber(emaState.ema20);
  const e50 = safeNumber(emaState.ema50);
  if (side === 'LONG') return slope === 'RISING' && e20 >= e50 && (zone === 'ABOVE_EMA_CHANNEL' || zone === 'INSIDE_EMA_CHANNEL');
  return slope === 'FALLING' && e20 <= e50 && (zone === 'BELOW_EMA_CHANNEL' || zone === 'INSIDE_EMA_CHANNEL');
}


function orderedTradeTargets(side, entry, sl, tp1, tp2) {
  entry = safeNumber(entry);
  sl = safeNumber(sl);
  const risk = Math.abs(entry - sl);
  if (!entry || !sl || !risk) return { tp1, tp2, valid: false, reason: 'INVALID_ENTRY_OR_SL' };
  const isLong = side === 'LONG';
  const minFinalR = Math.max(2, safeNumber(settings?.risk?.minRR, 1.8));
  const fallback1 = isLong ? entry + risk : entry - risk;
  const fallback2 = isLong ? entry + risk * minFinalR : entry - risk * minFinalR;
  const minGap = Math.max(risk * 0.05, Math.abs(entry) * 0.00005, 1e-8);
  const raw = [tp1, tp2, fallback1, fallback2]
    .map(x => safeNumber(x, NaN))
    .filter(x => Number.isFinite(x) && (isLong ? x > entry + minGap : x < entry - minGap));
  raw.sort((a, b) => isLong ? a - b : b - a);
  const unique = [];
  for (const x of raw) {
    if (!unique.some(y => Math.abs(y - x) <= minGap)) unique.push(x);
  }
  let first = unique[0] || fallback1;
  let second = unique.find(x => isLong ? x > first + minGap : x < first - minGap);
  if (!second) second = isLong ? first + Math.max(risk, minGap) : first - Math.max(risk, minGap);
  // Final guard: TP1 must always be closer to entry than TP2.
  if (isLong && !(entry < first && first < second)) {
    first = fallback1;
    second = Math.max(fallback2, first + risk);
  }
  if (!isLong && !(entry > first && first > second)) {
    first = fallback1;
    second = Math.min(fallback2, first - risk);
  }
  return { tp1: first, tp2: second, valid: true, reason: 'ORDERED_TARGETS_OK' };
}

function normalizeTradeTargetsInPlace(trade) {
  if (!trade || !trade.side) return false;
  const before1 = safeNumber(trade.tp1, NaN);
  const before2 = safeNumber(trade.tp2, NaN);
  const ordered = orderedTradeTargets(trade.side, trade.entry, trade.initialSl || trade.sl, trade.tp1, trade.tp2);
  if (!ordered.valid) return false;
  trade.tp1 = round(ordered.tp1, 8);
  trade.tp2 = round(ordered.tp2, 8);
  const changed = Math.abs(before1 - trade.tp1) > 1e-9 || Math.abs(before2 - trade.tp2) > 1e-9;
  if (changed) {
    trade.logs = trade.logs || [];
    trade.logs.push({ at: nowIso(), message: `TP targets normalized: TP1 is now the nearer target, TP2 is the farther target` });
    log('TARGET_FIX', `${trade.symbol || 'trade'} TP targets normalized`, { side: trade.side, entry: trade.entry, tp1: trade.tp1, tp2: trade.tp2 });
  }
  return changed;
}

function recentVolumeImpulse(candles, lookback = 3) {
  const closed = candles.slice(0, -1).length >= 30 ? candles.slice(0, -1) : candles;
  const vols = closed.map(c => c.volume || 0);
  const ma = sma(vols, 20);
  for (let i = Math.max(0, closed.length - lookback); i < closed.length; i++) {
    if (ma[i] && vols[i] > ma[i] * 1.15) return true;
  }
  return false;
}

function trendContinuationPlan(side, price, candles15, daily, ticker, assetTier, ema15) {
  const riskSettings = settings.risk;
  const closed = candles15.slice(0, -1).length >= 30 ? candles15.slice(0, -1) : candles15;
  const atr15 = atr(closed, 14).at(-1) || price * 0.005;
  const buffer = atr15 * riskSettings.atrBufferMult;
  const minRisk = atr15 * safeNumber(riskSettings.minSlAtrMult, 0.6);
  const maxRisk = atr15 * safeNumber(riskSettings.maxSlAtrMult, 4.5);
  const support = recentLow(closed, 14);
  const resistance = recentHigh(closed, 14);
  const dailyLevels = previousDayLevels(daily);
  let entry = price, sl, tp1, tp2, slReason;
  if (side === 'LONG') {
    const emaFloor = Math.min(safeNumber(ema15?.ema20, price), safeNumber(ema15?.ema50, price));
    let base = Math.min(support, emaFloor, price - atr15 * 0.75);
    sl = base - buffer;
    let riskDistance = entry - sl;
    if (riskDistance < minRisk) { sl = entry - minRisk; riskDistance = minRisk; }
    if (riskDistance > maxRisk) { sl = entry - maxRisk; riskDistance = maxRisk; }
    slReason = 'Trend-continuation SL below recent swing/EMA channel with ATR guard';
    const naturalTargets = [resistance, dailyLevels.pdh].filter(x => Number.isFinite(x) && x > entry + riskDistance * 0.7).sort((a,b)=>a-b);
    tp1 = naturalTargets[0] || entry + riskDistance;
    tp2 = Math.max(naturalTargets[1] || entry + riskDistance * Math.max(2, settings.risk.minRR), entry + riskDistance * Math.max(2, settings.risk.minRR));
  } else {
    const emaCeil = Math.max(safeNumber(ema15?.ema20, price), safeNumber(ema15?.ema50, price));
    let base = Math.max(resistance, emaCeil, price + atr15 * 0.75);
    sl = base + buffer;
    let riskDistance = sl - entry;
    if (riskDistance < minRisk) { sl = entry + minRisk; riskDistance = minRisk; }
    if (riskDistance > maxRisk) { sl = entry + maxRisk; riskDistance = maxRisk; }
    slReason = 'Trend-continuation SL above recent swing/EMA channel with ATR guard';
    const naturalTargets = [support, dailyLevels.pdl].filter(x => Number.isFinite(x) && x < entry - riskDistance * 0.7).sort((a,b)=>b-a);
    tp1 = naturalTargets[0] || entry - riskDistance;
    tp2 = Math.min(naturalTargets[1] || entry - riskDistance * Math.max(2, settings.risk.minRR), entry - riskDistance * Math.max(2, settings.risk.minRR));
  }
  const orderedTargets = orderedTradeTargets(side, entry, sl, tp1, tp2);
  tp1 = orderedTargets.tp1;
  tp2 = orderedTargets.tp2;
  const riskDistance = Math.abs(entry - sl);
  const rewardDistance = Math.abs(tp2 - entry);
  const rr = riskDistance ? rewardDistance / riskDistance : 0;
  const slQuality = riskDistance < atr15 * 0.25 ? 'BAD_TOO_CLOSE' : (riskDistance > atr15 * 5 ? 'WIDE' : 'GOOD_TREND_STRUCTURE');
  const leverage = Math.min(riskSettings.defaultLeverage, riskSettings.hardLeverageCap);
  const baseRiskPct = assetTier === 'Tier 2' ? riskSettings.tier2RiskPct : riskSettings.defaultRiskPct;
  const riskPct = baseRiskPct;
  const riskAmount = settings.wallet.botUsableAmount * riskPct / 100;
  const qty = riskDistance ? riskAmount / riskDistance : 0;
  const notional = qty * entry;
  const marginUsed = notional / leverage;
  return { entry, sl, tp1, tp2, rr, slQuality, slReason, atr15, riskDistance, riskPct, riskAmount, qty, notional, marginUsed, leverage };
}

function scoreTrendContinuation(side, ctx) {
  let score = 0;
  const reasons = [];
  function add(points, label, ok) { if (ok) { score += points; reasons.push(`+${points} ${label}`); } }
  add(2, 'market stack direction confirmed', ctx.marketDirectionOk);
  add(2, 'trend stack agrees without hard conflict', ctx.trendStackOk);
  add(2, 'EMA channel supports continuation', ctx.emaAligned);
  add(2, 'MACD line + histogram color aligned', ctx.macdAligned);
  add(2, 'Heikin Ashi momentum confirms', ctx.haAligned);
  add(1, 'QQE Mod confirms momentum', ctx.qqeAligned);
  add(1, 'trend quality passes chop guard', ctx.tqOk);
  add(1, 'recent volume impulse', ctx.volumeImpulse);
  add(1, 'RR and ADR filters passed', ctx.rrOk && ctx.adrOk);
  return { score, scoreMax: 14, reasons };
}

function tryTrendContinuationFallback(ctx) {
  const { assetRow, symbol, price, candles15, daily, ticker, trend, tq, spreadPct, adrOk, dailyLevels, baseIndicators, bias1h, bias4h, ema15, ema1h, macd15, macd1h, ha15, qqe15, marketStack, extremeChop } = ctx;
  if (!settings.strategy?.allowTrendContinuationFallback) return null;
  const side = marketStack?.marketDirection === 'BULLISH' ? 'LONG' : marketStack?.marketDirection === 'BEARISH' ? 'SHORT' : null;
  if (!side) return null;
  const trendStack = buildTrendStack(side, { bias1h, bias4h, ema15, ema1h, macd15, macd1h, ha15, qqe15 });
  const macdAligned = directionMatches(side, macd15.direction) && !directionOpposes(side, macd1h.direction);
  const haAligned = directionMatches(side, ha15.direction);
  const qqeAligned = directionMatches(side, qqe15.direction);
  const emaAligned = emaDirectionalSupport(side, ema15) || emaDirectionalSupport(side, ema1h);
  const tqOk = !extremeChop && tq >= (clamp(safeNumber(settings.risk.minTrendQuality, 30), 0, 100) / 100);
  const plan = trendContinuationPlan(side, price, candles15, daily, ticker, assetRow.tier, ema15);
  const rrOk = plan.rr >= settings.risk.minRR;
  const volOk = recentVolumeImpulse(candles15, 3);
  const marketDirectionOk = marketStack.marketDirection === compactDirection(side) && marketStack.agree >= 4 && marketStack.oppose <= 1;
  const trendStackOk = trendStack.agree >= 4 && trendStack.oppose <= 1 && !trendStack.blockingReasons.length;
  const scorePack = scoreTrendContinuation(side, { marketDirectionOk, trendStackOk, emaAligned, macdAligned, haAligned, qqeAligned, tqOk, volumeImpulse: volOk, rrOk, adrOk });
  let decision = 'WAIT';
  let action = 'WAIT_MORE_CONFLUENCE';
  let reason = 'NO_TRADE: trend continuation fallback not fully aligned';
  if (trendStack.blockingReasons.length) { decision = 'SKIP'; action = 'NO_TRADE'; reason = 'TREND_STACK_CONFLICT: ' + trendStack.blockingReasons.join(','); }
  else if (!marketDirectionOk || !trendStackOk) { reason = 'WAIT_TREND_STACK: market stack not strong enough for continuation'; }
  else if (!emaAligned) { reason = 'WAIT_EMA_ALIGNMENT: EMA channel does not support continuation'; }
  else if (!macdAligned) { reason = 'WAIT_MACD_ALIGNMENT: MACD line/histogram not aligned'; }
  else if (!haAligned) { reason = 'WAIT_HA_ALIGNMENT: Heikin Ashi has not confirmed continuation'; }
  else if (!tqOk) { action = 'WAIT_TREND_QUALITY'; reason = 'WAIT_TREND_QUALITY: trend quality below chop guard'; }
  else if (!rrOk) { decision = 'SKIP'; action = 'NO_TRADE'; reason = 'RR_BELOW_MIN'; }
  else if (scorePack.score < settings.risk.paperMinScore) { reason = 'SCORE_BELOW_PAPER_MIN: continuation confluence not enough'; }
  else { decision = side; action = settings.mode === 'PAPER' ? 'PAPER_RECOMMEND_OR_AUTO_IF_BOT_ON' : 'REVIEW_ONLY'; reason = 'TREND_CONTINUATION_CONFLUENCE_CONFIRMED: no fresh OB required'; }
  return {
    symbol, asset: assetRow.asset, tier: assetRow.tier,
    decision, trend, setup: 'V7-TREND-CONTINUATION-CONFLUENCE', side,
    entry: round(plan.entry, 6), sl: round(plan.sl, 6), tp1: round(plan.tp1, 6), tp2: round(plan.tp2, 6),
    rr: round(plan.rr, 2), score: scorePack.score, scoreMax: scorePack.scoreMax, slQuality: plan.slQuality, reason, action, mode: settings.mode,
    price: round(price, 6), spreadPct: round(spreadPct, 4), tq: round(tq, 3), adrUsedPct: round(dailyLevels.adrUsedPct, 2),
    orderBlock: null,
    indicators: { ...baseIndicators, trendStack, marketStack, locationConfluence: false, volumeImpulse: !!volOk, retestSeen: false, retestConfirmed: false, trendAlignmentWarning: trendStack.alignmentWarning },
    position: { qty: round(plan.qty, 6), notional: round(plan.notional, 2), marginUsed: round(plan.marginUsed, 2), riskAmount: round(plan.riskAmount, 2), riskPct: plan.riskPct, leverage: plan.leverage },
    scoreReasons: scorePack.reasons,
    slReason: plan.slReason
  };
}

function structuralTradePlan(side, price, ob, candles15, candles1h, daily, ticker, assetTier) {
  const riskSettings = settings.risk;
  const atr15 = atr(candles15, 14).at(-1) || price * 0.005;
  const buffer = atr15 * riskSettings.atrBufferMult;
  const recentSupport = recentLow(candles15, 24);
  const recentResistance = recentHigh(candles15, 24);
  const dailyLevels = previousDayLevels(daily);
  let entry = price;
  let sl, tp1, tp2, slReason;
  if (side === 'LONG') {
    const base = Math.min(ob.zoneLow, ob.sweepLow || ob.zoneLow, recentSupport);
    sl = base - buffer;
    slReason = 'Below OB/sweep low/support + ATR buffer';
    const riskUnit = entry - sl;
    const candidates = [recentResistance, dailyLevels.pdh].filter(x => Number.isFinite(x) && x > entry + riskUnit * 0.6).sort((a, b) => a - b);
    tp1 = candidates[0] || entry + riskUnit;
    tp2 = Math.max(candidates[1] || entry + riskUnit * 2, entry + riskUnit * 2);
  } else {
    const base = Math.max(ob.zoneHigh, ob.sweepHigh || ob.zoneHigh, recentResistance);
    sl = base + buffer;
    slReason = 'Above OB/sweep high/resistance + ATR buffer';
    const riskUnit = sl - entry;
    const candidates = [recentSupport, dailyLevels.pdl].filter(x => Number.isFinite(x) && x < entry - riskUnit * 0.6).sort((a, b) => b - a);
    tp1 = candidates[0] || entry - riskUnit;
    tp2 = Math.min(candidates[1] || entry - riskUnit * 2, entry - riskUnit * 2);
  }
  const orderedTargets = orderedTradeTargets(side, entry, sl, tp1, tp2);
  tp1 = orderedTargets.tp1;
  tp2 = orderedTargets.tp2;
  const riskDistance = Math.abs(entry - sl);
  const rewardDistance = Math.abs(tp2 - entry);
  const rr = riskDistance ? rewardDistance / riskDistance : 0;
  const slQuality = riskDistance < atr15 * 0.25 ? 'BAD_TOO_CLOSE' : (riskDistance > atr15 * 5 ? 'WIDE' : 'GOOD_STRUCTURE');
  const leverage = Math.min(riskSettings.defaultLeverage, riskSettings.hardLeverageCap);
  const baseRiskPct = assetTier === 'Tier 2' ? riskSettings.tier2RiskPct : riskSettings.defaultRiskPct;
  const riskPct = baseRiskPct;
  const riskAmount = settings.wallet.botUsableAmount * riskPct / 100;
  const qty = riskDistance ? riskAmount / riskDistance : 0;
  const notional = qty * entry;
  const marginUsed = notional / leverage;
  return { entry, sl, tp1, tp2, rr, slQuality, slReason, atr15, riskDistance, riskPct, riskAmount, qty, notional, marginUsed, leverage };
}

function scoreSignal(side, ctx) {
  let score = 0;
  const reasons = [];
  function add(points, label, ok) { if (ok) { score += points; reasons.push(`+${points} ${label}`); } }
  add(2, 'valid fresh order block', !!ctx.ob);
  add(1, 'liquidity sweep / inducement', !!ctx.hasSweep || !!ctx.locationConfluence);
  add(2, 'imbalance/FVG + BOS/CHOCH closed', !!ctx.ob);
  add(2, 'first retest + close confirmation', ctx.confirmed);
  add(2, 'HTF + LTF trend-stack agreement', ctx.trendAligned);
  add(2, 'EMA20/50/200 channel aligned', ctx.emaAligned);
  add(2, 'MACD line + histogram color aligned', ctx.macdAligned);
  add(1, 'Heikin Ashi confirms momentum', ctx.haAligned);
  add(1, 'QQE Mod / volume soft confirmation', ctx.qqeAligned || ctx.volumeImpulse);
  add(1, 'RR and ADR filters passed', ctx.rrOk && ctx.adrOk);
  return { score, scoreMax: 16, reasons };
}

function closedOnly(candles, min = 2) {
  const closed = Array.isArray(candles) ? candles.slice(0, -1) : [];
  return closed.length >= min ? closed : (Array.isArray(candles) ? candles : []);
}
function lastClosedCandle(candles) { return closedOnly(candles, 1).at(-1) || null; }

function cciSeries(candles, period = 20) {
  const closed = closedOnly(candles, period + 2);
  const tp = closed.map(c => (c.high + c.low + c.close) / 3);
  const out = new Array(tp.length).fill(null);
  for (let i = period - 1; i < tp.length; i++) {
    const slice = tp.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const md = slice.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
    out[i] = md ? (tp[i] - mean) / (0.015 * md) : 0;
  }
  return out;
}
function cciState(candles, period = 20, recentBars = 4) {
  const arr = cciSeries(candles, period);
  const last = arr.at(-1), prev = arr.at(-2);
  if (!Number.isFinite(last) || !Number.isFinite(prev)) return { direction: 'NEUTRAL', value: null, previous: null, entryLong: false, entryShort: false, biasLong: false, biasShort: false, reason: 'CCI_INSUFFICIENT_DATA' };
  let lastZeroUp = -1, lastZeroDown = -1, recentPlus100 = false, recentMinus100 = false;
  const start = Math.max(1, arr.length - 40);
  for (let i = start; i < arr.length; i++) {
    if (!Number.isFinite(arr[i]) || !Number.isFinite(arr[i - 1])) continue;
    if (arr[i - 1] <= 0 && arr[i] > 0) lastZeroUp = i;
    if (arr[i - 1] >= 0 && arr[i] < 0) lastZeroDown = i;
    if (i >= arr.length - recentBars && arr[i - 1] <= 100 && arr[i] > 100) recentPlus100 = true;
    if (i >= arr.length - recentBars && arr[i - 1] >= -100 && arr[i] < -100) recentMinus100 = true;
  }
  const biasLong = lastZeroUp > lastZeroDown && last > 0;
  const biasShort = lastZeroDown > lastZeroUp && last < 0;
  const direction = last > 100 ? 'BULLISH_ENTRY_ZONE' : last < -100 ? 'BEARISH_ENTRY_ZONE' : last > 0 ? 'BULLISH_BIAS' : last < 0 ? 'BEARISH_BIAS' : 'NEUTRAL';
  return {
    direction, value: round(last, 2), previous: round(prev, 2),
    crossedAboveZero: prev <= 0 && last > 0,
    crossedBelowZero: prev >= 0 && last < 0,
    crossedAbove100: prev <= 100 && last > 100,
    crossedBelowMinus100: prev >= -100 && last < -100,
    recentCrossAbove100: recentPlus100,
    recentCrossBelowMinus100: recentMinus100,
    biasLong, biasShort,
    entryLong: biasLong && recentPlus100,
    entryShort: biasShort && recentMinus100,
    reason: `${direction}_VALUE_${round(last, 2)}`
  };
}

function macdTranscriptState(candles, fast = 12, slow = 26, signalPeriod = 9, recentBars = 4) {
  const closed = closedOnly(candles, slow + signalPeriod + 5);
  const closes = closed.map(c => c.close);
  if (closes.length < slow + signalPeriod + 5) return { direction: 'NEUTRAL', color: 'GRAY', reason: 'MACD_INSUFFICIENT_DATA' };
  const fastE = ema(closes, fast), slowE = ema(closes, slow);
  const macdLine = closes.map((_, i) => fastE[i] - slowE[i]);
  const signalLine = ema(macdLine.map(v => Number.isFinite(v) ? v : 0), signalPeriod);
  const idx = closes.length - 1;
  const line = macdLine[idx], sig = signalLine[idx], prevLine = macdLine[idx - 1], prevSig = signalLine[idx - 1];
  const hist = line - sig, prevHist = prevLine - prevSig;
  let recentCrossUp = false, recentCrossDown = false, histFlipGreenRecent = false, histFlipRedRecent = false;
  for (let i = Math.max(1, idx - recentBars + 1); i <= idx; i++) {
    const h = macdLine[i] - signalLine[i];
    const ph = macdLine[i - 1] - signalLine[i - 1];
    if (macdLine[i - 1] <= signalLine[i - 1] && macdLine[i] > signalLine[i]) recentCrossUp = true;
    if (macdLine[i - 1] >= signalLine[i - 1] && macdLine[i] < signalLine[i]) recentCrossDown = true;
    if (ph <= 0 && h > 0) histFlipGreenRecent = true;
    if (ph >= 0 && h < 0) histFlipRedRecent = true;
  }
  const color = hist > 0 ? 'GREEN' : hist < 0 ? 'RED' : 'GRAY';
  const lineRelation = line > sig ? 'ABOVE_SIGNAL' : line < sig ? 'BELOW_SIGNAL' : 'ON_SIGNAL';
  const histogramExpandingUp = hist > 0 && hist > prevHist;
  const histogramDeepeningDown = hist < 0 && hist < prevHist;
  const bullishWeakening = hist > 0 && hist < prevHist;
  const bearishWeakening = hist < 0 && hist > prevHist;
  const direction = line > sig && hist > 0 ? 'BULLISH' : line < sig && hist < 0 ? 'BEARISH' : 'NEUTRAL_MIXED';
  return {
    direction, color, line: round(line, 8), signal: round(sig, 8), histogram: round(hist, 8), histogramPrev: round(prevHist, 8),
    lineRelation, recentCrossUp, recentCrossDown, histFlipGreenRecent, histFlipRedRecent,
    histogramExpandingUp, histogramDeepeningDown, bullishWeakening, bearishWeakening,
    longEntryOk: line > sig && hist > 0 && recentCrossUp && !bullishWeakening,
    shortEntryOk: line < sig && hist < 0 && recentCrossDown && !bearishWeakening,
    longMomentumOk: line > sig && hist > 0 && (histFlipGreenRecent || histogramExpandingUp) && !bullishWeakening,
    shortMomentumOk: line < sig && hist < 0 && (histFlipRedRecent || histogramDeepeningDown) && !bearishWeakening,
    fluctuation: `${color}_${lineRelation}_${hist > prevHist ? 'HIST_RISING' : hist < prevHist ? 'HIST_FALLING' : 'HIST_FLAT'}`
  };
}

function heikinDetailedState(candles) {
  const closed = closedOnly(candles, 8);
  if (closed.length < 8) return { ...heikinState(candles), dojiCluster: false, weakeningBull: false, weakeningBear: false, strongBull: false, strongBear: false };
  const ha = heikinAshiSeries(closed);
  const base = heikinState(candles);
  const last = ha.at(-1);
  const recent = ha.slice(-5).map(c => {
    const body = Math.abs(c.close - c.open);
    const range = Math.max(1e-9, c.high - c.low);
    const upper = c.high - Math.max(c.open, c.close);
    const lower = Math.min(c.open, c.close) - c.low;
    const dir = c.close > c.open ? 'BULLISH' : c.close < c.open ? 'BEARISH' : 'NEUTRAL';
    const doji = body <= range * 0.25 && upper >= body * 0.8 && lower >= body * 0.8;
    return { body, range, upper, lower, dir, doji };
  });
  const r = recent.at(-1);
  const dojiCluster = recent.slice(-4).filter(x => x.doji).length >= 2;
  const last3 = recent.slice(-3);
  const bull3 = last3.every(x => x.dir === 'BULLISH');
  const bear3 = last3.every(x => x.dir === 'BEARISH');
  const shrinkingBodies = last3.length === 3 && last3[2].body < last3[1].body && last3[1].body < last3[0].body;
  const strongBull = r.dir === 'BULLISH' && r.body >= r.range * 0.45 && r.lower <= r.body * 0.25;
  const strongBear = r.dir === 'BEARISH' && r.body >= r.range * 0.45 && r.upper <= r.body * 0.25;
  const weakeningBull = r.dir === 'BULLISH' && ((bull3 && shrinkingBodies) || r.lower > r.body * 0.45 || dojiCluster);
  const weakeningBear = r.dir === 'BEARISH' && ((bear3 && shrinkingBodies) || r.upper > r.body * 0.45 || dojiCluster);
  const oppositeInRecent = side => recent.slice(-6, -1).some(x => side === 'LONG' ? x.dir === 'BEARISH' : x.dir === 'BULLISH');
  return { ...base, dojiCluster, strongBull, strongBear, weakeningBull, weakeningBear, oppositeInRecentLong: oppositeInRecent('LONG'), oppositeInRecentShort: oppositeInRecent('SHORT') };
}

function candleTriggerState(candles, side) {
  const closed = closedOnly(candles, 5);
  const c = closed.at(-1), p = closed.at(-2);
  if (!c || !p) return { ok: false, type: 'NO_CANDLE', reason: 'CANDLE_INSUFFICIENT_DATA' };
  const body = Math.abs(c.close - c.open);
  const range = Math.max(1e-9, c.high - c.low);
  const upper = c.high - Math.max(c.open, c.close);
  const lower = Math.min(c.open, c.close) - c.low;
  const bull = c.close > c.open;
  const bear = c.close < c.open;
  const bigBull = bull && body >= range * 0.55 && c.close >= c.low + range * 0.72;
  const bigBear = bear && body >= range * 0.55 && c.close <= c.low + range * 0.28;
  const bullPin = bull && lower >= body * 1.6 && upper <= body * 0.9 && c.close >= c.low + range * 0.65;
  const bearPin = bear && upper >= body * 1.6 && lower <= body * 0.9 && c.close <= c.low + range * 0.35;
  const bullEngulf = bull && p.close < p.open && c.close >= p.open && c.open <= p.close;
  const bearEngulf = bear && p.close > p.open && c.close <= p.open && c.open >= p.close;
  let ok = false, type = 'NONE';
  if (side === 'LONG') {
    if (bullEngulf) { ok = true; type = 'BULLISH_ENGULFING'; }
    else if (bigBull) { ok = true; type = 'BIG_BULLISH_MOMENTUM'; }
    else if (bullPin) { ok = true; type = 'BULLISH_REJECTION_PIN'; }
  } else {
    if (bearEngulf) { ok = true; type = 'BEARISH_ENGULFING'; }
    else if (bigBear) { ok = true; type = 'BIG_BEARISH_MOMENTUM'; }
    else if (bearPin) { ok = true; type = 'BEARISH_REJECTION_PIN'; }
  }
  return { ok, type, bodyPct: round((body / range) * 100, 1), high: c.high, low: c.low, close: c.close, reason: ok ? type : 'NO_STRONG_TRIGGER_CANDLE' };
}

function emaChannelDetailedState(candles) {
  const closed = closedOnly(candles, 80);
  const closes = closed.map(c => c.close);
  if (closed.length < 80) return { direction: 'NEUTRAL', priceZone: 'UNKNOWN', reason: 'EMA_CHANNEL_INSUFFICIENT_DATA' };
  const e20Arr = ema(closes, 20), e50Arr = ema(closes, 50), e200Arr = ema(closes, 200);
  const e20 = e20Arr.at(-1), e50 = e50Arr.at(-1), e200 = e200Arr.at(-1);
  const e20Prev = e20Arr.at(-6) ?? e20, e50Prev = e50Arr.at(-6) ?? e50;
  const last = closes.at(-1);
  const channelLow = Math.min(e20, e50), channelHigh = Math.max(e20, e50);
  const atrv = atr(closed, 14).at(-1) || Math.abs(last) * 0.005;
  const slope20 = e20 > e20Prev ? 'RISING' : e20 < e20Prev ? 'FALLING' : 'FLAT';
  const slope50 = e50 > e50Prev ? 'RISING' : e50 < e50Prev ? 'FALLING' : 'FLAT';
  let direction = 'NEUTRAL';
  if (e20 >= e50 && e50 >= e200 && slope20 === 'RISING') direction = 'BULLISH';
  else if (e20 <= e50 && e50 <= e200 && slope20 === 'FALLING') direction = 'BEARISH';
  const priceZone = last > channelHigh ? 'ABOVE_EMA_CHANNEL' : last < channelLow ? 'BELOW_EMA_CHANNEL' : 'INSIDE_EMA_CHANNEL';
  const recent = closed.slice(-10);
  const touchedForLong = recent.some(c => c.low <= channelHigh + atrv * 0.20 && c.high >= channelLow - atrv * 0.20);
  const touchedForShort = recent.some(c => c.high >= channelLow - atrv * 0.20 && c.low <= channelHigh + atrv * 0.20);
  return { direction, priceZone, ema20: round(e20, 6), ema50: round(e50, 6), ema200: round(e200, 6), slope20, slope50, channelLow, channelHigh, atrv, touchedForLong, touchedForShort, distanceFromChannel: last > channelHigh ? last - channelHigh : last < channelLow ? channelLow - last : 0 };
}

function ema717State(candles) {
  const closed = closedOnly(candles, 40);
  const closes = closed.map(c => c.close);
  if (closed.length < 40) return { direction: 'NEUTRAL', angleOk: false, reason: 'EMA_7_17_INSUFFICIENT_DATA' };
  const e7Arr = ema(closes, 7), e17Arr = ema(closes, 17);
  const e7 = e7Arr.at(-1), e17 = e17Arr.at(-1);
  const lookback = 5;
  const e7Prev = e7Arr.at(-1 - lookback) ?? e7;
  const e17Prev = e17Arr.at(-1 - lookback) ?? e17;
  const atrv = atr(closed, 14).at(-1) || Math.abs(closes.at(-1)) * 0.004;
  const normalizedSlope = Math.abs(e17 - e17Prev) / Math.max(1e-9, atrv);
  const angleDeg = Math.atan(normalizedSlope) * 180 / Math.PI;
  const direction = e7 > e17 && e7 > e7Prev && e17 >= e17Prev ? 'BULLISH' : e7 < e17 && e7 < e7Prev && e17 <= e17Prev ? 'BEARISH' : 'NEUTRAL';
  const angleOk = angleDeg >= 30;
  return { direction, ema7: round(e7, 6), ema17: round(e17, 6), angleDeg: round(angleDeg, 1), angleOk, reason: `${direction}_ANGLE_${round(angleDeg, 1)}` };
}

function supportResistanceContext(candles, side) {
  const closed = closedOnly(candles, 40);
  if (closed.length < 40) return { ok: false, reason: 'HTF_CONTEXT_INSUFFICIENT_DATA' };
  const price = closed.at(-1).close;
  const atrv = atr(closed, 14).at(-1) || price * 0.005;
  const support = recentLow(closed, 30), resistance = recentHigh(closed, 30);
  const nearSupport = Math.abs(price - support) <= atrv * 1.2;
  const nearResistance = Math.abs(price - resistance) <= atrv * 1.2;
  if (side === 'LONG') return { ok: !nearResistance, nearSupport, nearResistance, support, resistance, reason: nearResistance ? 'HTF_NEAR_RESISTANCE' : 'HTF_LONG_CONTEXT_OK' };
  return { ok: !nearSupport, nearSupport, nearResistance, support, resistance, reason: nearSupport ? 'HTF_SITTING_ON_SUPPORT' : 'HTF_SHORT_CONTEXT_OK' };
}

function buildPlanFromSl(side, entry, sl, candlesForAtr, assetTier, targetR = 3, slReason = 'Transcript-defined SL') {
  const riskSettings = settings.risk;
  const closed = closedOnly(candlesForAtr, 30);
  const atrv = atr(closed, 14).at(-1) || Math.abs(entry) * 0.005;
  const riskDistance = Math.abs(entry - sl);
  if (!entry || !sl || !riskDistance) return { valid: false, reason: 'INVALID_ENTRY_OR_SL', rr: 0, slQuality: 'BAD_INVALID' };
  const minRisk = atrv * safeNumber(riskSettings.minSlAtrMult, 0.6);
  const maxRisk = atrv * safeNumber(riskSettings.maxSlAtrMult, 4.5);
  let adjSl = sl;
  let quality = 'GOOD_STRUCTURE';
  if (riskDistance < minRisk) {
    adjSl = side === 'LONG' ? entry - minRisk : entry + minRisk;
    quality = 'ADJUSTED_MIN_ATR';
  }
  if (Math.abs(entry - adjSl) > maxRisk) quality = 'WIDE';
  const risk = Math.abs(entry - adjSl);
  const tp1 = side === 'LONG' ? entry + risk : entry - risk;
  const tp2 = side === 'LONG' ? entry + risk * targetR : entry - risk * targetR;
  const rr = risk ? Math.abs(tp2 - entry) / risk : 0;
  const leverage = Math.min(riskSettings.defaultLeverage, riskSettings.hardLeverageCap);
  const baseRiskPct = assetTier === 'Tier 2' ? riskSettings.tier2RiskPct : Math.min(riskSettings.defaultRiskPct, riskSettings.tier1MaxRiskPct || riskSettings.defaultRiskPct);
  const riskPct = baseRiskPct;
  const riskAmount = settings.wallet.botUsableAmount * riskPct / 100;
  const qty = risk ? riskAmount / risk : 0;
  const notional = qty * entry;
  const marginUsed = notional / leverage;
  return { valid: true, entry, sl: adjSl, tp1, tp2, rr, slQuality: quality, slReason, atr15: atrv, riskDistance: risk, riskPct, riskAmount, qty, notional, marginUsed, leverage };
}

function hardGatePassedPlan(plan) {
  if (!plan?.valid) return { ok: false, reason: plan?.reason || 'INVALID_PLAN' };
  if (plan.rr < settings.risk.minRR) return { ok: false, reason: 'RR_BELOW_MIN' };
  if (String(plan.slQuality || '').includes('BAD')) return { ok: false, reason: 'SL_TOO_CLOSE_OR_INVALID' };
  return { ok: true, reason: 'PLAN_OK' };
}

function buildHardGateSignal(ctx, moduleName, side, plan, reason, checklist, extra = {}) {
  const scoreReasons = (checklist || []).map(x => `PASS: ${x}`);
  return {
    symbol: ctx.symbol, asset: ctx.assetRow.asset, tier: ctx.assetRow.tier,
    decision: side, trend: ctx.trend, setup: moduleName, side,
    entry: round(plan.entry, 6), sl: round(plan.sl, 6), tp1: round(plan.tp1, 6), tp2: round(plan.tp2, 6),
    rr: round(plan.rr, 2), score: 100, scoreMax: 100, slQuality: plan.slQuality, reason, action: settings.mode === 'PAPER' ? 'PAPER_RECOMMEND_OR_AUTO_IF_BOT_ON' : 'REVIEW_ONLY', mode: settings.mode,
    price: round(ctx.price, 6), spreadPct: round(ctx.spreadPct, 4), tq: round(ctx.tq, 3), adrUsedPct: round(ctx.dailyLevels.adrUsedPct, 2),
    orderBlock: extra.orderBlock || null,
    indicators: { ...ctx.baseIndicators, ...extra.indicators, moduleChecklist: checklist, selectedModule: moduleName },
    position: { qty: round(plan.qty, 6), notional: round(plan.notional, 2), marginUsed: round(plan.marginUsed, 2), riskAmount: round(plan.riskAmount, 2), riskPct: plan.riskPct, leverage: plan.leverage },
    scoreReasons,
    slReason: plan.slReason
  };
}

function buildWaitCandidate(ctx, moduleName, reason, side = '-') {
  return {
    symbol: ctx.symbol, asset: ctx.assetRow.asset, tier: ctx.assetRow.tier,
    decision: 'WAIT', trend: ctx.trend, setup: moduleName, side,
    entry: null, sl: null, tp1: null, tp2: null, rr: null, score: 0, scoreMax: 100, slQuality: '-', reason, action: 'WAIT_FULL_TRANSCRIPT_SEQUENCE', mode: settings.mode,
    price: round(ctx.price, 6), spreadPct: round(ctx.spreadPct, 4), tq: round(ctx.tq, 3), adrUsedPct: round(ctx.dailyLevels.adrUsedPct, 2),
    orderBlock: null, indicators: ctx.baseIndicators, position: null, scoreReasons: [], slReason: '-'
  };
}

function macdCciModule(ctx, side) {
  const { candles15, candles1h, candles4h, price, assetRow, macdStrict15, cci15, haDetailed15, dailyLevels, atr15 } = ctx;
  const checklist = [];
  const trendStack = buildTrendStack(side, { bias1h: ctx.bias1h, bias4h: ctx.bias4h, ema15: ctx.ema15, ema1h: ctx.ema1h, macd15: ctx.macd15, macd1h: ctx.macd1h, ha15: ctx.ha15, qqe15: ctx.qqe15 });
  if (trendStack.blockingReasons.length) return null;
  if (ctx.extremeChop || haDetailed15.dojiCluster) return null;
  const cciOk = side === 'LONG' ? cci15.entryLong : cci15.entryShort;
  const macdOk = side === 'LONG' ? macdStrict15.longEntryOk : macdStrict15.shortEntryOk;
  const haOk = side === 'LONG' ? directionMatches(side, haDetailed15.direction) && !haDetailed15.weakeningBull : directionMatches(side, haDetailed15.direction) && !haDetailed15.weakeningBear;
  const candle = candleTriggerState(candles15, side);
  const trendOk = trendStack.agree >= 4 && trendStack.oppose <= 1 && !directionOpposes(side, ctx.bias4h);
  if (!cciOk || !macdOk || !haOk || !trendOk || !candle.ok) return null;
  checklist.push('CCI crossed bias zero first and then crossed the +/-100 entry level');
  checklist.push('MACD line crossed in the trade direction with matching histogram color');
  checklist.push('Heikin Ashi/candle momentum confirms; no weakening/doji cluster');
  checklist.push('1H/4H trend stack does not oppose the trade');
  const trigger = lastClosedCandle(candles15);
  const buffer = atr15 * settings.risk.atrBufferMult;
  const recentSwing = side === 'LONG' ? recentLow(closedOnly(candles15, 30), 12) : recentHigh(closedOnly(candles15, 30), 12);
  const sl = side === 'LONG' ? Math.min(trigger.low, recentSwing) - buffer : Math.max(trigger.high, recentSwing) + buffer;
  const plan = buildPlanFromSl(side, price, sl, candles15, assetRow.tier, 3, side === 'LONG' ? 'Below trigger candle/recent swing + ATR buffer' : 'Above trigger candle/recent swing + ATR buffer');
  const planGate = hardGatePassedPlan(plan);
  if (!planGate.ok) return null;
  return buildHardGateSignal(ctx, 'V7.4-MACD-CCI-ALIGNMENT', side, plan, `${side}: MACD crossing + CCI +/-100 entry + candle/trend confirmation`, checklist, { indicators: { cci15m: cci15, macdTranscript15m: macdStrict15, heikinDetailed15m: haDetailed15, triggerCandle: candle, trendStack } });
}

function emaChannelHaMacdModule(ctx, side) {
  const { candles15, price, assetRow, emaChannel15, macdStrict15, haDetailed15, atr15 } = ctx;
  const checklist = [];
  if (ctx.extremeChop || haDetailed15.dojiCluster) return null;
  const directionOk = directionMatches(side, emaChannel15.direction) && !directionOpposes(side, ctx.bias1h);
  const pullbackOk = side === 'LONG' ? emaChannel15.touchedForLong : emaChannel15.touchedForShort;
  const extended = emaChannel15.distanceFromChannel > atr15 * 1.35;
  const haOk = side === 'LONG'
    ? directionMatches(side, haDetailed15.direction) && (haDetailed15.switched || haDetailed15.oppositeInRecentLong) && !haDetailed15.weakeningBull
    : directionMatches(side, haDetailed15.direction) && (haDetailed15.switched || haDetailed15.oppositeInRecentShort) && !haDetailed15.weakeningBear;
  const macdOk = side === 'LONG' ? macdStrict15.longMomentumOk : macdStrict15.shortMomentumOk;
  const candle = candleTriggerState(candles15, side);
  if (!directionOk || !pullbackOk || extended || !haOk || !macdOk || !candle.ok) return null;
  checklist.push('EMA channel trend supports the trade direction');
  checklist.push('Price pulled back close to/into the EMA channel; not a shallow pullback');
  checklist.push('Heikin Ashi turned back in trend direction after correction');
  checklist.push('MACD histogram flipped/strengthened in the same direction');
  checklist.push('Price is not extended away from the EMA channel');
  const trigger = lastClosedCandle(candles15);
  const buffer = atr15 * settings.risk.atrBufferMult;
  const sl = side === 'LONG' ? trigger.low - buffer : trigger.high + buffer;
  const plan = buildPlanFromSl(side, price, sl, candles15, assetRow.tier, 3, side === 'LONG' ? 'Below EMA-channel signal candle + ATR buffer' : 'Above EMA-channel signal candle + ATR buffer');
  const planGate = hardGatePassedPlan(plan);
  if (!planGate.ok) return null;
  return buildHardGateSignal(ctx, 'V7.4-EMA-CHANNEL-HA-MACD', side, plan, `${side}: EMA channel pullback + Heikin Ashi turn + MACD histogram confirmation`, checklist, { indicators: { emaChannel15m: emaChannel15, macdTranscript15m: macdStrict15, heikinDetailed15m: haDetailed15, triggerCandle: candle } });
}

function ictOrderBlockModule(ctx, side) {
  const { candles15, candles1h, price, assetRow, atr15, macdStrict15, haDetailed15 } = ctx;
  const checklist = [];
  if (ctx.extremeChop || haDetailed15.dojiCluster) return null;
  const htfOb = detectOrderBlock(candles1h, side);
  const ltfOb = detectOrderBlock(candles15, side);
  const ob = htfOb || ltfOb;
  const obTf = htfOb ? '1H' : ltfOb ? '15M' : null;
  if (!ob) return null;
  const nearZone = priceNearZone(price, ob, atr15, settings.risk, candles15, side);
  const rs = retestState(candles15, ob, side);
  const candle = candleTriggerState(candles15, side);
  const macdOk = side === 'LONG' ? macdStrict15.longMomentumOk || macdStrict15.direction === 'BULLISH' : macdStrict15.shortMomentumOk || macdStrict15.direction === 'BEARISH';
  const haOk = side === 'LONG' ? directionMatches(side, haDetailed15.direction) && !haDetailed15.weakeningBull : directionMatches(side, haDetailed15.direction) && !haDetailed15.weakeningBear;
  const trendStack = buildTrendStack(side, { bias1h: ctx.bias1h, bias4h: ctx.bias4h, ema15: ctx.ema15, ema1h: ctx.ema1h, macd15: ctx.macd15, macd1h: ctx.macd1h, ha15: ctx.ha15, qqe15: ctx.qqe15 });
  if (trendStack.blockingReasons.length || !nearZone || !rs.confirmed || !candle.ok || !macdOk || !haOk) return null;
  checklist.push(`${obTf} valid order block has imbalance/FVG and BOS/CHoCH`);
  checklist.push('Order block is still fresh/unmitigated before current retest');
  checklist.push('Price returned to the order block; no chase entry');
  checklist.push('Lower timeframe candle confirms rejection/reaction');
  checklist.push('MACD/Heikin Ashi agree with the order-block reaction');
  const buffer = atr15 * settings.risk.atrBufferMult;
  const sl = side === 'LONG' ? ob.zoneLow - buffer : ob.zoneHigh + buffer;
  const plan = buildPlanFromSl(side, price, sl, candles15, assetRow.tier, 3, side === 'LONG' ? 'Below fresh bullish order block + ATR buffer' : 'Above fresh bearish order block + ATR buffer');
  const planGate = hardGatePassedPlan(plan);
  if (!planGate.ok) return null;
  const obView = { timeframe: obTf, time: ob.time, low: round(ob.zoneLow, 6), high: round(ob.zoneHigh, 6), mid: round(ob.mid, 6), fvgLow: round(ob.fvgLow, 6), fvgHigh: round(ob.fvgHigh, 6), hasSweep: !!ob.hasSweep };
  return buildHardGateSignal(ctx, 'V7.4-ICT-ORDER-BLOCK', side, plan, `${side}: ICT OB retest + imbalance + BOS/CHoCH + LTF rejection confirmed`, checklist, { orderBlock: obView, indicators: { macdTranscript15m: macdStrict15, heikinDetailed15m: haDetailed15, triggerCandle: candle, retestSeen: rs.retestSeen, retestConfirmed: rs.confirmed, trendStack } });
}

function ema717ScalpModule(ctx, side) {
  const { candles5, candles1h, price, assetRow } = ctx;
  if (!Array.isArray(candles5) || candles5.length < 60) return null;
  const ema717 = ema717State(candles5);
  const tq5 = trendQuality(closedOnly(candles5, 30), 24);
  const ha5 = heikinDetailedState(candles5);
  const candle = candleTriggerState(candles5, side);
  const htf = supportResistanceContext(candles1h, side);
  const biasOk = side === 'LONG' ? !directionOpposes(side, ctx.bias1h) && (ctx.bias1h === 'BULLISH' || htf.nearSupport || directionMatches(side, ctx.ema1h.direction)) : !directionOpposes(side, ctx.bias1h) && (ctx.bias1h === 'BEARISH' || htf.nearResistance || directionMatches(side, ctx.ema1h.direction));
  if (!directionMatches(side, ema717.direction) || !ema717.angleOk || tq5 < 0.30 || ha5.dojiCluster || !candle.ok || !htf.ok || !biasOk) return null;
  const checklist = [];
  checklist.push('EMA 7/17 direction matches trade side');
  checklist.push('EMA 7/17 slope is strong, approximately 30 degrees or higher');
  checklist.push('5M market is not sideways/choppy');
  checklist.push('Pin bar / big momentum / engulfing trigger candle confirmed');
  checklist.push('1H context confirms and is not blocking the trade');
  const atr5 = atr(closedOnly(candles5, 30), 14).at(-1) || price * 0.003;
  const buffer = atr5 * settings.risk.atrBufferMult;
  const sl = side === 'LONG' ? candle.low - buffer : candle.high + buffer;
  const plan = buildPlanFromSl(side, price, sl, candles5, assetRow.tier, 3, side === 'LONG' ? 'Below 5M EMA7/17 trigger candle + ATR buffer' : 'Above 5M EMA7/17 trigger candle + ATR buffer');
  const planGate = hardGatePassedPlan(plan);
  if (!planGate.ok) return null;
  return buildHardGateSignal(ctx, 'V7.4-EMA-7-17-SCALP', side, plan, `${side}: EMA7/17 strong-slope scalp + 1H confirmation + trigger candle`, checklist, { indicators: { ema717_5m: ema717, heikinDetailed5m: ha5, triggerCandle5m: candle, htfContext1h: htf, tq5m: round(tq5, 3) } });
}

function buildSignalSkip(assetRow, reason, extra = {}) {
  const hardSkipReasons = ['MARKET_DATA_CHECK', 'SPREAD_HIGH', 'ADR_USED_80', 'HTF_CONFLICT', 'TREND_STACK_CONFLICT', 'MACD_CONFLICT', 'RR_BELOW_MIN', 'SL_TOO_CLOSE', 'SIDEWAYS_CHOP', 'DAILY_RISK_LOCK'];
  const isHardSkip = hardSkipReasons.some(x => String(reason || '').includes(x));
  const base = {
    symbol: assetRow.symbol,
    asset: assetRow.asset,
    tier: assetRow.tier,
    decision: isHardSkip ? 'SKIP' : 'WAIT',
    trend: 'UNKNOWN',
    setup: 'V7.4-HARD-GATE',
    side: '-',
    entry: null,
    sl: null,
    tp1: null,
    tp2: null,
    rr: null,
    score: null,
    scoreMax: 100,
    slQuality: '-',
    reason,
    action: isHardSkip ? 'NO_TRADE' : 'WAIT_FULL_TRANSCRIPT_SEQUENCE',
    mode: settings.mode
  };
  return { ...base, ...extra };
}

function analyzeSymbol(assetRow, ticker, candles5, candles15, candles1h, candles4h, daily) {
  const symbol = assetRow.symbol;
  const price = safeNumber(ticker?.mark_price || ticker?.close || ticker?.spot_price || candles15.at(-1)?.close);
  const c15Closed = closedOnly(candles15, 80);
  const c1hClosed = closedOnly(candles1h, 80);
  const c4hClosed = closedOnly(candles4h, 80);
  if (!price || c15Closed.length < 80 || c1hClosed.length < 80 || c4hClosed.length < 80 || daily.length < 15) return buildSignalSkip(assetRow, 'MARKET_DATA_CHECK: insufficient candle history');

  const spread = Math.abs(safeNumber(ticker.best_ask || ticker.ask, price) - safeNumber(ticker.best_bid || ticker.bid, price));
  const spreadPct = price ? (spread / price) * 100 : 0;
  if (spreadPct > settings.risk.maxSpreadPct) return buildSignalSkip(assetRow, 'SPREAD_HIGH', { price, spreadPct: round(spreadPct, 4) });

  const bias1h = getBias(candles1h);
  const bias4h = getBias(candles4h);
  const trend = bias4h === bias1h ? bias4h : `${bias4h}/${bias1h}`;
  const ema15 = emaTrendState(candles15);
  const ema1h = emaTrendState(candles1h);
  const emaChannel15 = emaChannelDetailedState(candles15);
  const macd15 = macdState(candles15);
  const macd1h = macdState(candles1h);
  const macdStrict15 = macdTranscriptState(candles15);
  const cci15 = cciState(candles15);
  const ha15 = heikinState(candles15);
  const haDetailed15 = heikinDetailedState(candles15);
  const qqe15 = qqeModState(candles15, 'Line & Bar');
  const atr15 = atr(c15Closed, 14).at(-1) || price * 0.005;
  const dailyLevels = previousDayLevels(daily);
  const tq = trendQuality(c15Closed, 24);
  const marketStack = buildMarketStack({ bias1h, bias4h, ema15, ema1h, macd15, macd1h, ha15, qqe15 });
  const baseIndicators = {
    ema20: ema15.ema20, ema50: ema15.ema50, ema200: ema15.ema200, ema15m: ema15, ema1h, emaChannel15m: emaChannel15,
    macd15m: macd15, macd1h, macdTranscript15m: macdStrict15, cci15m: cci15, heikinAshi15m: ha15, heikinDetailed15m: haDetailed15, qqeMod15m: qqe15,
    marketStack, trendStack: marketStack,
    pdh: round(dailyLevels.pdh, 6), pdl: round(dailyLevels.pdl, 6)
  };

  const minTq = clamp(safeNumber(settings.risk.minTrendQuality, 30), 0, 100) / 100;
  const extremeChop = tq < Math.min(0.22, minTq * 0.75);
  const adrOk = dailyLevels.adrUsedPct === null || dailyLevels.adrUsedPct <= settings.risk.adrUsedLimitPct;
  const ctx = { assetRow, symbol, price, candles5, candles15, candles1h, candles4h, daily, ticker, trend, tq, spreadPct, adrOk, dailyLevels, baseIndicators, bias1h, bias4h, ema15, ema1h, emaChannel15, macd15, macd1h, macdStrict15, cci15, ha15, haDetailed15, qqe15, marketStack, atr15, extremeChop };

  if (!adrOk) return buildSignalSkip(assetRow, 'ADR_USED_80: daily range exhausted', { decision: 'SKIP', action: 'NO_TRADE', price: round(price, 6), trend, tq: round(tq, 3), adrUsedPct: round(dailyLevels.adrUsedPct, 2), indicators: baseIndicators });
  if (haDetailed15.dojiCluster && extremeChop) return buildSignalSkip(assetRow, 'SIDEWAYS_CHOP: doji cluster plus weak trend quality', { decision: 'SKIP', action: 'NO_TRADE', price: round(price, 6), trend, tq: round(tq, 3), adrUsedPct: round(dailyLevels.adrUsedPct, 2), indicators: baseIndicators });

  const candidates = [];
  for (const side of ['LONG', 'SHORT']) {
    const modules = [
      macdCciModule(ctx, side),
      emaChannelHaMacdModule(ctx, side),
      ictOrderBlockModule(ctx, side),
      ema717ScalpModule(ctx, side)
    ].filter(Boolean);
    candidates.push(...modules);
  }

  if (candidates.length) {
    candidates.sort((a, b) => (safeNumber(b.rr) - safeNumber(a.rr)) || String(a.setup).localeCompare(String(b.setup)));
    return candidates[0];
  }

  const waitReasons = [];
  if (!cci15.entryLong && !cci15.entryShort) waitReasons.push('CCI has not crossed +/-100 after zero-bias confirmation');
  if (!macdStrict15.longEntryOk && !macdStrict15.shortEntryOk && !macdStrict15.longMomentumOk && !macdStrict15.shortMomentumOk) waitReasons.push('MACD has not completed a valid cross/flip sequence');
  if (haDetailed15.dojiCluster) waitReasons.push('Heikin Ashi doji/indecision cluster present');
  if (extremeChop) waitReasons.push('Trend quality is weak/choppy');
  waitReasons.push('No full strategy module completed all hard gates');
  return buildWaitCandidate(ctx, 'V7.4-WAIT-FULL-SEQUENCE', waitReasons.join(' | '));
}

function updateWalletFromTrades() {
  const openPnl = trades.open.reduce((sum, t) => sum + safeNumber(t.unrealizedPnl), 0);
  const usedMargin = trades.open.reduce((sum, t) => sum + safeNumber(t.marginUsed), 0);
  const closedPnl = trades.closed.reduce((sum, t) => sum + safeNumber(t.realizedPnl), 0);
  const baseUsable = safeNumber(settings.wallet.botUsableAmount, 0);
  if (!wallet.startingEquity || wallet.baseUsableAmount !== baseUsable) {
    wallet.startingEquity = baseUsable;
    wallet.baseUsableAmount = baseUsable;
  }
  wallet.closedPnl = round(closedPnl, 2) || 0;
  wallet.openPnl = round(openPnl, 2) || 0;
  wallet.usedMargin = round(usedMargin, 2) || 0;
  wallet.equity = round(baseUsable + closedPnl + openPnl, 2) || baseUsable;
  wallet.available = round(Math.max(0, baseUsable + closedPnl - usedMargin), 2) || 0;
  wallet.totalWalletAmount = safeNumber(settings.wallet.totalWalletAmount, baseUsable);
  saveWallet(wallet);
}
function tradeExists(symbol) {
  return trades.open.some(t => t.symbol === symbol) || trades.pending.some(t => t.symbol === symbol);
}
function todayClosedTrades() {
  const d = new Date().toISOString().slice(0, 10);
  return trades.closed.filter(t => String(t.closedAt || '').slice(0, 10) === d);
}
function dailyLocked() {
  const today = todayClosedTrades();
  if (today.length >= settings.risk.maxTradesPerDay) return 'MAX_TRADES_PER_DAY';
  const dailyPnl = today.reduce((s, t) => s + safeNumber(t.realizedPnl), 0);
  if (dailyPnl <= -(settings.wallet.botUsableAmount * settings.risk.maxDailyLossPct / 100)) return 'MAX_DAILY_LOSS';
  let losses = 0;
  for (let i = trades.closed.length - 1; i >= 0; i--) {
    if (safeNumber(trades.closed[i].realizedPnl) < 0) losses++; else break;
  }
  if (losses >= settings.risk.maxConsecutiveLosses) return 'MAX_CONSECUTIVE_LOSSES';
  return null;
}
function maybeOpenPaperTrade(signal) {
  if (!settings.bot.running || settings.mode !== 'PAPER' || settings.bot.emergencyStopped) return;
  if (!['LONG', 'SHORT'].includes(signal.decision)) return;
  if (signal.score < settings.risk.paperMinScore || signal.rr < settings.risk.minRR) return;
  if (tradeExists(signal.symbol)) return;
  if (trades.open.length >= settings.risk.maxOpenTrades) { log('RISK_SKIP', `Open trade limit reached for ${signal.symbol}`, { reason: 'MAX_OPEN_TRADES' }); return; }
  const lock = dailyLocked();
  if (lock) { log('RISK_SKIP', `Daily risk lock blocked ${signal.symbol}`, { reason: lock }); return; }
  if (signal.position.marginUsed > wallet.available) { log('RISK_SKIP', `Insufficient paper funds for ${signal.symbol}`, { reason: 'INSUFFICIENT_FUNDS', marginUsed: signal.position.marginUsed, available: wallet.available }); return; }
  const slip = settings.paper.slippageBps / 10000;
  const fill = signal.side === 'LONG' ? signal.entry * (1 + slip) : signal.entry * (1 - slip);
  const trade = {
    id: uid('paper'), symbol: signal.symbol, asset: signal.asset, tier: signal.tier, side: signal.side, status: 'OPEN', mode: 'PAPER', strategy: signal.setup,
    openedAt: nowIso(), entryTimeMs: Date.now(), entry: round(fill, 8), plannedEntry: signal.entry, currentPrice: signal.price,
    sl: signal.sl, initialSl: signal.sl, tp1: signal.tp1, tp2: signal.tp2, rr: signal.rr, score: signal.score,
    qty: signal.position.qty, remainingQty: signal.position.qty, notional: signal.position.notional, marginUsed: signal.position.marginUsed,
    riskAmount: signal.position.riskAmount, riskPct: signal.position.riskPct, leverage: signal.position.leverage,
    realizedPnl: 0, unrealizedPnl: 0, pnlPct: 0, tp1Done: false, tp1ClosePct: settings.paper.tp1ClosePct,
    slReason: signal.slReason, slQuality: signal.slQuality, entryReason: signal.reason, scoreReasons: signal.scoreReasons,
    logs: [{ at: nowIso(), message: `Paper opened by ${signal.setup}: ${signal.reason}` }]
  };
  trades.open.push(trade);
  saveTrades(trades);
  updateWalletFromTrades();
  log('TRADE_OPEN', `${signal.side} ${signal.symbol} paper trade opened`, { symbol: signal.symbol, side: signal.side, entry: trade.entry, sl: trade.sl, tp1: trade.tp1, tp2: trade.tp2, score: trade.score, rr: trade.rr });
}
function closeTrade(trade, exitPrice, reason) {
  const remaining = safeNumber(trade.remainingQty || trade.qty);
  const feePct = settings.paper.takerFeePct / 100;
  const gross = (exitPrice - trade.entry) * sideFactor(trade.side) * remaining;
  const fees = (Math.abs(exitPrice * remaining) + Math.abs(trade.entry * remaining)) * feePct;
  trade.realizedPnl = round(safeNumber(trade.realizedPnl) + gross - fees, 2);
  trade.unrealizedPnl = 0;
  trade.remainingQty = 0;
  trade.exit = round(exitPrice, 8);
  trade.closedAt = nowIso();
  trade.status = reason;
  trade.exitReason = reason;
  trade.pnlPct = trade.marginUsed ? round((trade.realizedPnl / trade.marginUsed) * 100, 2) : 0;
  trade.logs = trade.logs || [];
  trade.logs.push({ at: nowIso(), message: `Closed: ${reason} @ ${exitPrice}` });
  trades.open = trades.open.filter(t => t.id !== trade.id);
  trades.closed.push(trade);
  trades.stats.totalTrades = trades.closed.length;
  trades.stats.wins = trades.closed.filter(t => safeNumber(t.realizedPnl) > 0).length;
  trades.stats.losses = trades.closed.filter(t => safeNumber(t.realizedPnl) < 0).length;
  trades.stats.closedPnl = trades.closed.reduce((s, t) => s + safeNumber(t.realizedPnl), 0);
  saveTrades(trades);
  updateWalletFromTrades();
  log('TRADE_CLOSE', `${trade.symbol} closed: ${reason}`, { symbol: trade.symbol, realizedPnl: trade.realizedPnl, exit: exitPrice });
}
function partialTp1(trade, price) {
  if (trade.tp1Done) return;
  const closeQty = safeNumber(trade.qty) * (settings.paper.tp1ClosePct / 100);
  const feePct = settings.paper.takerFeePct / 100;
  const gross = (price - trade.entry) * sideFactor(trade.side) * closeQty;
  const fees = (Math.abs(price * closeQty) + Math.abs(trade.entry * closeQty)) * feePct;
  trade.realizedPnl = round(safeNumber(trade.realizedPnl) + gross - fees, 2);
  trade.remainingQty = round(safeNumber(trade.remainingQty || trade.qty) - closeQty, 8);
  trade.tp1Done = true;
  trade.status = 'TP1_HIT';
  trade.sl = trade.side === 'LONG' ? Math.max(trade.sl, trade.entry) : Math.min(trade.sl, trade.entry);
  trade.logs = trade.logs || [];
  trade.logs.push({ at: nowIso(), message: `TP1 partial close; SL moved structure-safe/breakeven fallback` });
  log('TP1_HIT', `${trade.symbol} TP1 partial close`, { symbol: trade.symbol, tp1: trade.tp1, realizedPnl: trade.realizedPnl, newSl: trade.sl });
}

function maybeCloseInvalidatedTradesForSymbol(symbol, candles5, candles15) {
  const matching = trades.open.filter(t => t.symbol === symbol);
  if (!matching.length) return;
  const ticker = state.tickers[symbol];
  const price = safeNumber(ticker?.mark_price || ticker?.close || 0);
  if (!price) return;
  for (const trade of matching.slice()) {
    const opposite = trade.side === 'LONG' ? 'SHORT' : 'LONG';
    const ageMs = Date.now() - safeNumber(trade.entryTimeMs, Date.now());
    const ageBars5 = Math.floor(ageMs / (tfSec('5m') * 1000));
    const ageBars15 = Math.floor(ageMs / (tfSec('15m') * 1000));
    if (String(trade.strategy || '').includes('EMA-7-17')) {
      const ema5 = ema717State(candles5);
      const oppositeCandle = candleTriggerState(candles5, opposite);
      if (ageBars5 <= 3 && (oppositeCandle.ok || directionMatches(opposite, ema5.direction))) {
        closeTrade(trade, price, 'SCALP_MOMENTUM_INVALIDATED');
      }
      continue;
    }
    const ha = heikinDetailedState(candles15);
    const macd = macdTranscriptState(candles15);
    const oppositeMomentum = trade.side === 'LONG'
      ? (ha.weakeningBull || directionMatches('SHORT', ha.direction)) && (macd.bullishWeakening || macd.shortMomentumOk)
      : (ha.weakeningBear || directionMatches('LONG', ha.direction)) && (macd.bearishWeakening || macd.longMomentumOk);
    if (ageBars15 <= 3 && oppositeMomentum) {
      closeTrade(trade, price, 'EARLY_MOMENTUM_INVALIDATED');
    }
  }
}

function updateOpenTradesWithPrices() {
  for (const trade of trades.open.slice()) {
    normalizeTradeTargetsInPlace(trade);
    const ticker = state.tickers[trade.symbol];
    const price = safeNumber(ticker?.mark_price || ticker?.close || trade.currentPrice);
    if (!price) continue;
    trade.currentPrice = price;
    const rem = safeNumber(trade.remainingQty || trade.qty);
    trade.unrealizedPnl = round((price - trade.entry) * sideFactor(trade.side) * rem, 2);
    trade.pnlPct = trade.marginUsed ? round(((safeNumber(trade.realizedPnl) + safeNumber(trade.unrealizedPnl)) / trade.marginUsed) * 100, 2) : 0;
    const barsSince = Math.floor((Date.now() - safeNumber(trade.entryTimeMs)) / (tfSec('15m') * 1000));
    const risk = Math.abs(trade.entry - trade.initialSl);
    const fav = (price - trade.entry) * sideFactor(trade.side);
    if (!trade.tp1Done && ((trade.side === 'LONG' && price >= trade.tp1) || (trade.side === 'SHORT' && price <= trade.tp1))) partialTp1(trade, price);
    if ((trade.side === 'LONG' && price >= trade.tp2) || (trade.side === 'SHORT' && price <= trade.tp2)) { closeTrade(trade, price, 'TP2_HIT'); continue; }
    if ((trade.side === 'LONG' && price <= trade.sl) || (trade.side === 'SHORT' && price >= trade.sl)) { closeTrade(trade, price, 'SL_HIT'); continue; }
    if (barsSince >= settings.risk.timeFailureCandles && fav < risk * settings.risk.timeFailureMinR) { closeTrade(trade, price, 'TIME_FAILURE_EXIT'); continue; }
  }
  saveTrades(trades);
  updateWalletFromTrades();
}

async function scanMarkets(force = false) {
  if (state.scanning) return state.signals;
  const now = Date.now();
  if (!force && state.lastScanMs && (now - state.lastScanMs) < 15000) return state.signals;
  state.scanning = true;
  state.lastScanMs = now;
  const started = Date.now();
  try {
    state.marketStatus = 'FETCHING';
    state.marketError = null;
    const [products, tickers] = await Promise.all([refreshProducts().catch(err => { log('API_ERROR', 'products fetch failed', { error: err.message }); return state.products || {}; }), refreshTickers()]);
    const rows = chooseAvailableSymbols(products, tickers);
    const signals = [];
    for (const row of rows) {
      try {
        if (!row.available) {
          signals.push(buildSignalSkip(row, 'MARKET_DATA_CHECK: symbol unavailable on Delta India'));
          continue;
        }
        const ticker = tickers[row.symbol];
        if (!ticker) {
          signals.push(buildSignalSkip(row, 'MARKET_DATA_CHECK: ticker unavailable'));
          continue;
        }
        const [c5, c15, c1h, c4h, c1d] = await Promise.all([
          fetchCandles(row.symbol, '5m', 220), fetchCandles(row.symbol, '15m', 220), fetchCandles(row.symbol, '1h', 220), fetchCandles(row.symbol, '4h', 220), fetchCandles(row.symbol, '1d', 60)
        ]);
        maybeCloseInvalidatedTradesForSymbol(row.symbol, c5, c15);
        const signal = analyzeSymbol(row, ticker, c5, c15, c1h, c4h, c1d);
        signals.push(signal);
      } catch (err) {
        signals.push(buildSignalSkip(row, 'MARKET_DATA_CHECK: ' + err.message.slice(0, 120)));
        log('SCAN_SYMBOL_ERROR', `${row.symbol} scan failed`, { symbol: row.symbol, error: err.message });
      }
    }
    const ranked = signals.sort((a, b) => {
      const ta = a.tier === 'Tier 1' ? 0 : 1;
      const tb = b.tier === 'Tier 1' ? 0 : 1;
      if (ta !== tb) return ta - tb;
      return (safeNumber(b.score) - safeNumber(a.score)) || (safeNumber(b.rr) - safeNumber(a.rr));
    });
    state.signals = ranked;
    for (const sig of ranked) maybeOpenPaperTrade(sig);
    updateOpenTradesWithPrices();
    state.lastScanAt = nowIso();
    state.marketStatus = 'OK';
    state.lastScanDurationMs = Date.now() - started;
    log('SCAN', `Scan completed: ${ranked.length} symbols`, { signals: ranked.length, active: ranked.filter(s => ['LONG', 'SHORT'].includes(s.decision)).length, durationMs: state.lastScanDurationMs });
    return ranked;
  } catch (err) {
    state.marketStatus = 'ERROR';
    state.marketError = err.message;
    log('SCAN_ERROR', 'Market scan failed', { error: err.message });
    return state.signals;
  } finally {
    state.scanning = false;
  }
}

function getState() {
  updateWalletFromTrades();
  const total = trades.closed.length;
  const wins = trades.closed.filter(t => safeNumber(t.realizedPnl) > 0).length;
  const losses = trades.closed.filter(t => safeNumber(t.realizedPnl) < 0).length;
  return {
    appName: settings.appName, version: APP_VERSION, mode: settings.mode,
    bot: settings.bot, marketStatus: state.marketStatus, marketError: state.marketError,
    lastScanAt: state.lastScanAt, lastScanDurationMs: state.lastScanDurationMs,
    metrics: {
      totalTrades: total, wins, losses, winRate: total ? round((wins / total) * 100, 2) : 0,
      openPnl: wallet.openPnl, closedPnl: wallet.closedPnl, simEquity: wallet.equity, fundsUsed: wallet.usedMargin,
      activeSignals: state.signals.filter(s => ['LONG', 'SHORT'].includes(s.decision)).length,
      openTrades: trades.open.length
    },
    wallet,
    api: { hasKey: apiKeys.hasKey, apiKeyMasked: apiKeys.apiKeyMasked, testPassed: apiKeys.testPassed, lastTestAt: apiKeys.lastTestAt, lastError: apiKeys.lastError }
  };
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 1e6) req.destroy(new Error('body too large')); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (err) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}
function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname.replace(/^\/+/, ''));
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(normalized, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(normalized)] || 'application/octet-stream' });
    res.end(data);
  });
}
async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = url.pathname;
  try {
    if (pathname.startsWith('/api/')) {
      if (req.method === 'GET' && pathname === '/api/health') return sendJson(res, 200, { ok: true, app: settings.appName, version: APP_VERSION, mode: settings.mode, port: PORT, time: nowIso() });
      if (req.method === 'GET' && pathname === '/api/state') return sendJson(res, 200, getState());
      if (req.method === 'GET' && pathname === '/api/signals') return sendJson(res, 200, { signals: state.signals, lastScanAt: state.lastScanAt, marketStatus: state.marketStatus, error: state.marketError });
      if (req.method === 'GET' && pathname === '/api/trades/open') return sendJson(res, 200, { open: trades.open, pending: trades.pending });
      if (req.method === 'GET' && pathname === '/api/trades/closed') return sendJson(res, 200, { closed: trades.closed });
      if (req.method === 'GET' && pathname === '/api/logs') return sendJson(res, 200, { logs: logs.slice(-300).reverse() });
      if (req.method === 'GET' && pathname === '/api/settings') return sendJson(res, 200, settings);
      if (req.method === 'GET' && pathname === '/api/chart') {
        const symbol = url.searchParams.get('symbol') || 'BTCUSD';
        const tf = url.searchParams.get('tf') || '15m';
        const candles = await fetchCandles(symbol, tf, tf === '1d' ? 120 : 240);
        const closes = candles.map(c => c.close);
        const overlays = {
          ema20: ema(closes, 20), ema50: ema(closes, 50), ema200: ema(closes, 200),
          macd: macdState(candles), heikinAshi: heikinState(candles), qqeMod: qqeModState(candles, 'Line & Bar'), previousDay: tf === '1d' ? null : previousDayLevels(await fetchCandles(symbol, '1d', 60))
        };
        const signal = state.signals.find(s => s.symbol === symbol) || null;
        return sendJson(res, 200, { symbol, tf, candles, overlays, signal });
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (pathname === '/api/settings') {
          const prevUsable = safeNumber(settings.wallet.botUsableAmount, 0);
          const allowed = mergeDeep(settings, body || {});
          allowed.mode = 'PAPER';
          allowed.bot.autoOrders = false;
          settings = allowed;
          const newUsable = safeNumber(settings.wallet.botUsableAmount, prevUsable);
          if (newUsable !== prevUsable) {
            wallet.startingEquity = newUsable;
            wallet.baseUsableAmount = newUsable;
          }
          updateWalletFromTrades();
          saveSettings(settings);
          log('SETTINGS', 'Settings updated', { keys: Object.keys(body || {}), botUsableAmount: newUsable });
          return sendJson(res, 200, { ok: true, settings, wallet });
        }
        if (pathname === '/api/bot/start') { settings.bot.running = true; settings.bot.emergencyStopped = false; saveSettings(settings); log('BOT', 'Bot started in PAPER scanner mode'); scanMarkets(true).catch(()=>{}); return sendJson(res, 200, { ok: true, bot: settings.bot }); }
        if (pathname === '/api/bot/stop') { settings.bot.running = false; saveSettings(settings); log('BOT', 'Bot stopped'); return sendJson(res, 200, { ok: true, bot: settings.bot }); }
        if (pathname === '/api/bot/emergency-stop') { settings.bot.running = false; settings.bot.emergencyStopped = true; settings.bot.autoOrders = false; saveSettings(settings); log('EMERGENCY_STOP', 'Emergency stop activated'); return sendJson(res, 200, { ok: true, bot: settings.bot }); }
        if (pathname === '/api/scan/now') { const signals = await scanMarkets(true); return sendJson(res, 200, { ok: true, signals }); }
        if (pathname === '/api/trades/close') {
          const id = String(body.id || '').trim();
          const symbol = String(body.symbol || '').trim();
          const trade = trades.open.find(t => (id && t.id === id) || (symbol && t.symbol === symbol));
          if (!trade) return sendJson(res, 404, { ok: false, error: 'Open trade not found' });
          const ticker = state.tickers[trade.symbol];
          const mark = safeNumber(ticker?.mark_price || ticker?.close || trade.currentPrice || body.exitPrice || trade.entry);
          closeTrade(trade, mark, 'MANUAL_CLOSE');
          return sendJson(res, 200, { ok: true, trade });
        }
        if (pathname === '/api/paper/reset') {
          trades = JSON.parse(JSON.stringify(DEFAULT_TRADES));
          wallet = { ...DEFAULT_WALLET, startingEquity: settings.wallet.botUsableAmount, equity: settings.wallet.botUsableAmount, available: settings.wallet.botUsableAmount };
          saveTrades(trades); saveWallet(wallet); log('PAPER_RESET', 'Paper wallet/trades reset');
          return sendJson(res, 200, { ok: true, wallet, trades });
        }
        if (pathname === '/api/live/save-keys') {
          const apiKey = String(body.apiKey || '').trim();
          const apiSecret = String(body.apiSecret || '').trim();
          if (apiKey.length < 6 || apiSecret.length < 10) return sendJson(res, 400, { ok: false, error: 'Invalid API key or secret length' });
          const enc = encryptSecret(apiSecret);
          memoryApiKeyRaw = apiKey;
          apiKeys = { hasKey: true, apiKeyMasked: maskKey(apiKey), apiKeyHash: crypto.createHash('sha256').update(apiKey).digest('hex'), ...enc, testPassed: false, lastTestAt: null, lastError: null };
          saveApiKeys(apiKeys);
          log('API_KEYS', 'API key metadata saved; secret encrypted locally');
          return sendJson(res, 200, { ok: true, api: { hasKey: true, apiKeyMasked: apiKeys.apiKeyMasked, testPassed: false } });
        }
        if (pathname === '/api/live/test-connection') {
          try {
            const test = await deltaPrivateWithMemory('GET', '/v2/profile');
            apiKeys.testPassed = !!test.success;
            apiKeys.lastTestAt = nowIso();
            apiKeys.lastError = apiKeys.testPassed ? null : 'Profile check did not return success';
            saveApiKeys(apiKeys);
            log('API_TEST', apiKeys.testPassed ? 'API connection test passed' : 'API connection test failed');
            return sendJson(res, 200, { ok: apiKeys.testPassed, api: { hasKey: true, apiKeyMasked: apiKeys.apiKeyMasked, testPassed: apiKeys.testPassed, lastTestAt: apiKeys.lastTestAt, lastError: apiKeys.lastError } });
          } catch (err) {
            apiKeys.testPassed = false; apiKeys.lastTestAt = nowIso(); apiKeys.lastError = err.message; saveApiKeys(apiKeys);
            log('API_TEST_FAIL', 'API connection test failed', { error: err.message });
            return sendJson(res, 400, { ok: false, error: err.message });
          }
        }
        if (pathname === '/api/live/delete-keys') {
          apiKeys = JSON.parse(JSON.stringify(DEFAULT_API_KEYS)); memoryApiKeyRaw = null;
          settings.bot.liveMode = false; settings.bot.autoOrders = false; settings.mode = 'PAPER';
          saveApiKeys(apiKeys); saveSettings(settings); log('API_KEYS', 'API keys deleted');
          return sendJson(res, 200, { ok: true });
        }
        if (pathname === '/api/live/mode') {
          const desired = !!body.enabled;
          if (desired && (!apiKeys.hasKey || !apiKeys.testPassed)) return sendJson(res, 400, { ok: false, error: 'Live Mode blocked until API key is saved and connection test passes' });
          settings.bot.liveMode = desired; settings.mode = desired ? 'LIVE_REVIEW_ONLY' : 'PAPER'; settings.bot.autoOrders = false;
          saveSettings(settings); log('LIVE_MODE', desired ? 'Live review mode enabled; auto-orders still blocked' : 'Live mode disabled');
          return sendJson(res, 200, { ok: true, mode: settings.mode, bot: settings.bot });
        }
        if (pathname === '/api/live/auto-orders') {
          settings.bot.autoOrders = false; saveSettings(settings);
          log('LIVE_AUTO_BLOCKED', 'Auto Orders request blocked in this paper-first build');
          return sendJson(res, 400, { ok: false, error: 'Auto Orders are intentionally blocked in this build. Use paper mode and manual review only until exchange-side SL/TP protection is implemented and audited.' });
        }
      }
      return sendJson(res, 404, { ok: false, error: 'API route not found' });
    }
    return serveStatic(req, res, pathname);
  } catch (err) {
    log('SERVER_ERROR', 'Request failed', { path: pathname, error: err.message });
    return sendJson(res, 500, { ok: false, error: err.message });
  }
}

function bootstrapDataFiles() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(dataPath('settings.json'))) writeJson('settings.json', DEFAULT_SETTINGS);
  if (!fs.existsSync(dataPath('trades.json'))) writeJson('trades.json', DEFAULT_TRADES);
  if (!fs.existsSync(dataPath('logs.json'))) writeJson('logs.json', DEFAULT_LOGS);
  if (!fs.existsSync(dataPath('paperWallet.json'))) writeJson('paperWallet.json', { ...DEFAULT_WALLET, startingEquity: settings.wallet.botUsableAmount, equity: settings.wallet.botUsableAmount, available: settings.wallet.botUsableAmount });
  if (!fs.existsSync(dataPath('apiKeys.json'))) writeJson('apiKeys.json', DEFAULT_API_KEYS);
}

bootstrapDataFiles();
const server = http.createServer(route);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Delta Scanner V7.4 Professional Hard-Gate running: http://127.0.0.1:${PORT}`);
  console.log('Default mode: PAPER. Live auto-orders are blocked in this build.');
  log('BOOT', `Server started on port ${PORT}`, { version: APP_VERSION });
  scanMarkets(true).catch(err => log('BOOT_SCAN_ERROR', 'Initial scan failed', { error: err.message }));
});

setInterval(() => {
  settings = loadSettings();
  if (settings.bot.running && !settings.bot.emergencyStopped) scanMarkets(false).catch(err => log('SCAN_LOOP_ERROR', 'Scheduled scan failed', { error: err.message }));
  else updateOpenTradesWithPrices();
}, Math.max(30000, safeNumber(settings.bot.scanIntervalSec, 90) * 1000));

process.on('SIGINT', () => { console.log('\nStopping V7...'); log('SHUTDOWN', 'SIGINT'); process.exit(0); });
process.on('uncaughtException', err => { console.error(err); log('FATAL', 'Uncaught exception', { error: err.message }); });
process.on('unhandledRejection', err => { console.error(err); log('FATAL', 'Unhandled rejection', { error: err.message || String(err) }); });
