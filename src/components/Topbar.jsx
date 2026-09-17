const pageTitles = {
  dashboard: 'Overview',
  terminal: 'Terminal',
  monitor: 'Monitor',
  activity: 'Activity',
  payments: 'Payments',
  server: 'Service Detail',
};

export default function Topbar({ page, stats, onToggleSidebar, onLogout }) {
  const cpu = stats?.cpu ?? 0;
  const cpuCores = stats?.cpuCores ?? 1;
  const memUsed = stats?.memUsed ?? 0;
  const memTotal = stats?.memTotal ?? 1;
  const diskUsed = stats?.diskUsed ?? 0;
  const diskTotal = stats?.diskTotal ?? 1;

  const formatMem = (bytes) => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + 'GB';
    return Math.round(bytes / 1048576) + 'MB';
  };

  // "3.2 / 9.7GB" — unit shown once on the total, keeps the chip narrow.
  const pair = (used, total) => {
    const div = total >= 1073741824 ? 1073741824 : 1048576;
    const u = div === 1073741824 ? (used / 1073741824).toFixed(1) : Math.round(used / 1048576);
    const t = div === 1073741824 ? `${(total / 1073741824).toFixed(1)}GB` : `${Math.round(total / 1048576)}MB`;
    return `${u} / ${t}`;
  };
  const memPair = pair(memUsed, memTotal);
  const diskPair = pair(diskUsed, diskTotal);
  const cpuUsed = ((cpu / 100) * cpuCores).toFixed(1);

  return (
    <header id="topbar">
      <div className="left">
        <button className="hamburger" onClick={onToggleSidebar}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <span className="brand">{pageTitles[page] || 'Overview'}</span>
      </div>
      <div className="topbar-right">
        <div className="stats">
          <span className="stat-chip">
            <span className="stat-label">CPU</span>
            <span className="stat-val">{cpuUsed} / {cpuCores}</span>
          </span>
          <span className="stat-chip">
            <span className="stat-label">RAM</span>
            <span className="stat-val">{memPair}</span>
          </span>
          <span className="stat-chip">
            <span className="stat-label">Disk</span>
            <span className="stat-val">{diskPair}</span>
          </span>
        </div>
        {onLogout && (
          <button className="btn btn-ghost btn-sm logout-btn" onClick={onLogout} title="Logout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        )}
      </div>
    </header>
  );
}