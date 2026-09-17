import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../hooks/useApi';

const fmtBytes = (bytes) => {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + 'GB';
  return Math.round(bytes / 1048576) + 'MB';
};

const fmtKB = (kb) => {
  if (kb >= 1048576) return (kb / 1048576).toFixed(1) + 'GB';
  if (kb >= 1024) return (kb / 1024).toFixed(1) + 'MB';
  return Math.round(kb) + 'KB';
};

const fmtUp = (s) => {
  if (s == null || s === 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const fmtDur = (s) => {
  if (s == null) return '—';
  if (s < 1000) return `${s}ms`;
  return `${(s / 1000).toFixed(2)}s`;
};

export default function Monitor() {
  const [rows, setRows] = useState([]);
  const [monitors, setMonitors] = useState([]);
  const [stats, setStats] = useState({});
  const [history, setHistory] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  const load = async () => {
    try {
      const [list, m, s, h] = await Promise.all([
        apiGet('/api/servers'),
        apiGet('/api/monitors'),
        apiGet('/api/monitor/stats'),
        apiGet('/api/monitor/history?limit=500'),
      ]);
      setMonitors(m);
      setStats(Object.fromEntries((s || []).map(x => [x.id, x])));
      setHistory(h || []);

      const detailed = [];
      for (const srv of (list || [])) {
        try {
          const d = await apiGet(`/api/server/details?name=${encodeURIComponent(srv.name)}`);
          detailed.push({ ...srv, ...d });
        } catch {
          detailed.push(srv);
        }
      }
      setRows(detailed);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch {}
  };

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);

  const checkAll = async () => { await apiPost('/api/monitor/check', {}); load(); };

  const total = rows.length;
  const up = rows.filter(r => r.running).length;

  return (
    <div className="page active" id="page-monitor">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Service Monitor</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
          auto · {lastUpdate && <span>&middot; {lastUpdate}</span>}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={checkAll}>Check All</button>
        </div>
      </div>

      <div className="card-grid" style={{ marginBottom: 0 }}>
        <div className="card stat-card">
          <div className="card-accent-line" />
          <div className="stat-header"><span className="label">Total services</span></div>
          <div className="value">{total}</div>
        </div>
        <div className="card stat-card">
          <div className="card-accent-line" />
          <div className="stat-header"><span className="label" style={{ color: 'var(--success)' }}>Online</span></div>
          <div className="value" style={{ color: 'var(--success)' }}>{up}</div>
        </div>
        <div className="card stat-card">
          <div className="card-accent-line" />
          <div className="stat-header"><span className="label" style={{ color: 'var(--error)' }}>Offline</span></div>
          <div className="value" style={{ color: 'var(--error)' }}>{total - up}</div>
        </div>
        <div className="card stat-card">
          <div className="card-accent-line" />
          <div className="stat-header"><span className="label">Auto monitors</span></div>
          <div className="value">{monitors.filter(m => m.id.startsWith('svc:')).length}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>No services deployed. Any service you deploy is monitored automatically.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map(r => {
              const autoM = monitors.find(m => m.id === 'svc:' + r.name.replace(/[^a-zA-Z0-9_-]/g, '_'));
              const monStats = autoM ? stats[autoM.id] : null;
              const lastHist = autoM ? (history || []).filter(h => h.id === autoM.id).slice(-20) : [];
              const lastStatus = lastHist.length > 0 ? lastHist[lastHist.length - 1].status : null;
              const monUp = monStats ? monStats.uptime : null;
              return (
                <div key={r.name} className="monitor-item">
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: r.running ? 'var(--success)' : 'var(--error)',
                    boxShadow: r.running ? '0 0 8px rgba(34,197,94,0.5)' : 'none'
                  }} />
                  <div className="monitor-info">
                    <div style={{ fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.name}
                      {r.domain && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>monitored</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.domain || 'no domain set'}
                    </div>
                    <div className="mesh-metrics" style={{ marginTop: 6 }}>
                      <span>CPU {r.running ? `${r.cpu || 0}%` : '—'}</span>
                      <span>RAM {r.running ? fmtKB(r.mem || 0) : '—'}</span>
                      <span>Disk {r.disk || 0}MB</span>
                      <span>Up {r.running ? fmtUp(r.uptime) : '—'}</span>
                    </div>
                    {lastHist.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'end', height: 20, gap: 2, marginTop: 6 }}>
                        {lastHist.map((h, i) => (
                          <div key={i} style={{
                            width: 4, borderRadius: 2,
                            height: Math.min(h.ms / 15, 20),
                            background: h.status === 'up' ? 'var(--success)' : 'var(--error)',
                            minHeight: 2,
                            transition: 'height 0.3s'
                          }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="monitor-status">
                    <div style={{ fontWeight: 700, fontSize: 14, color: r.running ? 'var(--success)' : 'var(--error)' }}>
                      {r.running ? 'RUNNING' : 'OFFLINE'}
                    </div>
                    {autoM && lastStatus && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {lastStatus.toUpperCase()} · {fmtDur(lastHist[lastHist.length - 1].ms)}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{monUp ? `http ${monUp}` : 'no route'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}