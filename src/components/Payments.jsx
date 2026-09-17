import { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import { apiGet, apiPost } from '../hooks/useApi';

const fmtMoney = (n, cur) => {
  const num = Number(n) || 0;
  const c = cur || 'UGX';
  if (c === 'UGX') return 'UGX ' + Math.round(num).toLocaleString();
  const sym = c === 'USD' ? '$' : (c + ' ');
  return sym + num.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

export default function Payments() {
  const [data, setData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selected, setSelected] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = async () => {
    try {
      const d = await apiGet('/api/payments/overview');
      setData(d);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);

  const record = async (mode) => {
    if (!selected) { toast('Select a service', 'error'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt)) { toast('Enter a valid amount', 'error'); return; }
    setBusy(true);
    try {
      await apiPost('/api/payments/' + mode, { name: selected, amount: Math.abs(amt) * (mode === 'set' || amt >= 0 ? 1 : -1), note: note.trim() });
      toast(mode === 'record' ? 'Payment recorded' : 'Total set', 'success');
      setAmount(''); setNote('');
      await load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const services = (data?.services || []).map(s => s.name);
  const allServices = [...new Set([...(services), ...(data?.services || []).map(s => s.name)])];

  return (
    <div className="page active" id="page-payments">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Payments</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
          {data?.walletBalance ? 'gateway synced' : 'manual tracking'} {lastUpdate && <span>&middot; {lastUpdate}</span>}
          {data?.lastSync && <span>&middot; synced {new Date(data.lastSync).toLocaleTimeString()}</span>}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
        </div>
      </div>

      <div className="card-grid">
        <div className="card stat-card">
          <div className="card-accent-line" />
          <div className="stat-header"><span className="label">Wallet balance</span></div>
          <div className="value" style={{ color: 'var(--success)' }}>{data?.walletBalance ? fmtMoney(data.walletBalance.total, 'UGX') : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="card-accent-line" />
          <div className="stat-header"><span className="label">Total revenue</span></div>
          <div className="value" style={{ color: 'var(--success)' }}>{data ? fmtMoney(data.total, Object.keys(data.currencies || {})[0]) : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="card-accent-line" />
          <div className="stat-header"><span className="label">Earning services</span></div>
          <div className="value">{data?.count ?? '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="card-accent-line" />
          <div className="stat-header"><span className="label">Top earner</span></div>
          <div className="value" style={{ fontSize: 18 }}>{data?.topService ? data.topService : '—'}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-head" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div className="card-title">Record a payment</div>
        </div>
        <div className="input-row" style={{ padding: '16px 18px' }}>
          <select value={selected} onChange={e => setSelected(e.target.value)} className="mono">
            <option value="">— select service —</option>
            {allServices.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (UGX)" type="number" step="0.01" />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" />
          <button className="btn btn-accent btn-sm" disabled={busy} onClick={() => record('record')}>+ Add</button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => record('set')}>Set total</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!data || data.services.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>No revenue yet. Record a payment above after deploying a service.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {data.services.map(s => (
              <div key={s.name} className="monitor-item">
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: s.running ? 'var(--success)' : 'var(--error)'
                }} />
                <div className="monitor-info">
                  <div style={{ fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {s.name}
                    {s.running && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.12)', color: 'var(--success)' }}>online</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.domain || 'no route'}
                  </div>
                </div>
                <div className="monitor-status">
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--success)' }}>{fmtMoney(s.total, s.currency)}</div>
                  {s.updated && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>updated {new Date(s.updated).toLocaleString()}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}