import { useState, useEffect } from 'react';
import { apiGet } from '../hooks/useApi';

const KIND_LABELS = {
  svc: 'Service',
  pay: 'Payment',
  gateway: 'Gateway',
  sync: 'Sync',
  auth: 'Auth',
  cmd: 'Command',
};

const KIND_COLORS = {
  svc: 'var(--accent-cyan)',
  pay: 'var(--success)',
  gateway: 'var(--warning)',
  sync: 'var(--warning)',
  auth: 'var(--accent)',
  cmd: 'var(--accent)',
};

export default function Activity() {
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const log = await apiGet('/api/activity');
        if (!mounted) return;
        setEntries(log.map(a => {
          const d = new Date(a.t);
          return {
            ...a,
            date: d.toLocaleDateString([], { year: 'numeric', month: 'short', day: '2-digit' }),
            time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          };
        }));
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const kinds = ['all', ...Object.keys(KIND_LABELS)];
  const filtered = filter === 'all' ? entries : entries.filter(e => e.kind === filter);
  const counts = entries.reduce((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc; }, {});

  return (
    <div className="page active" id="page-activity">
      <div className="hero hero-compact">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="pulse-dot"></span>
            ADMIN ACTIVITY
          </div>
          <h1 className="hero-title">Activity & <span className="grad-text">access log</span></h1>
        </div>
      </div>

      <div className="card">
        <div className="filter-row">
          <div className="filter-pills">
            {kinds.map(k => (
              <button
                key={k}
                className={`filter-pill ${filter === k ? 'active' : ''}`}
                onClick={() => setFilter(k)}
              >
                {k === 'all' ? 'All' : KIND_LABELS[k]}
                {k !== 'all' && <span className="pill-count">{counts[k] || 0}</span>}
              </button>
            ))}
          </div>
          <span className="live-pill" style={{ alignSelf: 'center' }}>LIVE</span>
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">No activity yet.</div>
        ) : (
          <div className="feed feed-large">
            {filtered.map((a, i) => (
              <div key={a.t + '-' + i} className="feed-item">
                <span className="feed-dot" style={{ background: KIND_COLORS[a.kind] || 'var(--text-dim)' }}></span>
                <span className="feed-kind">{KIND_LABELS[a.kind] || a.kind}</span>
                <span className="feed-text">{a.text}</span>
                <span className="feed-time">{a.date} {a.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}