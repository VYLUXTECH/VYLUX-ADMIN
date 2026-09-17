import { useState, useEffect, useCallback } from 'react';
import './App.css';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './components/Dashboard';
import Terminal from './components/Terminal';
import Monitor from './components/Monitor';
import Payments from './components/Payments';
import Activity from './components/Activity';
import ServerDetail from './components/ServerDetail';
import { ToastProvider } from './components/Toast';
import { useServers } from './hooks/useServers';
import { useWebSocket } from './hooks/useWebSocket';
import { apiGet } from './hooks/useApi';

function DashboardLayout() {
  const [page, setPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const serverCtx = useServers();

  const handleLogout = () => {
    localStorage.removeItem('vylux_token');
    window.location.reload();
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const i = await apiGet('/api/info');
        setStats(i);
      } catch { /* ignore */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  useWebSocket({
    onStats: (d) => setStats(d),
    onServerState: (msg) => {
      serverCtx.setServers(prev => prev.map(s =>
        s.name === msg.name ? { ...s, _running: msg.running } : s
      ));
    }
  });

  const handleNavigate = useCallback((p) => {
    setPage(p);
    setSidebarOpen(false);
  }, []);

  return (
    <div className="app-layout">
      {sidebarOpen && <div className="sidebar-backdrop visible" onClick={() => setSidebarOpen(false)} />}
      <Sidebar page={page} onNavigate={handleNavigate} servers={serverCtx.servers} selectedServer={serverCtx.selectedServer} setSelectedServer={serverCtx.setSelectedServer} />
      <div id="main">
        <Topbar page={page} stats={stats} onToggleSidebar={() => setSidebarOpen(prev => !prev)} onLogout={handleLogout} />
        <div id="content">
          {page === 'dashboard' && <Dashboard servers={serverCtx.servers} onNavigate={handleNavigate} setSelectedServer={serverCtx.setSelectedServer} />}
          {page === 'terminal' && <Terminal />}
          {page === 'monitor' && <Monitor />}
          {page === 'activity' && <Activity />}
          {page === 'payments' && <Payments />}
          {page === 'server' && <ServerDetail servers={serverCtx.servers} selectedServer={serverCtx.selectedServer} setSelectedServer={serverCtx.setSelectedServer} startServer={serverCtx.startServer} stopServer={serverCtx.stopServer} sendStdin={serverCtx.sendStdin} getServerDetails={serverCtx.getServerDetails} updateServer={serverCtx.updateServer} deleteServer={serverCtx.deleteServer} onNavigate={handleNavigate} />}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('vylux_token'));

  if (!token) return <Login onLogin={setToken} />;

  return (
    <ToastProvider>
      <DashboardLayout />
    </ToastProvider>
  );
}
