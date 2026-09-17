import { useState, useEffect } from 'react';
import { apiGet } from '../hooks/useApi';
import Sparkline from './Sparkline';

function MonitorSummary() {
  const [monitors, setMonitors] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [m, s] = await Promise.all([
          apiGet('/api/monitors'),
          apiGet('/api/monitor/stats'),
        ]);
        setMonitors(m);
        setStats(Object.fromEntries((s || []).map(x => [x.id, x])));
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  const total = monitors.length;
  const paused = monitors.filter(m => m.paused).length;
  const up = monitors.filter(m => !m.paused && stats[m.id] && parseInt(stats[m.id].uptime) >= 90).length;
  const down = monitors.filter(m => !m.paused && stats[m.id] && parseInt(stats[m.id].uptime) < 90).length;

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 10 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-13h-2v6l5.25 3.15.75-1.23-4-2.37V7z"/></svg>
        Monitor Status
      </div>
      <div className="card-grid" id="dash-monitor-grid">
        {loading ? (
          [1,2,3,4].map(i => <div key={i} className="card stat-card"><div className="skeleton" style={{height:20}}/></div>)
        ) : (
          <>
            <div className="card stat-card mini"><div className="card-accent-line"/><div className="stat-header"><span className="label">Total</span></div><div className="value">{total}</div></div>
            <div className="card stat-card mini"><div className="card-accent-line"/><div className="stat-header"><span className="label" style={{color:'var(--success)'}}>Healthy</span></div><div className="value" style={{color:'var(--success)'}}>{up}</div></div>
            <div className="card stat-card mini"><div className="card-accent-line"/><div className="stat-header"><span className="label" style={{color:'var(--error)'}}>Unhealthy</span></div><div className="value" style={{color:'var(--error)'}}>{down}</div></div>
            <div className="card stat-card mini"><div className="card-accent-line"/><div className="stat-header"><span className="label">Paused</span></div><div className="value" style={{color:'var(--text-dim)'}}>{paused}</div></div>
          </>
        )}
      </div>
    </div>
  );
}

function SupabaseHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const h = await apiGet('/api/supabase/health');
        setHealth(h);
      } catch { setHealth({ ok: false, message: 'Endpoint unreachable' }); }
      setLoading(false);
    };
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  const rows = health?.tables
    ? Object.entries(health.tables).map(([name, count]) => ({ name, count }))
    : [];
  const total = rows.reduce((a, r) => a + Math.max(r.count, 0), 0);

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 10 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
        VYLUX ADMIN Database
        <span className={`live-pill ${health?.ok ? '' : 'pill-error'}`}>{health?.ok ? 'CONNECTED' : 'OFFLINE'}</span>
      </div>
      {loading ? (
        <div className="skeleton" style={{ height: 52 }} />
      ) : health?.ok ? (
        <>
          <div className="card-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="card stat-card mini"><div className="stat-header"><span className="label">Project</span></div><div className="value" style={{ fontSize: 13 }}>{health.url}</div></div>
            <div className="card stat-card mini"><div className="stat-header"><span className="label">Rows</span></div><div className="value">{total}</div></div>
            <div className="card stat-card mini"><div className="stat-header"><span className="label">Tables</span></div><div className="value">{rows.filter(r => r.count >= 0).length}</div></div>
            <div className="card stat-card mini"><div className="stat-header"><span className="label">Latency</span></div><div className="value">{health.latencyMs}ms</div></div>
          </div>
          <div className="mesh-grid" style={{ marginTop: 10 }}>
            {rows.map(r => (
              <div key={r.name} className="mesh-card" style={{ cursor: 'default' }}>
                <div className="mesh-card-top">
                  <span className={`server-dot ${r.count >= 0 ? 'running' : 'stopped'}`} />
                  <span className="mesh-name">{r.name}</span>
                </div>
                <div className="mesh-cmd">{r.count < 0 ? 'unreachable' : `${r.count} row${r.count === 1 ? '' : 's'}`}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">{health?.message || 'Database not configured.'}</div>
      )}
    </div>
  );
}

const formatMem = (bytes) => {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + 'GB';
  return Math.round(bytes / 1048576) + 'MB';
};

const formatBytesKB = (kb) => {
  if (kb >= 1048576) return (kb / 1048576).toFixed(1) + 'GB';
  if (kb >= 1024) return (kb / 1024).toFixed(1) + 'MB';
  return Math.round(kb) + 'KB';
};

const formatUptime = (s) => {
  if (typeof s === 'string') return s;
  if (s == null) return '--';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function Dashboard({ servers, onNavigate, setSelectedServer }) {
  const [info, setInfo] = useState(null);
  const [cpuHist, setCpuHist] = useState([]);
  const [memHist, setMemHist] = useState([]);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        const i = await apiGet('/api/info');
        if (!mounted) return;
        setInfo(i);
      } catch { /* ignore */ }
    };
    fetch();
    const interval = setInterval(fetch, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const run = servers.filter(s => s._running);
    const avgCpu = run.length ? Math.round((run.reduce((a, s) => a + (s._cpu || 0), 0) / run.length) * 10) / 10 : 0;
    const sumMem = run.reduce((a, s) => a + (s._mem || 0), 0);
    setCpuHist(prev => [...prev, avgCpu].slice(-40));
    setMemHist(prev => [...prev, sumMem].slice(-40));
  }, [servers]);

  const running = servers.filter(s => s._running).length;
  const svcRun = servers.filter(s => s._running);
  const svcCpu = svcRun.length ? Math.round((svcRun.reduce((a, s) => a + (s._cpu || 0), 0) / svcRun.length) * 10) / 10 : 0;
  const svcMem = svcRun.reduce((a, s) => a + (s._mem || 0), 0);
  const svcDisk = servers.length ? Math.round(servers.reduce((a, s) => a + (s._disk || 0), 0) * 10) / 10 : 0;

  const cpu = svcCpu > 0 ? svcCpu : (info?.cpu || 0);
  const mem = svcMem > 0 ? svcMem : (info?.memUsed || 0);
  const ramText = svcMem > 0 ? formatMem(svcMem) : `${formatMem(info?.memUsed || 0)} / ${formatMem(info?.memTotal || 0)}`;
  const diskText = svcDisk > 0 ? `${svcDisk}MB` : `${formatMem(info?.diskUsed || 0)} / ${formatMem(info?.diskTotal || 0)}`;

  const statCards = [
    { label: 'Hostname', value: info?.hostname || '--', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', iconColor: '#ffffff' },
    { label: 'Services', value: servers.length || 0, icon: 'M21 12V7H5a2 2 0 010 4h12v4H8v2h9a2 2 0 002-2v-3', iconColor: '#ffffff' },
    { label: 'Online', value: `${running} / ${servers.length}`, icon: 'M5 12h14M12 5l7 7-7 7', iconColor: '#ffffff', bar: { pct: servers.length ? (running / servers.length) * 100 : (info ? 100 : 0), color: '#ffffff' } },
    { label: 'CPU load', value: `${cpu}%`, icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2', iconColor: '#d6d6d6', bar: { pct: cpu, color: '#d6d6d6' } },
    { label: 'RAM used', value: ramText, icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 12V6', iconColor: '#b5b5b5', bar: { pct: info ? ((info.memUsed || 0) / ((info.memTotal || 1))) * 100 : svcMem ? 0 : 0, color: '#b5b5b5' } },
    { label: 'Disk used', value: diskText, icon: 'M22 12H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z', iconColor: '#9a9a9a', bar: { pct: info ? ((info.diskUsed || 0) / ((info.diskTotal || 1))) * 100 : 0, color: '#9a9a9a' } },
  ];

  return (
    <div className="page active" id="page-dashboard">
      <div className="hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="pulse-dot"></span>
            VYLUX ADMIN
          </div>
          <h1 className="hero-title">All systems, <span className="grad-text">one surface.</span></h1>
          <p className="hero-sub">
            {servers.length > 0
              ? `${running} of ${servers.length} services online · ${info?.hostname || 'core'}`
              : 'No services configured yet — add your first service to get started.'}
          </p>
        </div>
        <div className="hero-tiles">
          <div className="tile">
            <div className="tile-head"><span>CPU load</span><strong style={{ color: 'var(--accent)' }}>{cpu > 0 ? `${cpu}%` : '--'}</strong></div>
            <Sparkline data={cpuHist} width={150} height={38} color="#ffffff" />
          </div>
          <div className="tile">
            <div className="tile-head"><span>Memory</span><strong style={{ color: 'var(--accent-cyan)' }}>{ramText}</strong></div>
            <Sparkline data={memHist} width={150} height={38} color="#9a9a9a" />
          </div>
          <div className="tile tile-uptime">
            <div className="tile-head"><span>{servers.length ? 'Online' : 'Status'}</span><strong style={{ color: 'var(--success)' }}>{servers.length ? `${running} / ${servers.length}` : (info ? 'HEALTHY' : '--')}</strong></div>
            <div className="uptime-track"><div className="uptime-fill" style={{ width: `${servers.length ? (running / servers.length) * 100 : (info ? 100 : 0)}%` }}></div></div>
          </div>
        </div>
      </div>

      <div className="card-grid" id="statGrid">
        {statCards.map((card, i) => (
          <div key={i} className="card stat-card" style={{ animationDelay: `${i * 0.06}s` }}>
            <div className="card-accent-line" />
            <div className="stat-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={card.iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={card.icon} />
              </svg>
              <span className="label">{card.label}</span>
            </div>
            <div className={`value ${card.bar ? 'with-bar' : ''} ${!info && card.value === '--' ? 'skeleton' : ''}`}>{card.value}</div>
            {card.bar && (
              <div className="bar"><div className="fill" style={{ width: `${Math.min(card.bar.pct, 100)}%`, background: `linear-gradient(90deg, ${card.bar.color}, ${card.bar.color}aa)` }}></div></div>
            )}
          </div>
        ))}
      </div>

<MonitorSummary />

      <SupabaseHealth />

      <div className="card">
        <div className="card-head">
          <div className="card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            System mesh
          </div>
          <span className="live-pill">{servers.length} services</span>
        </div>
        {servers.length === 0 ? (
          <div className="empty-state">No services yet. Create your first one.</div>
        ) : (
          <div className="mesh-grid">
            {[...servers].sort((a, b) => a.name.localeCompare(b.name)).map(s => (
              <button
                key={s.name}
                className={`mesh-card ${s._running ? 'up' : 'down'}`}
                onClick={() => { setSelectedServer(s.name); onNavigate('server'); }}
              >
                <div className="mesh-card-top">
                  <span className={`server-dot ${s._running ? 'running' : 'stopped'}`} />
                  <span className="mesh-name">{s.name}</span>
                  <span className="mesh-status">{s._running ? 'online' : 'offline'}</span>
                </div>
{s.domain ? (
                    <div className="mesh-domain" title={s.domain}>{s.domain}</div>
                  ) : (
                    <div className="mesh-domain dim">no domain</div>
                  )}
                <div className="mesh-cmd">{s.cmd || 'index.js'}</div>
                <div className="mesh-metrics">
                  <span title="CPU">{s._running ? `${s._cpu ?? 0}% CPU` : '—'}</span>
                  <span title="Memory">{s._running ? `${formatBytesKB(s._mem || 0)}` : '—'}</span>
                  <span title="Disk">{s._disk ?? 0}MB</span>
                  <span title="Uptime">{s._running && s._uptime ? formatUptime(s._uptime) : '—'}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}