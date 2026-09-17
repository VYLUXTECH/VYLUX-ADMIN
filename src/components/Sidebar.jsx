const icons = {
  dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  terminal: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  monitor: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-13h-2v6l5.25 3.15.75-1.23-4-2.37V7z"/></svg>,
  server: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>,
  shield: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  payments: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  activity: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
};

export default function Sidebar({ page, onNavigate, servers, selectedServer, setSelectedServer }) {
  const running = servers.filter(s => s._running).length;

  const handleServerClick = (name) => {
    setSelectedServer(name);
    onNavigate('server');
  };

  const navSections = [
    {
      title: 'Command',
      items: [{ id: 'dashboard', label: 'Overview', icon: icons.dashboard }],
    },
    {
      title: 'Infrastructure',
      items: [
        { id: 'terminal', label: 'Terminal', icon: icons.terminal },
        { id: 'monitor', label: 'Monitor', icon: icons.monitor },
        { id: 'activity', label: 'Activity', icon: icons.activity },
        { id: 'payments', label: 'Payments', icon: icons.payments },
      ],
    },
  ];

  return (
    <aside id="sidebar">
      <div className="sidebar-header">
        <div className="logo-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </div>
        <span className="logo-text">VYLUX ADMIN</span>
      </div>

      <nav className="sidebar-nav">
        {navSections.map(section => (
          <div key={section.title}>
            <div className="nav-section">{section.title}</div>
            {section.items.map(item => (
              <button
                key={item.id}
                className={`nav-btn ${page === item.id ? 'active' : ''}`}
                onClick={() => { setSelectedServer(null); onNavigate(item.id); }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        ))}

        <div className="nav-section">
          <span>Services</span>
          <span className="badge-count" style={{ float: 'right' }}>{running}/{servers.length}</span>
        </div>

        <div className="server-list">
          {servers.length === 0 ? (
            <span className="empty-msg">No services yet</span>
          ) : (
            [...servers].sort((a, b) => a.name.localeCompare(b.name)).map(s => (
              <button
                key={s.name}
                className={`server-item ${selectedServer === s.name && page === 'server' ? 'active' : ''}`}
                onClick={() => handleServerClick(s.name)}
              >
                <span className={`server-dot ${s._running ? 'running' : 'stopped'}`} />
                <span className="server-name">{s.name}</span>
              </button>
            ))
          )}
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="mesh-state">
          <span className={`dot ${running > 0 ? 'ok' : 'off'}`}></span>
          {servers.length > 0 ? `${running} of ${servers.length} services up` : 'mesh idle'}
        </div>
        <button className="nav-btn" onClick={() => onNavigate('activity')}>
          {icons.shield}
          Activity Log
        </button>
      </div>
    </aside>
  );
}