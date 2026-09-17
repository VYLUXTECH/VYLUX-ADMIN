const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const os = require('os');
const monitor = require('./monitor');

const DIR = process.env.VYLUX_DIR || os.homedir() || '/root';
const PORT = parseInt(process.env.SERVER_PORT || process.env.SSH_PORT || '2222', 10);
const WPORT = parseInt(process.env.PORT || '8080', 10);
const SSH_USER = 'admin';
const SSH_PASS = '';
const KEY = path.join(DIR, 'ssh_host_rsa');
const SERVERS_FILE = path.join(DIR, '.webpanel_servers.json');
const MAX_LOG_LINES = 500;
const SERVERS_DIR = path.join(DIR, 'servers');
const REVENUE_FILE = path.join(DIR, '.vylux_revenue.json');

// Single GitHub owner + token used for ALL service deploys (private repos).
const GH_TOKEN = process.env.VYLUX_GH_TOKEN || '';
const GH_OWNER = process.env.VYLUX_GH_OWNER || 'VYLUXTECH';
try { fs.mkdirSync(SERVERS_DIR, { recursive: true }); } catch {}
function serverDir(name) { return path.join(SERVERS_DIR, sanitizeName(name)); }
function safeServerPath(name, filePath) {
  const base = serverDir(name);
  const resolved = path.resolve(base, filePath || '');
  if (!resolved.startsWith(base)) return base;
  return resolved;
}

// ───────────────────── SSH SERVER ─────────────────────
function hk() {
  if (fs.existsSync(KEY)) return fs.readFileSync(KEY, 'utf8');
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  fs.writeFileSync(KEY, privateKey, { mode: 0o600 }); return privateKey;
}
function shellPath() { for (const s of ['/bin/bash','/usr/bin/bash','/bin/sh','/usr/bin/sh']) if (fs.existsSync(s)) return s; return '/bin/sh'; }
function hasBin(c) { try { execSync('which '+c,{stdio:'ignore'}); return true; } catch { return false; } }

try {
  const { Server } = require('ssh2');
  new Server({ hostKeys: [hk()], banner:'\r\nPtero-VPS\r\n' }, (c) => {
    c.on('authentication', (ctx) => { (ctx.method==='password' && ctx.username===SSH_USER) ? ctx.accept() : ctx.reject(['password']); });
    c.on('ready', () => { c.on('session', (a) => { const s = a();
      s.on('pty-req', (a) => a.accept());
      s.on('shell', (a) => { const st=a(), cmd=shellPath(); const p=spawn(hasBin('script')?'script':'bash', hasBin('script')?['-q','-c',cmd,'/dev/null']:[], {stdio:['pipe','pipe','pipe'],env:{...process.env,TERM:'xterm-256color'}}); st.pipe(p.stdin); p.stdout.pipe(st); p.stderr.pipe(st); p.on('exit',(c)=>{st.exit(c||0);st.close()}); st.on('close',()=>p.kill()); });
      s.on('exec', (a,_,i) => { const st=a(), p=spawn(shellPath(),['-c',i.command],{stdio:['pipe','pipe','pipe'],env:process.env}); st.pipe(p.stdin); p.stdout.pipe(st); p.stderr.pipe(st); p.on('exit',(c)=>{st.exit(c||0);st.close()}); st.on('close',()=>p.kill()); });
    }); }); c.on('error',()=>{});
  }).listen(PORT,'0.0.0.0',()=>console.log('[SSH] Port '+PORT+' - User: '+SSH_USER+' - No password'));
} catch(e){console.error('SSH error:',e.message)}

// ───────────────────── PROCESS MANAGER ─────────────────────
monitor.startMonitorChecker();
const supabaseStore = require('./supabase-store');
let servers = [];
try { if (fs.existsSync(SERVERS_FILE)) servers = JSON.parse(fs.readFileSync(SERVERS_FILE)); } catch {}
function saveServers() {
  try { fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2)); } catch {}
  if (supabaseStore.enabled) {
    supabaseStore.saveState({
      servers: Object.fromEntries(servers.map(s => [s.name, s])),
      revenue: revenue.services,
      gateway: revenue.gateway,
      pending: revenue.pending,
    }).catch(() => {});
    supabaseStore.setConfig('balance', revenue.balance ? JSON.stringify(revenue.balance) : '').catch(() => {});
    supabaseStore.setConfig('gatewayLastSync', String(revenue.gatewayLastSync || '')).catch(() => {});
  }
}

// ───────────────────── REVENUE / PAYMENTS ─────────────────────
const revenue = { services: {}, gateway: null, pending: {} }; // service -> { total, currency, updated, ... }
const GATEWAY_FILE = path.join(DIR, '.vylux_gateway.json');
function sanitizeGateway(g) {
  if (!g) return g;
  if (g.provider) delete g.provider;
  if (!g.baseUrl) g.baseUrl = 'https://pay.xdigitex.space/api';
  return g;
}
try { if (fs.existsSync(REVENUE_FILE)) { const r = JSON.parse(fs.readFileSync(REVENUE_FILE, 'utf8')); if (r && r.services) revenue.services = r.services; if (r.gateway) revenue.gateway = sanitizeGateway(r.gateway); if (r.pending) revenue.pending = r.pending; } } catch {}
try {
  const ext = JSON.parse(fs.readFileSync(GATEWAY_FILE, 'utf8'));
  if (ext && ext.key) revenue.gateway = sanitizeGateway(ext);
} catch {}
function saveRevenue() {
  try {
    fs.writeFileSync(REVENUE_FILE, JSON.stringify({ services: revenue.services, gateway: sanitizeGateway(revenue.gateway), pending: revenue.pending }, null, 2));
    if (revenue.gateway) fs.writeFileSync(GATEWAY_FILE, JSON.stringify(sanitizeGateway(revenue.gateway), null, 2));
  } catch {}
  if (supabaseStore.enabled) {
    supabaseStore.saveState({
      servers: Object.fromEntries(servers.map(s => [s.name, s])),
      revenue: revenue.services,
      gateway: revenue.gateway,
      pending: revenue.pending,
    }).catch(() => {});
    supabaseStore.setConfig('balance', revenue.balance ? JSON.stringify(revenue.balance) : '').catch(() => {});
    supabaseStore.setConfig('gatewayLastSync', String(revenue.gatewayLastSync || '')).catch(() => {});
  }
}

// Boot-time: pull authoritative state from Supabase (if configured) and
// overlay it over whatever the local JSON files had.
async function loadFromSupabase() {
  if (!supabaseStore.enabled) return;
  try {
    const st = await supabaseStore.loadState();
    if (!st || !st.servers) return;
    const rebuilt = [];
    for (const [name, data] of Object.entries(st.servers)) rebuilt.push({ ...data, name });
    if (rebuilt.length) servers = rebuilt;
    if (st.revenue) revenue.services = st.revenue;
    if (st.gateway) revenue.gateway = sanitizeGateway(st.gateway);
    if (st.pending) revenue.pending = st.pending;
    const bal = await supabaseStore.getConfig('balance');
    if (bal) { try { revenue.balance = JSON.parse(bal); } catch {} }
    const lastSync = await supabaseStore.getConfig('gatewayLastSync');
    if (lastSync) revenue.gatewayLastSync = parseInt(lastSync) || null;
    const audit = await supabaseStore.getConfig('audit');
    if (audit) { try { auditLog = JSON.parse(audit); } catch {} }
    console.log('[SUPA] state loaded from Supabase (' + rebuilt.length + ' services)');
  } catch (e) {
    console.log('[SUPA] load failed, keeping local files:', e.message);
  }
}

// ── Activity / audit log: what was done with the admin system ──
const AUDIT_FILE = path.join(DIR, '.vylux_audit.json');
let auditLog = []; // { t: ms, kind, text }
function saveAudit() {
  try { fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditLog, null, 2)); } catch {}
  if (supabaseStore.enabled) {
    supabaseStore.setConfig('audit', JSON.stringify(auditLog)).catch(() => {});
  }
}
function logActivity(kind, text) {
  if (typeof text !== 'string') text = String(text);
  auditLog = [{ t: Date.now(), kind, text: text.slice(0, 400) }, ...auditLog].slice(0, 200);
  saveAudit();
}
try { if (fs.existsSync(AUDIT_FILE)) { const a = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')); if (Array.isArray(a)) auditLog = a; } } catch {}

// ── Payment gateway: ONE key, auto-attributes txs to services ──
// Each service may carry a `refPrefix`. Attribution is flexible: a payment
// belongs to a service when the refPrefix appears in its reference, tx_ref,
// description, or metadata values (case-insensitive).
async function syncGateway({ force } = {}) {
  const g = revenue.gateway;
  if (!g || !g.key) return { ok: false, message: 'No gateway key configured' };
  // Cache: re-pull at most every 60s unless forced.
  if (!force && revenue.gatewayLastSync && Date.now() - revenue.gatewayLastSync < 60000) {
    return { ok: true, cached: true };
  }
  const base = g.baseUrl || 'https://pay.xdigitex.space/api';
  const listUrl = (page) => `${base}/payments?page=${page}&per_page=100`;
  const headers = { 'X-API-Key': g.key };

  // Wallet balance (total money on the gateway).
  let balance = null;
  try {
    const br = await fetch(`${base}/balance`, { headers });
    const b = await br.json();
    if (b) {
      const raw = Number(b.available_balance != null ? b.available_balance : b.balance);
      if (!isNaN(raw)) balance = { total: raw, available: Number(b.available_balance), currency: 'UGX' };
    }
  } catch {}

  const prefixes = servers.filter(s => s.refPrefix).map(s => ({
    name: s.name, refPrefix: String(s.refPrefix).toLowerCase(),
  }));
  const totals = {};
  const rawTxs = [];
  let pulled = 0;
  const pages = Math.min(parseInt(g.maxPages || '10', 10) || 10, 10);
  for (let page = 1; page <= pages; page++) {
    let body = null;
    try {
      const r = await fetch(listUrl(page), { headers });
      if (!r.ok) break;
      body = await r.json();
    } catch { break; }
    if (!Array.isArray(body.data) || !body.data.length) break;
    const lastPage = parseInt(body.last_page || '1', 10) || 1;
    for (const tx of body.data) {
      const status = String(tx.status || '').toLowerCase();
      if (status && !['successful', 'success', 'completed'].includes(status)) continue;
      let amount = Number(tx.net_amount != null ? tx.net_amount : tx.amount);
      if (isNaN(amount) || !amount) amount = Number(tx.amount);
      if (isNaN(amount)) continue;
      pulled++;
      rawTxs.push({ tx, amount, status });
    }
    if (page >= lastPage || page >= pages) break;
  }
  // Attribute each completed payment to a service by refPrefix match.
  function attributionText(tx) {
    const parts = [tx.reference, tx.tx_ref, tx.description];
    const meta = tx.metadata;
    if (meta && typeof meta === 'object') for (const v of Object.values(meta)) parts.push(v);
    return parts.filter(Boolean).join(' ').toLowerCase();
  }
  for (const { tx, amount } of rawTxs) {
    const hay = attributionText(tx);
    const matched = prefixes.find(p => hay.includes(p.refPrefix));
    if (!matched) continue;
    const currency = tx.currency || 'UGX';
    const cur = totals[matched.name] || { sum: 0, currency };
    cur.sum += amount;
    cur.currency = currency;
    totals[matched.name] = cur;
  }
  // Merge: gateway totals feed the per-service total, manual overrides win.
  for (const p of prefixes) {
    const t = totals[p.name];
    const gained = t ? t.sum : 0;
    const currency = t ? t.currency : 'UGX';
    const cached = revenue.services[p.name];
    if (!cached) { revenue.services[p.name] = { total: gained, currency, updated: new Date().toISOString() }; continue; }
    if (cached.manualTotal != null) continue; // manual wins
    revenue.services[p.name] = { ...cached, total: gained, paidTotal: gained, currency, updated: new Date().toISOString() };
  }
  revenue.balance = balance;
  revenue.gatewayLastSync = Date.now();
  saveRevenue();
  logActivity('sync', `Gateway sync: ${pulled} tx pulled, ${Object.keys(totals).length} services matched`);
  return { ok: true, pulled, matched: Object.keys(totals).length, total: balance ? balance.total : null };
}

function revenueFromUrl(u) {
  try { const r = JSON.parse(execSync('curl -s --max-time 8 ' + JSON.stringify(u), { encoding: 'utf8' })); return r; } catch { /* non-json or missing */ }
  return null;
}

// ── Per-service payment endpoints (Xdigitex) ──
// Each service gets a unique paySecret + refPrefix on create. The service calls
// POST /api/pay/<name> with its secret to initiate a real charge; money is
// attributed back via syncGateway matching the refPrefix.
const PANEL_ORIGIN = (process.env.PANEL_ORIGIN || 'https://vyadmin.onrender.com').replace(/\/+$/, '');

function makeRefPrefix(name) {
  const base = String(name || 'SVC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (base || 'SVC').slice(0, 12);
}

// Ensure a new service has payment fields; returns { refPrefix, paySecret }.
function ensurePayFields(entry) {
  entry.refPrefix = entry.refPrefix || makeRefPrefix(entry.name);
  entry.paySecret = entry.paySecret || crypto.randomBytes(12).toString('hex');
  return entry;
}

// Begin a real Xdigitex charge. Reference embeds the service refPrefix so
// syncGateway can attribute the completed payment to the right service.
async function initiateServiceCharge(entry, b) {
  const g = revenue.gateway;
  if (!g || !g.key) throw new Error('Payment gateway is not configured');
  const amount = Number(b.amount);
  if (!(amount > 0)) throw new Error('Amount must be a positive number');
  const refPrefix = entry.refPrefix || makeRefPrefix(entry.name);
  ensurePayFields(entry);
  const reference = `${refPrefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  const base = g.baseUrl || 'https://pay.xdigitex.space/api';
  const body = {
    amount,
    currency: b.currency || 'UGX',
    gateway: b.gateway || (b.phone ? 'mobile' : 'card'),
    description: `${b.description || 'Payment'} (${reference})`,
    callback_url: b.callbackUrl || b.callback_url || `${PANEL_ORIGIN}/api/pay/${encodeURIComponent(entry.name)}/status/${reference}`,
    webhook_url: b.webhookUrl || b.webhook_url || `${PANEL_ORIGIN}/api/pay/webhook`,
  };
  if (b.phone) body.phone = b.phone;
  if (b.email) body.email = b.email;
  if (b.first_name) body.first_name = b.first_name;
  if (b.last_name) body.last_name = b.last_name;
  const r = await fetch(`${base}/payments/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': g.key },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data || data.success === false) {
    throw new Error((data && data.message) || data.error || `Gateway error HTTP ${r.status}`);
  }
  // Track initiated reference for the webhook + payments page.
  const txref = data.reference || data.tx_ref || reference;
  revenue.pending = revenue.pending || {};
  revenue.pending[txref] = { name: entry.name, amount, currency: b.currency || 'UGX', refPrefix, at: Date.now() };
  saveRevenue();
  return {
    reference: txref,
    status: data.status || data.pawa_status || 'initiated',
    amount: Number(data.amount ?? amount),
    net_amount: data.net_amount != null ? Number(data.net_amount) : null,
    fee: data.fee != null ? Number(data.fee) : null,
    redirect_url: data.redirect_url || null,
    checkout_url: data.checkout_url || null,
    qrcode_link: data.qrcode_link || null,
    message: data.message || null,
    deposit_id: data.deposit_id || null,
  };
}

// Check a service charge's status directly on the gateway.
async function serviceChargeStatus(entry, reference) {
  const g = revenue.gateway;
  if (!g || !g.key) throw new Error('Payment gateway is not configured');
  const base = g.baseUrl || 'https://pay.xdigitex.space/api';
  const r = await fetch(`${base}/payments/${encodeURIComponent(reference)}/status`, {
    headers: { 'X-API-Key': g.key },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data && data.message) || `Gateway error HTTP ${r.status}`);
  return data;
}

// Webhook receiver: Xdigitex POSTs on payment.completed / payment.failed.
async function handlePayWebhook(b) {
  const ref = (b && b.reference) || '';
  const event = (b && b.event) || '';
  const status = String((b && b.status) || '').toLowerCase();
  if (event && event !== 'payment.completed' && event !== 'payment.failed') return { ok: true, ignored: true };
  const pending = (revenue.pending || {})[ref];
  let name = null;
  let amount = Number(b.amount);
  if (pending) name = pending.name;
  if (!name) {
    try {
      const prefixHit = servers.find(s => s.refPrefix && ref.toUpperCase().startsWith(String(s.refPrefix).toUpperCase()));
      if (prefixHit) name = prefixHit.name;
    } catch {}
  }
  if (!name || status !== 'completed') return { ok: true, name, completed: false };
  const currency = b.currency || 'UGX';
  const prev = revenue.services[name] || {};
  revenue.services[name] = {
    ...prev,
    total: (Number(prev.total) || 0) + amount,
    paidTotal: (Number(prev.paidTotal) || 0) + amount,
    currency,
    updated: new Date().toISOString(),
    webhook: ref,
  };
  saveRevenue();
  logActivity('pay', `Payment completed for ${name}: ${amount} ${currency} (${ref})`);
  return { ok: true, name, completed: true, amount };
}

function getServiceRevenue(entry, cachedOnly) {
  const cached = revenue.services[entry.name];
  // 1. Manual amount recorded in the panel always wins if present.
  if (cached && cached.manualTotal != null) return cached;
  // 2. Poll the service's own revenue endpoint.
  if (entry.revenueUrl && (!cached || !cached.lastFetch || Date.now() - cached.lastFetch > 60000)) {
    try {
      const data = revenueFromUrl(entry.revenueUrl);
      if (data) {
        const field = entry.revenueField || 'revenue';
        const raw = data[field] != null ? data[field] : (data.data && data.data[field]);
        const total = Number(raw);
        if (!isNaN(total)) {
          revenue.services[entry.name] = {
            total, currency: (data.currency) || 'UGX',
            revenueUrl: entry.revenueUrl, lastFetch: Date.now(),
          };
          saveRevenue();
          return revenue.services[entry.name];
        }
      }
    } catch {}
  }
  return cached || null;
}

async function paymentsOverview() {
  if (revenue.gateway && revenue.gateway.key) {
    try { await syncGateway(); } catch { /* non-fatal */ }
  }
  const rows = [];
  let grandTotal = 0;
  const grandCurrency = {};
  for (const s of servers) {
    const svc = getServiceRevenue(s);
    if (!svc || svc.total == null) continue;
    const total = Number(svc.total) || 0;
    grandTotal += total;
    const cur = svc.currency || 'UGX';
    grandCurrency[cur] = (grandCurrency[cur] || 0) + total;
    rows.push({
      name: s.name,
      running: procTable[procKey(s.name)]?.running || false,
      domain: s.domain || '',
      revenueUrl: s.revenueUrl || '',
      total,
      currency: cur,
      updated: svc.lastFetch ? new Date(svc.lastFetch).toISOString() : (svc.updated || null),
    });
  }
  rows.sort((a, b) => b.total - a.total);
  let top = null;
  if (rows.length) top = rows[0].name;
  return {
    total: grandTotal,
    currencies: grandCurrency,
    walletBalance: revenue.balance || null,
    services: rows,
    topService: top,
    count: rows.length,
    lastSync: revenue.gatewayLastSync || null,
  };
}

async function recordPayment(name, amount, currency, note) {
  const old = revenue.services[name] || {};
  const manualTotal = (Number(old.manualTotal) || 0) + (Number(amount) || 0);
  revenue.services[name] = {
    ...old,
    total: manualTotal,
    manualTotal,
    currency: currency || old.currency || 'UGX',
    updated: new Date().toISOString(),
    note: note || old.note || '',
  };
  saveRevenue();
  return revenue.services[name];
}

function setPayment(name, amount, currency, note) {
  const old = revenue.services[name] || {};
  revenue.services[name] = {
    ...old,
    total: Number(amount) || 0,
    manualTotal: Number(amount) || 0,
    currency: currency || old.currency || 'UGX',
    updated: new Date().toISOString(),
    note: note || old.note || '',
  };
  saveRevenue();
  return revenue.services[name];
}

// Auto-register a URL monitor for every deployed service that has a domain.
function syncMonitorsToServices() {
  const byId = {};
  monitor.monitors.forEach(m => byId[m.id] = m);
  for (const s of servers) {
    const id = 'svc:' + sanitizeName(s.name);
    const existing = byId[id];
    if (s.domain) {
      const url = /^https?:\/\//i.test(s.domain) ? s.domain : 'http://' + s.domain;
      if (!existing) {
        monitor.monitors.push({ id, name: s.name + ' · auto', url, method: 'GET', timeout: 10000, keyword: '', webhook: '', paused: false, createdAt: new Date().toISOString() });
      } else {
        existing.url = url;
        existing.name = s.name + ' · auto';
        existing.paused = false;
      }
    } else if (existing) {
      existing.paused = true;
    }
  }
  monitor.monitors = monitor.monitors.filter(m => !m.id.startsWith('svc:') || servers.some(s => 'svc:' + sanitizeName(s.name) === m.id));
  monitor.saveMonitors();
}
syncMonitorsToServices();

// ───────────────────── AUTO-EXTRACT ZIPS ─────────────────────
function autoExtract() {
  const zips = fs.readdirSync(DIR).filter(f => f.endsWith('.zip') && !f.startsWith('.'));
  for (const z of zips) {
    const base = z.replace(/\.zip$/i, '').replace(/\s*\(\d+\)$/, '');
    const target = path.join(DIR, base);
    if (fs.existsSync(target)) continue;
    console.log(`[AUTO] Extracting ${z}...`);
    try {
      execSync(`unzip -o "${path.join(DIR, z)}" -d "${DIR}" 2>/dev/null`, { stdio: 'ignore', timeout: 30000 });
      // Find the actual extracted dir
      const entries = fs.readdirSync(DIR).filter(f => f.startsWith(base) && fs.statSync(path.join(DIR, f)).isDirectory());
      const dir = entries[0];
      if (!dir) { console.log(`[AUTO] No dir found in ${z}`); continue; }
      const fullDir = path.join(DIR, dir);
      // Check for package.json and install
      if (fs.existsSync(path.join(fullDir, 'package.json'))) {
        console.log(`[AUTO] Installing deps for ${dir}...`);
        try { execSync('npm install --production', { cwd: fullDir, stdio: 'ignore', timeout: 60000 }); } catch {}
      }
      // Register as a managed server if it looks like an app
      const name = dir.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (!servers.find(s => s.name === name)) {
        servers.push({ name, cmd: `${dir}/index.js` });
        saveServers();
        console.log(`[AUTO] Registered server: ${name}`);
      }
    } catch (e) { console.log(`[AUTO] Failed ${z}: ${e.message}`); }
  }
}
try { autoExtract(); } catch (e) { console.log('[AUTO] Error:', e.message); }

// ───────────────────── PROCESS MANAGER ─────────────────────
const procTable = {};
const pendingStop = new Set();
function sanitizeName(n) { return n.replace(/[^a-zA-Z0-9_-]/g, '_'); }
function procKey(name) { return sanitizeName(name); }

// Resolve any supported GitHub URL to a token-authed URL owned by GH_OWNER.
function ghUrl(repoUrl) {
  if (!repoUrl || typeof repoUrl !== 'string') return null;
  const m = repoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (!m) throw new Error('Only GitHub repos are supported');
  const [, owner, repo] = m;
  if (owner.toLowerCase() !== GH_OWNER.toLowerCase()) {
    throw new Error('Deploys are locked to the owner account "' + GH_OWNER + '"');
  }
  return 'https://x-access-token:' + GH_TOKEN + '@github.com/' + GH_OWNER + '/' + repo + '.git';
}

function gitClone(cfg) {
  if (!cfg.repoUrl) return;
  const sd = serverDir(cfg.name);
  try { fs.mkdirSync(sd, { recursive: true }); } catch {}
  if (fs.existsSync(path.join(sd, '.git'))) return;
  try {
    const url = ghUrl(cfg.repoUrl);
    execSync('git clone ' + url + ' .', { cwd: sd, timeout: 120000, encoding: 'utf8' });
    console.log('[GIT] cloned ' + cfg.repoUrl + ' -> ' + cfg.name);
  } catch (e) {
    console.log('[GIT] ' + cfg.name + ' clone failed: ' + (e.stderr || e.message).slice(0, 300));
  }
}

function gitPull(cfg) {
  if (!cfg.repoUrl) return;
  const sd = serverDir(cfg.name);
  if (!fs.existsSync(path.join(sd, '.git'))) { gitClone(cfg); return; }
  try {
    const url = ghUrl(cfg.repoUrl);
    execSync('git remote set-url origin ' + url, { cwd: sd, timeout: 15000, encoding: 'utf8' });
    const out = require('child_process').execSync('git pull --ff-only', { cwd: sd, timeout: 30000, encoding: 'utf8' });
    console.log('[GIT] ' + cfg.name + ': ' + out.trim().slice(0, 200));
  } catch (e) {
    console.log('[GIT] ' + cfg.name + ' pull failed: ' + (e.stderr || e.message).slice(0, 200));
  }
}

function spawnServer(cfg) {
  const key = procKey(cfg.name);
  if (procTable[key] && procTable[key].running) return null;
  const sd = serverDir(cfg.name);
  try { fs.mkdirSync(sd, { recursive: true }); } catch {}
  gitPull(cfg);
  const mainFile = cfg.cmd || 'index.js';
  const cmd = mainFile.startsWith('node ') || mainFile.includes(' ') ? mainFile : 'node ' + mainFile;
  const p = spawn('sh', ['-c', cmd], {
    cwd: sd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env }
  });
  const entry = {
    proc: p,
    running: true,
    startTime: Date.now(),
    log: [],
    name: cfg.name,
  };
  procTable[key] = entry;
  function appendLog(text) {
    entry.log.push(text);
    if (entry.log.length > MAX_LOG_LINES) entry.log.shift();
    broadcast({ type: 'serverLog', name: cfg.name, data: text });
  }
  p.stdout.on('data', d => appendLog(d.toString()));
  p.stderr.on('data', d => appendLog(d.toString()));
  p.on('exit', (code, sig) => {
    entry.running = false;
    entry.exitCode = code;
    entry.exitSignal = sig;
    broadcast({ type: 'serverState', name: cfg.name, running: false, code });
  if (!pendingStop.has(cfg.name) && code === 0) {
    setTimeout(() => spawnServer(cfg), 1000);
  }
  });
  broadcast({ type: 'serverState', name: cfg.name, running: true });
  return entry;
}

function stopServer(name) {
  pendingStop.add(name);
  const key = procKey(name);
  const entry = procTable[key];
  if (!entry || !entry.running) return false;
  const spid = entry.proc.pid;
  const rpid = realPid(spid);
  try { process.kill(spid, 'SIGTERM'); } catch {}
  try { process.kill(rpid, 'SIGTERM'); } catch {}
  setTimeout(() => {
    try { process.kill(spid, 'SIGKILL'); } catch {}
    try { process.kill(rpid, 'SIGKILL'); } catch {}
  }, 3000);
  pendingStop.delete(name);
  entry.running = false;
  broadcast({ type: 'serverState', name, running: false });
  return true;
}

function restartServer(cfg) {
  stopServer(cfg.name);
  let attempts = 0;
  const wait = () => {
    const key = procKey(cfg.name);
    if (procTable[key] && procTable[key].running) return setTimeout(wait, 100);
    if (attempts++ > 5) { spawnServer(cfg); return; }
    // Wait for port to be released (TIME_WAIT) before spawning
    setTimeout(() => spawnServer(cfg), 3000);
  };
  setTimeout(wait, 200);
  return { ok: true };
}

// Track CPU usage per process
const procCpuPrev = {};
const diskCache = {};
function dirSize(dir, key) {
  const now = Date.now();
  const cached = diskCache[key];
  if (cached && now - cached.time < 30000) return cached.size;
  let size = 0;
  const walk = (p) => {
    let items;
    try { items = fs.readdirSync(p, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const fp = path.join(p, it.name);
      if (it.isSymbolicLink()) continue;
      if (it.isDirectory()) walk(fp);
      else { try { size += fs.statSync(fp).size; } catch {} }
    }
  };
  walk(dir);
  const mb = Math.round(size / 1048576);
  diskCache[key] = { size: mb, time: now };
  return mb;
}
function realPid(pid) {
  try {
    const children = fs.readFileSync('/proc/'+pid+'/task/'+pid+'/children', 'utf8').trim();
    if (children) {
      const kids = children.split(' ').map(Number).filter(Boolean);
      for (const k of kids) {
        try {
          const c = fs.readFileSync('/proc/'+k+'/comm', 'utf8').trim();
          if (c === 'node' || c.startsWith('node')) return k;
        } catch {}
      }
    }
  } catch {}
  return pid;
}

function getProcUsage(pid) {
  try {
    const rpid = realPid(pid);
    const stat = fs.readFileSync('/proc/'+rpid+'/stat', 'utf8');
    const parts = stat.match(/\(.+\)|\S+/g);
    if (!parts || parts.length < 22) return { cpu: 0, mem: 0 };
    const utime = parseInt(parts[13]) || 0;
    const stime = parseInt(parts[14]) || 0;
    const total = utime + stime;
    const clkTck = 100;
    const prev = procCpuPrev[rpid] || { total: 0, time: Date.now() };
    const now = Date.now();
    const dt = Math.max(now - prev.time, 100) / 1000;
    const cpu = dt > 0 ? ((total - prev.total) / clkTck / dt) * 100 : 0;
    procCpuPrev[rpid] = { total, time: now };
    const status = fs.readFileSync('/proc/'+rpid+'/status', 'utf8');
    const memMatch = status.match(/VmRSS:\s+(\d+)/);
    const mem = memMatch ? parseInt(memMatch[1]) : 0;
    return { cpu: Math.round(cpu * 10) / 10, mem };
  } catch { return { cpu: 0, mem: 0 }; }
}

function getProcStatus(name) {
  const key = procKey(name);
  const entry = procTable[key];
  if (!entry) return { running: false, uptime: 0, log: '', cpu: 0, mem: 0, disk: 0 };
  const usage = entry.proc && entry.running ? getProcUsage(entry.proc.pid) : { cpu: 0, mem: 0 };
  return {
    running: entry.running,
    uptime: entry.running ? Math.floor((Date.now() - entry.startTime) / 1000) : 0,
    exitCode: entry.exitCode ?? null,
    log: entry.log.join(''),
    cpu: usage.cpu,
    mem: usage.mem,
    disk: dirSize(serverDir(name), name),
    pid: entry.proc ? entry.proc.pid : null,
  };
}

// ───────────────────── PATH SANITIZATION ─────────────────────
function safePath(p) {
  if (!p) return DIR;
  const resolved = path.resolve(DIR, p);
  if (!resolved.startsWith(DIR)) return DIR;
  return resolved;
}

// ───────────────────── WEBSOCKET ─────────────────────
let wsClients = new Set();
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// ───────────────────── SERVE HTML ─────────────────────
// ───────────────────── AUTH ─────────────────────
const AUTH_PASSWORD = process.env.VYLUX_PASSWORD || (() => { try { return fs.readFileSync(path.join(DIR, '.vylux_password'), 'utf8').trim(); } catch {} return ''; })();
const ADMIN_TOKEN = (() => {
  const tokenFile = path.join(DIR, '.vylux_token');
  try {
    const existing = fs.readFileSync(tokenFile, 'utf8').trim();
    if (existing) return existing;
  } catch {}
  const fresh = crypto.randomBytes(32).toString('hex');
  try { fs.writeFileSync(tokenFile, fresh, { mode: 0o600 }); } catch {}
  return fresh;
})();

function requireAuth(req) {
  if (!AUTH_PASSWORD) return true;
  return req.headers['authorization'] === `Bearer ${ADMIN_TOKEN}`;
}

// ───────────────────── SERVE HTML ─────────────────────
const HTML_PATH = path.join(__dirname, 'index.html');
const LOCAL_FRONTEND = path.join(__dirname, '..', 'dist');
const NEW_FRONTEND = fs.existsSync(LOCAL_FRONTEND) ? LOCAL_FRONTEND : path.join(DIR, 'system-panel', 'dist');
const NEW_HTML_PATH = path.join(NEW_FRONTEND, 'index.html');
let HTML = '';
let NEW_HTML = '';
function loadHTML() {
  try { HTML = fs.readFileSync(HTML_PATH, 'utf8'); } catch (e) { HTML = '<h1>index.html not found</h1>'; }
  try { NEW_HTML = fs.readFileSync(NEW_HTML_PATH, 'utf8'); } catch (e) { NEW_HTML = HTML; }
}
try { loadHTML(); fs.watchFile(HTML_PATH, () => { loadHTML(); console.log('[WEB] index.html reloaded'); }); } catch {}

// ───────────────────── API HANDLERS ─────────────────────
function json(res, data, status) {
  res.writeHead(status || 200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}
function error(res, msg, status) {
  json(res, { error: true, message: msg }, status || 400);
}
async function parseBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => {
      try { resolve(JSON.parse(d)); } catch { resolve({}); }
    });
  });
}
function parseFormData(req, boundary) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c.toString('latin1'));
    req.on('end', () => {
      const parts = body.split('--' + boundary);
      let fileData = null, fileName = '', uploadPath = DIR;
      for (const part of parts) {
        if (!part.includes('Content-Disposition')) continue;
        const nm = part.match(/name="([^"]+)"/);
        if (!nm) continue;
        const content = part.split('\r\n\r\n')[1]?.split('\r\n--')[0] || '';
        if (nm[1] === 'path') uploadPath = content.trim();
        if (nm[1] === 'file') {
          const fm = part.match(/filename="([^"]+)"/);
          if (fm) fileName = fm[1];
          fileData = content;
        }
      }
      resolve({ fileData, fileName, uploadPath });
    });
  });
}

let statsCache = { data: null, time: 0 };
function getStats() {
  const now = Date.now();
  if (statsCache.data && now - statsCache.time < 1000) return statsCache.data;
  const c = os.cpus();
  const cpu = process.cpuUsage();
  let diskTotal = 0;
  let diskUsed = 0;
  try {
    const st = fs.statfsSync(DIR);
    diskTotal = st.blocks * st.bsize;
    diskUsed = (st.blocks - st.bfree) * st.bsize;
  } catch {}
  const s = {
    hostname: os.hostname(),
    uptime: Math.floor(os.uptime()) + 's',
    node: process.version,
    cpu: Math.round((cpu.user + cpu.system) / 10000 / c.length),
    cpuCores: c.length,
    memTotal: os.totalmem(),
    memUsed: os.totalmem() - os.freemem(),
    diskTotal,
    diskUsed,
    platform: os.platform(),
    arch: os.arch(),
  };
  statsCache = { data: s, time: now };
  return s;
}

// ───────────────────── HTTP SERVER ─────────────────────
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  const m = req.method;

  // CORS preflight
  if (m === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
    return res.end();
  }

  // Serve frontend assets (JS, CSS, images from built SPA)
  const assetPath = path.join(NEW_FRONTEND, p === '/' ? 'index.html' : p);
  if (p.startsWith('/assets/') && fs.existsSync(assetPath)) {
    const ext = path.extname(p).toLowerCase();
    const types = { '.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' });
    return res.end(fs.readFileSync(assetPath));
  }

  // Serve panel HTML — use new frontend if available
  if (p === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(NEW_HTML);
  }

  // SPA fallback: serve index.html for non-API, non-asset paths
  if (!p.startsWith('/api/') && !p.startsWith('/ws') && fs.existsSync(NEW_HTML_PATH)) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(NEW_HTML);
  }

  try {
    // ── Auth: Login ──
    if (p === '/api/login' && m === 'POST') {
      const b = await parseBody(req);
      if (!AUTH_PASSWORD || b.password === AUTH_PASSWORD) {
        logActivity('auth', 'Admin login');
        return json(res, { token: ADMIN_TOKEN });
      }
      logActivity('auth', 'Failed login attempt');
      return json(res, { error: true, message: 'Invalid password' }, 401);
    }

    // ── Per-service payment endpoints (service uses its own paySecret) ──
    // Webhook receiver — the gateway POSTs here, no admin token required.
    if (p === '/api/pay/webhook' && m === 'POST') {
      const b = await parseBody(req);
      if (!b || (b !== null && typeof b !== 'object')) return json(res, { ok: true });
      return json(res, await handlePayWebhook(b));
    }

    const payMatch = p.match(/^\/api\/pay\/([^/]+)(?:\/status\/(.+))?$/);
    if (payMatch && m === 'POST') {
      const svcName = decodeURIComponent(payMatch[1]);
      const entry = servers.find(x => x.name === svcName);
      if (!entry) return error(res, 'Service not found', 404);
      const secret = String((req.headers['x-pay-key'] || req.headers['x-api-key'] || '').trim());
      if (!entry.paySecret || secret !== entry.paySecret) return error(res, 'Unauthorized', 401);
      if (payMatch[2]) {
        const st = await serviceChargeStatus(entry, decodeURIComponent(payMatch[2])).catch(e => ({ error: e.message }));
        return json(res, st);
      }
      const b = await parseBody(req);
      const charge = await initiateServiceCharge(entry, b).catch(e => ({ error: e.message }));
      if (charge && !charge.error) logActivity('pay', `Charge initiated for ${svcName}: ${charge.amount} ${b.currency || 'UGX'} (${charge.reference})`);
      return json(res, charge);
    }

    // ── Auth check for all other API routes ──
    if (p.startsWith('/api/') && !requireAuth(req)) {
      return json(res, { error: true, message: 'Unauthorized' }, 401);
    }

    // ── Activity / audit log ──
    if (p === '/api/activity' && m === 'GET') {
      return json(res, auditLog);
    }

    // ── Health ──
    if (p === '/api/health' && m === 'GET') {
      return json(res, { status: 'ok', uptime: Math.floor(os.uptime()) });
    }

    // ── Supabase database health ──
    if (p === '/api/supabase/health' && m === 'GET') {
      try {
        const h = await supabaseStore.health();
        if (h.enabled) return json(res, h);
        return json(res, { enabled: false, ok: false, message: 'Supabase is not configured. Set VYLUX_SUPABASE_URL and VYLUX_SUPABASE_ROLE_KEY.' });
      } catch (e) {
        return json(res, { enabled: false, ok: false, message: e.message });
      }
    }

    // ── GitHub: list owner's repos (private included) for deploy picker ──
    if (p === '/api/gh/repos' && m === 'GET') {
      try {
        const r = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner', {
          headers: { 'Authorization': 'Bearer ' + GH_TOKEN, 'Accept': 'application/vnd.github+json' },
        });
        const data = await r.json();
        if (!Array.isArray(data)) throw new Error('GitHub error');
        return json(res, data.map(x => ({
          name: x.name,
          fullName: x.full_name,
          htmlUrl: x.html_url,
          cloneUrl: x.clone_url,
          defaultBranch: x.default_branch,
          description: x.description || '',
          private: !!x.private,
          updated: x.updated_at,
        })));
      } catch (e) {
        return error(res, 'GitHub list failed: ' + (e.message || e).slice(0, 200));
      }
    }

    // ── System info ──
    if (p === '/api/info' && m === 'GET') {
      return json(res, getStats());
    }

    // ── List servers ──
    if (p === '/api/servers' && m === 'GET') {
      return json(res, servers.map(s => {
        ensurePayFields(s);
        return { ...s, payUrl: `${PANEL_ORIGIN}/api/pay/${encodeURIComponent(s.name)}` };
      }));
    }

    // ── Replace all servers ──
    if (p === '/api/servers' && m === 'PUT') {
      servers = await parseBody(req);
      servers = servers.map(ensurePayFields);
      saveServers();
      syncMonitorsToServices();
      return json(res, servers.map(s => ({ ...s, payUrl: `${PANEL_ORIGIN}/api/pay/${encodeURIComponent(s.name)}` })));
    }

    // ── Payments ──
    if (p === '/api/payments/overview' && m === 'GET') {
      return json(res, await paymentsOverview());
    }

    if (p === '/api/payments/gateway' && m === 'GET') {
      const g = revenue.gateway;
      return json(res, {
        configured: !!(g && g.key),
        lastSync: revenue.gatewayLastSync || null,
        balance: revenue.balance || null,
      });
    }

    if (p === '/api/payments/gateway' && m === 'POST') {
      const b = await parseBody(req);
      const key = String(b.key || '').trim();
      if (!key) return error(res, 'Gateway key is required');
      revenue.gateway = {
        key,
        baseUrl: String(b.baseUrl || '').trim() || 'https://pay.xdigitex.space/api',
        maxPages: parseInt(b.maxPages || '10', 10) || 10,
      };
      revenue.gatewayLastSync = 0;
      saveRevenue();
      logActivity('gateway', 'Payment gateway key updated');
      const s = await syncGateway({ force: true }).catch(() => ({ ok: false, message: 'sync failed' }));
      return json(res, { ok: true, sync: s });
    }

    if (p === '/api/payments/sync' && m === 'POST') {
      const s = await syncGateway({ force: true }).catch(e => ({ ok: false, message: e.message }));
      logActivity('gateway', s.ok ? `Manual gateway sync (${s.pulled} tx)` : `Gateway sync failed: ${s.message}`);
      return json(res, s);
    }

    if (p === '/api/payments/record' && m === 'POST') {
      const b = await parseBody(req);
      if (!b.name) return error(res, 'Service name is required');
      if (b.amount == null || isNaN(b.amount)) return error(res, 'Amount is required');
      const svc = recordPayment(b.name, b.amount, b.currency, b.note);
      return json(res, { ok: true, service: svc });
    }

    if (p === '/api/payments/set' && m === 'POST') {
      const b = await parseBody(req);
      if (!b.name) return error(res, 'Service name is required');
      if (b.amount == null || isNaN(b.amount)) return error(res, 'Amount is required');
      const svc = setPayment(b.name, b.amount, b.currency, b.note);
      logActivity('pay', `Manual payment set on ${b.name}: ${b.amount} ${b.currency || 'UGX'}`);
      return json(res, { ok: true, service: svc });
    }

    // ── Update server ──
    if (p === '/api/server' && m === 'PUT') {
      const b = await parseBody(req);
      if (!b.name) return error(res, 'Name is required');
      const idx = servers.findIndex(x => x.name === b.name);
      if (idx === -1) return error(res, 'Service not found', 404);
      const newName = b.newName || b.name;
      if (newName !== b.name && servers.find(x => x.name === newName)) return error(res, 'New name already exists');
      const oldName = servers[idx].name;
      servers[idx].name = newName;
      if (b.cmd !== undefined) servers[idx].cmd = b.cmd;
      if (b.domain !== undefined) servers[idx].domain = b.domain;
      if (b.repoUrl !== undefined) servers[idx].repoUrl = b.repoUrl;
      if (b.revenueUrl !== undefined) servers[idx].revenueUrl = b.revenueUrl;
      if (b.revenueField !== undefined) servers[idx].revenueField = b.revenueField;
      if (b.refPrefix !== undefined) servers[idx].refPrefix = b.refPrefix;
      if (b.sshKey !== undefined) servers[idx].sshKey = b.sshKey;
      // Update process table key
      const oldKey = procKey(oldName);
      if (procTable[oldKey]) {
        procTable[oldKey].name = newName;
        if (newName !== oldName) {
          procTable[procKey(newName)] = procTable[oldKey];
          delete procTable[oldKey];
        }
      }
      saveServers();
      syncMonitorsToServices();
      logActivity('svc', `Service updated: ${newName}`);
      return json(res, servers);
    }

    // ── Update server from git repo ──
    if (p === '/api/server/update' && m === 'POST') {
      const b = await parseBody(req);
      if (!b.name) return error(res, 'Name is required');
      const cfg = servers.find(x => x.name === b.name);
      if (!cfg) return error(res, 'Service not found', 404);
      const sd = serverDir(cfg.name);
      try {
        let out;
        if (cfg.repoUrl) {
          execSync('git remote set-url origin ' + ghUrl(cfg.repoUrl), { cwd: sd, timeout: 15000, encoding: 'utf8' });
          out = execSync('git pull --ff-only', { cwd: sd, timeout: 120000, encoding: 'utf8' });
        } else {
          out = execSync('git pull', { cwd: sd, timeout: 120000, encoding: 'utf8' });
        }
        restartServer(cfg);
        return json(res, { ok: true, output: out });
      } catch (e) {
        return json(res, { output: (e.stdout || '') + '\n' + (e.stderr || '') });
      }
    }

    // ── Delete server ──
    if (p === '/api/server' && m === 'DELETE') {
      const b = await parseBody(req);
      const delName = b.name || u.searchParams.get('name');
      if (!delName) return error(res, 'Name is required');
      stopServer(delName);
      servers = servers.filter(x => x.name !== delName);
      const delKey = procKey(delName);
      delete procTable[delKey];
      saveServers();
      if (supabaseStore.enabled) {
        supabaseStore.deleteRow('services', 'name', delName).catch(() => {});
        supabaseStore.deleteRow('revenue', 'service_name', delName).catch(() => {});
      }
      try { fs.rmSync(serverDir(b.name), { recursive: true, force: true }); } catch {}
      syncMonitorsToServices();
      logActivity('svc', `Service deleted: ${delName}`);
      return json(res, servers);
    }

    // ── Start process ──
    if (p === '/api/start' && m === 'POST') {
      const b = await parseBody(req);
      if (!b.name) return error(res, 'Name is required');
      const cfg = servers.find(x => x.name === b.name);
      if (!cfg) return error(res, 'Service not found', 404);
      const entry = spawnServer(cfg);
      logActivity('svc', `Service started: ${b.name}`);
      if (!entry) return json(res, { ok: true, log: (procTable[procKey(b.name)]?.log || []).join('') });
      return json(res, { ok: true, log: '' });
    }

    // ── Stop process ──
    if (p === '/api/stop' && m === 'POST') {
      const b = await parseBody(req);
      if (!b.name) return error(res, 'Name is required');
      stopServer(b.name);
      logActivity('svc', `Service stopped: ${b.name}`);
      return json(res, { ok: true });
    }

    // ── Restart process ──
    if (p === '/api/restart' && m === 'POST') {
      const b = await parseBody(req);
      if (!b.name) return error(res, 'Name is required');
      const cfg = servers.find(x => x.name === b.name);
      if (!cfg) return error(res, 'Service not found', 404);
      return json(res, restartServer(cfg));
    }

    // ── Server details ──
    if (p === '/api/server/details' && m === 'GET') {
      const name = u.searchParams.get('name');
      if (!name) return error(res, 'Name is required');
      const cfg = servers.find(x => x.name === name);
      if (!cfg) return error(res, 'Service not found', 404);
      const status = getProcStatus(name);
      return json(res, { ...cfg, ...status });
    }

    // ── Stdin ──
    if (p === '/api/stdin' && m === 'POST') {
      const b = await parseBody(req);
      if (!b.name) return error(res, 'Name is required');
      const key = procKey(b.name);
      if (procTable[key] && procTable[key].running && b.data) {
        procTable[key].proc.stdin.write(b.data);
      }
      return json(res, { ok: true });
    }

    // ── Exec command ──
    if (p === '/api/exec' && m === 'POST') {
      const b = await parseBody(req);
      if (!b.cmd) return error(res, 'Command is required');
      logActivity('cmd', `Command run: ${b.cmd.slice(0, 200)}`);
      try {
        const out = execSync(b.cmd, { cwd: DIR, timeout: 10000, encoding: 'utf8', maxBuffer: 1024 * 1024 });
        return json(res, { output: out });
      } catch (e) {
        return json(res, { output: (e.stdout || '') + '\n' + (e.stderr || '') });
      }
    }

    // ── List files ──
    if (p === '/api/files' && m === 'GET') {
      const fp = safePath(u.searchParams.get('path'));
      try {
        const items = fs.readdirSync(fp, { withFileTypes: true });
        const list = items.map(i => {
          const f = path.join(fp, i.name);
          let size = '';
          try { if (i.isFile()) size = fs.statSync(f).size + 'B'; } catch {}
          return { name: i.name, isDir: i.isDirectory(), size };
        });
        list.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));
        return json(res, list);
      } catch (e) {
        return error(res, e.message);
      }
    }

    // ── Download file ──
    if (p === '/api/file' && m === 'GET') {
      const fp = safePath(u.searchParams.get('path'));
      try {
        const data = fs.readFileSync(fp);
        const ext = path.extname(fp).toLowerCase();
        const types = { '.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.txt':'text/plain','.md':'text/markdown','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.pdf':'application/pdf' };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        return res.end(data);
      } catch (e) {
        res.writeHead(404);
        return res.end('Not found');
      }
    }

    // ── Upload file ──
    if (p === '/api/upload' && m === 'POST') {
      const ct = req.headers['content-type'];
      const boundary = ct?.split('boundary=')[1];
      if (!boundary) return error(res, 'Invalid multipart');
      const form = await parseFormData(req, boundary);
      if (form.fileData && form.fileName) {
        const targetDir = safePath(form.uploadPath);
        fs.writeFileSync(path.join(targetDir, form.fileName), Buffer.from(form.fileData, 'latin1'));
        return json(res, { ok: true });
      }
      return error(res, 'No file received');
    }

    // ── Per-server file listing ──
    if (p === '/api/server/files' && m === 'GET') {
      const name = u.searchParams.get('name');
      if (!name) return error(res, 'name required');
      const fp = safeServerPath(name, u.searchParams.get('path') || '');
      try {
        const items = fs.readdirSync(fp, { withFileTypes: true });
        const list = items.map(i => {
          const f = path.join(fp, i.name);
          let size = '';
          try { if (i.isFile()) size = fs.statSync(f).size + 'B'; } catch {}
          return { name: i.name, isDir: i.isDirectory(), size };
        });
        list.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));
        return json(res, list);
      } catch (e) { return error(res, e.message); }
    }

    // ── Per-server file download ──
    if (p === '/api/server/file' && m === 'GET') {
      const name = u.searchParams.get('name');
      if (!name) return error(res, 'name required');
      const fp = safeServerPath(name, u.searchParams.get('path') || '');
      try {
        const data = fs.readFileSync(fp);
        const ext = path.extname(fp).toLowerCase();
        const types = { '.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.txt':'text/plain','.md':'text/markdown','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.pdf':'application/pdf' };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        return res.end(data);
      } catch (e) { res.writeHead(404); return res.end('Not found'); }
    }

    // ── Per-server file upload ──
    if (p === '/api/server/upload' && m === 'POST') {
      const name = u.searchParams.get('name');
      if (!name) return error(res, 'name required');
      const ct = req.headers['content-type'];
      const boundary = ct?.split('boundary=')[1];
      if (!boundary) return error(res, 'Invalid multipart');
      const form = await parseFormData(req, boundary);
      if (form.fileData && form.fileName) {
        const targetDir = safeServerPath(name, form.uploadPath);
        const filePath = path.join(targetDir, form.fileName);
        if (!filePath.startsWith(serverDir(name))) return error(res, 'Invalid path');
        fs.writeFileSync(filePath, Buffer.from(form.fileData, 'latin1'));
        return json(res, { ok: true });
      }
      return error(res, 'No file received');
    }

    // ── Per-server mkdir ──
    if (p === '/api/server/mkdir' && m === 'POST') {
      const b = await parseBody(req);
      if (!b.name || !b.path) return error(res, 'name and path required');
      const fp = safeServerPath(b.name, b.path);
      if (!fp.startsWith(serverDir(b.name))) return error(res, 'Invalid path');
      try { fs.mkdirSync(fp, { recursive: true }); return json(res, { ok: true }); } catch (e) { return error(res, e.message); }
    }

    // ── Per-server delete ──
    if (p === '/api/server/delete' && m === 'DELETE') {
      const b = await parseBody(req);
      if (!b.name || !b.path) return error(res, 'name and path required');
      const fp = safeServerPath(b.name, b.path);
      if (!fp.startsWith(serverDir(b.name))) return error(res, 'Invalid path');
      if (fp === serverDir(b.name)) return error(res, 'Cannot delete root');
      try { const stat = fs.statSync(fp); if (stat.isDirectory()) fs.rmSync(fp, { recursive: true, force: true }); else fs.unlinkSync(fp); return json(res, { ok: true }); } catch (e) { return error(res, e.message); }
    }

    // ── Create directory ──
    if (p === '/api/mkdir' && m === 'POST') {
      const b = await parseBody(req);
      if (!b.path) return error(res, 'Path is required');
      const fp = safePath(b.path);
      try {
        fs.mkdirSync(fp, { recursive: true });
        return json(res, { ok: true });
      } catch (e) {
        return error(res, e.message);
      }
    }

    // ── Delete file/dir ──
    if (p === '/api/file' && m === 'DELETE') {
      const b = await parseBody(req);
      if (!b.path) return error(res, 'Path is required');
      const fp = safePath(b.path);
      if (fp === DIR) return error(res, 'Cannot delete root');
      try {
        const stat = fs.statSync(fp);
        if (stat.isDirectory()) fs.rmSync(fp, { recursive: true, force: true });
        else fs.unlinkSync(fp);
        return json(res, { ok: true });
      } catch (e) {
        return error(res, e.message);
      }
    }

    // ── Rename file/dir ──
    if (p === '/api/rename' && m === 'PUT') {
      const b = await parseBody(req);
      if (!b.path || !b.newName) return error(res, 'path and newName are required');
      const src = safePath(b.path);
      const dst = path.join(path.dirname(src), b.newName);
      try {
        fs.renameSync(src, dst);
        return json(res, { ok: true });
      } catch (e) {
        return error(res, e.message);
      }
    }

    // ── Monitor routes ──
    if (p === '/api/monitors' && m === 'GET') {
      return json(res, monitor.monitors);
    }
    if (p === '/api/monitor/stats' && m === 'GET') {
      const hist = monitor.monitorHistory;
      const stats = {};
      for (const m of monitor.monitors) {
        const checks = hist.filter(h => h.id === m.id).slice(-100);
        const up = checks.filter(h => h.status === 'up').length;
        stats[m.id] = { uptime: checks.length ? Math.round(up / checks.length * 100) + '%' : '100%', checks: checks.length, last: checks.length ? checks[checks.length - 1] : null };
      }
      return json(res, stats);
    }
    if (p === '/api/monitor/history' && m === 'GET') {
      const limit = parseInt(u.searchParams.get('limit') || '500', 10);
      return json(res, monitor.monitorHistory.slice(-limit));
    }
    if (p === '/api/monitor' && m === 'POST') {
      const b = await parseBody(req);
      const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: b.name, url: b.url, method: b.method || 'GET', timeout: parseInt(b.timeout) || 10000, keyword: b.keyword || '', headers: b.headers || '', webhook: b.webhook || '', paused: false, createdAt: new Date().toISOString() };
      monitor.monitors.push(entry);
      monitor.saveMonitors();
      return json(res, entry);
    }
    if (p === '/api/monitor' && m === 'PUT') {
      const b = await parseBody(req);
      const idx = monitor.monitors.findIndex(x => x.id === b.id);
      if (idx === -1) return error(res, 'Monitor not found', 404);
      Object.assign(monitor.monitors[idx], b);
      monitor.saveMonitors();
      return json(res, monitor.monitors[idx]);
    }
    if (p === '/api/monitor' && m === 'DELETE') {
      const b = await parseBody(req);
      const idx = monitor.monitors.findIndex(x => x.id === b.id);
      if (idx === -1) return error(res, 'Monitor not found', 404);
      monitor.monitors.splice(idx, 1);
      monitor.saveMonitors();
      return json(res, { ok: true });
    }
    if (p === '/api/monitor/check' && m === 'POST') {
      const b = await parseBody(req);
      if (b.id) {
        const m = monitor.monitors.find(x => x.id === b.id);
        if (!m) return error(res, 'Monitor not found', 404);
        monitor.checkMonitor(m).then(() => {}).catch(() => {});
      } else {
        monitor.checkAllMonitors().then(() => {}).catch(() => {});
      }
      return json(res, { ok: true });
    }

    // 404
    json(res, { error: true, message: 'Not found' }, 404);
  } catch (e) {
    json(res, { error: true, message: e.message || 'Internal error' }, 500);
  }
});

// ───────────────────── WEBSOCKET ─────────────────────
let WebSocketServer;
try {
  WebSocketServer = require('ws').Server;
} catch {}
if (WebSocketServer) {
  const wss = new WebSocketServer({ server });

  // ── Interactive PTY terminal at /ws/term?token=... ──
  // Prefers node-pty (real TTY, resizable); falls back to the `script`
  // binary which allocates a pseudo-tty; last resort is a plain piped shell.
  function startTerminal(ws, token) {
    if (token !== ADMIN_TOKEN) { ws.close(4001, 'Unauthorized'); return; }
    const shell = shellPath();
    let child = null;
    const pump = (d) => { if (ws.readyState === 1) ws.send(d.toString('utf8')); };
    const termEnv = { ...process.env, TERM: process.env.TERM || 'xterm-256color', COLUMNS: '200', LINES: '60' };

    // 1) node-pty (installed via npm on the production machine)
    let NodePty;
    try { NodePty = require('node-pty'); } catch {}
    if (NodePty) {
      const pty = NodePty.spawn(shell, [], { name: 'xterm-256color', cols: 200, rows: 60, env: termEnv });
      pty.onData((d) => pump(Buffer.from(d)));
      ws.on('message', (raw) => { try { pty.write(raw.toString('utf8')); } catch {} });
      pty.onExit(() => { if (ws.readyState === 1) ws.close(); });
      ws.on('close', () => { try { pty.kill(); } catch {} });
      return;
    }

    // 2) the `script` utility (present on standard servers)
    if (hasBin('script')) {
      try {
        child = spawn('script', ['-q', '-f', '-c', shell, '/dev/null'], { stdio: ['pipe', 'pipe', 'pipe'], env: termEnv });
        child.stdout.on('data', pump);
        child.stderr.on('data', pump);
        ws.on('message', (raw) => { try { if (child.stdin.writable) child.stdin.write(raw); } catch {} });
        ws.on('close', () => { try { child.kill('SIGKILL'); } catch {} });
        child.on('exit', () => { if (ws.readyState === 1) ws.close(); });
        return;
      } catch { /* fall through */ }
    }

    // 3) plain pipe (best effort, no TUI support)
    child = spawn(shell, [], { stdio: ['pipe', 'pipe', 'pipe'], env: termEnv });
    child.stdout.on('data', pump);
    child.stderr.on('data', pump);
    ws.on('message', (raw) => { try { if (child.stdin.writable) child.stdin.write(raw); } catch {} });
    ws.on('close', () => { try { child.kill('SIGKILL'); } catch {} });
    child.on('exit', () => { if (ws.readyState === 1) ws.close(); });
  }

  wss.on('connection', (ws, req) => {
    const url = (req && req.url) || '';
    const pathOnly = url.split('?')[0];
    if (pathOnly === '/ws/term') {
      const q = new URL('http://x' + url).searchParams;
      return startTerminal(ws, q.get('token'));
    }

    wsClients.add(ws);

    // Send initial state
    const initData = {
      type: 'init',
      data: {
        servers,
        processes: Object.fromEntries(
          Object.entries(procTable).map(([k, v]) => [k, { running: v.running, uptime: v.running ? Math.floor((Date.now() - v.startTime) / 1000) : 0, log: v.log.join('') }])
        ),
      },
    };
    if (ws.readyState === 1) ws.send(JSON.stringify(initData));

    // Push stats every 2 seconds
    const statsInterval = setInterval(() => {
      if (ws.readyState !== 1) { clearInterval(statsInterval); return; }
      ws.send(JSON.stringify({ type: 'stats', data: getStats() }));
    }, 2000);

    ws.on('close', () => {
      wsClients.delete(ws);
      clearInterval(statsInterval);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        // Client can request initial state replay
        if (msg.type === 'init') {
          if (ws.readyState === 1) ws.send(JSON.stringify(initData));
        }
      } catch {}
    });
  });
} else {
  console.log('[WEB] WebSocket unavailable — install ws package');
}

server.listen(WPORT, '0.0.0.0', async () => {
  console.log('[WEB] serving on :' + WPORT);
  // Pull authoritative state from Supabase (if configured) before serving.
  await loadFromSupabase().catch(() => {});
  // Auto-start managed servers on boot
  for (const cfg of servers) {
    setTimeout(() => spawnServer(cfg), 500);
  }
});
