// URL monitor — checks the reachability of configured endpoints.
// State lives in ~/.webpanel_monitors.json (same pattern as the server list).
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const DIR = process.env.HOME || '/home/container';
const MONITORS_FILE = path.join(DIR, '.webpanel_monitors.json');

let monitors = [];
let monitorHistory = [];
let checkTimer = null;

try {
  if (fs.existsSync(MONITORS_FILE)) monitors = JSON.parse(fs.readFileSync(MONITORS_FILE));
} catch {}

function saveMonitors() {
  try { fs.writeFileSync(MONITORS_FILE, JSON.stringify(monitors, null, 2)); } catch {}
}

function checkOne(m) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const lib = /^https:/i.test(m.url) ? https : http;
    const done = (status, code) => {
      monitorHistory.push({ id: m.id, status, code, ms: Date.now() - t0, at: new Date().toISOString() });
      if (monitorHistory.length > 2000) monitorHistory.shift();
      resolve({ id: m.id, status });
    };
    let req;
    try {
      req = lib.get(m.url, {
        method: m.method || 'GET',
        timeout: parseInt(m.timeout, 10) || 10000,
        headers: { 'User-Agent': 'system-panel-monitor' },
      }, (res) => {
        let body = '';
        res.on('data', d => { body += d; if (body.length > 1000000) { req.destroy(); done('up', res.statusCode); } });
        res.on('end', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 400 && (!m.keyword || body.includes(m.keyword));
          done(ok ? 'up' : 'down', res.statusCode);
        });
      });
      req.on('timeout', () => { req.destroy(); done('down', 0); });
      req.on('error', () => done('down', 0));
    } catch { done('down', 0); }
  });
}

async function checkAllMonitors() {
  const active = monitors.filter(m => !m.paused);
  for (const m of active) await checkOne(m);
}

function startMonitorChecker() {
  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(() => { checkAllMonitors().catch(() => {}); }, 30000);
  setTimeout(() => { checkAllMonitors().catch(() => {}); }, 3000);
  if (checkTimer.unref) checkTimer.unref();
}

module.exports = { checkMonitor: checkOne, checkAllMonitors, startMonitorChecker, saveMonitors, monitors, monitorHistory };