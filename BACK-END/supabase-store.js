// Supabase persistence for VYLUX ADMIN.
// Tables (JSONB payload per row so the schema never needs migrating):
//   servers(name PK, data jsonb)
//   revenue(service_name PK, data jsonb)
//   gateway_config(id PK='main', data jsonb)
//   pending_payments(reference PK, data jsonb)
//   config_table(key PK, value text)
//
// Loads return null when Supabase is not configured/unreachable so the
// backend keeps working with its local JSON files as before.

const { createClient } = require('@supabase/supabase-js');

const URL = process.env.VYLUX_SUPABASE_URL || '';
const KEY = process.env.VYLUX_SUPABASE_ROLE_KEY || '';

let sb = null;
if (URL && KEY) {
  try {
    sb = createClient(URL, KEY, { auth: { persistSession: false } });
  } catch {}
}
const enabled = !!sb;

async function upsertAll(table, pkColumn, rows) {
  if (!enabled || !rows) return;
  const payload = Object.entries(rows).map(([pk, data]) => ({ [pkColumn]: pk, data }));
  if (!payload.length) return;
  try {
    const { error } = await sb
      .from(table)
      .upsert(payload, { onConflict: pkColumn, ignoreDuplicates: false });
    if (error) console.log('[SUPA] upsert', table, error.message);
  } catch (e) {
    console.log('[SUPA] upsert', table, e.message);
  }
}

async function loadAll(table, pkColumn) {
  if (!enabled) return null;
  try {
    const { data, error } = await sb.from(table).select(`${pkColumn},data`);
    if (error) return null;
    const out = {};
    for (const row of data || []) out[row[pkColumn]] = row.data;
    return out;
  } catch {
    return null;
  }
}

// Save all primary data (servers map, revenue map, gateway, pending map).
async function saveState({ servers, revenue, gateway, pending }) {
  if (!enabled) return;
  await Promise.allSettled([
    upsertAll('services', 'name', servers || {}),
    upsertAll('revenue', 'service_name', revenue || {}),
    gateway ? upsertAll('gateway_config', 'id', { main: gateway }) : Promise.resolve(),
    upsertAll('pending_payments', 'reference', pending || {}),
  ]);
}

// Load all primary data. Returns null if Supabase is off / unreachable.
async function loadState() {
  if (!enabled) return null;
  const [servers, revenue, gatewayRows, pending] = await Promise.all([
    loadAll('services', 'name'),
    loadAll('revenue', 'service_name'),
    loadAll('gateway_config', 'id'),
    loadAll('pending_payments', 'reference'),
  ]);
  if (!servers) return null;
  return {
    servers: servers || {},
    revenue: revenue || {},
    gateway: (gatewayRows && gatewayRows.main) || null,
    pending: pending || {},
  };
}

async function deleteRow(table, pkColumn, pk) {
  if (!enabled) return;
  try {
    await sb.from(table).delete().eq(pkColumn, pk);
  } catch {}
}

async function setConfig(key, value) {
  if (!enabled) return;
  try {
    await sb
      .from('config_table')
      .upsert({ key, value: String(value ?? ''), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  } catch {}
}

async function getConfig(key) {
  if (!enabled) return null;
  try {
    const { data } = await sb.from('config_table').select('value').eq('key', key).maybeSingle();
    return data ? data.value : null;
  } catch {
    return null;
  }
}

async function getAllConfig() {
  if (!enabled) return {};
  try {
    const { data } = await sb.from('config_table').select('key,value');
    const out = {};
    for (const r of data || []) out[r.key] = r.value;
    return out;
  } catch {
    return {};
  }
}

module.exports = {
  enabled,
  saveState,
  loadState,
  deleteRow,
  setConfig,
  getConfig,
  getAllConfig,
  health,
};

// DB health/status for the panel: per-table row counts + latency.
async function health() {
  if (!enabled) return { enabled: false };
  const result = { enabled: true, url: URL.replace(/^https:\/\//, '').replace(/\.supabase\.co.*$/, ''), ok: true, tables: {}, latencyMs: 0 };
  const tables = ['services', 'revenue', 'gateway_config', 'pending_payments', 'config_table'];
  const t0 = Date.now();
  try {
    await Promise.all(tables.map(async (t) => {
      try {
        const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
        result.tables[t] = error ? -1 : (count ?? 0);
      } catch {
        result.tables[t] = -1;
      }
    }));
  } catch {}
  result.latencyMs = Date.now() - t0;
  return result;
}