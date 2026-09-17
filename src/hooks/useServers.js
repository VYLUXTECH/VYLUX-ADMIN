import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDel, apiPut } from './useApi';

export function useServers() {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);

  const refreshServers = useCallback(async () => {
    try {
      const list = await apiGet('/api/servers');
      if (!Array.isArray(list)) return;
      setServers(prev => {
        const oldMap = {};
        prev.forEach(s => { oldMap[s.name] = { _running: s._running, repoUrl: s.repoUrl, sshKey: s.sshKey }; });
        return list.map(s => ({
          name: s.name, cmd: s.cmd || '', domain: s.domain || '',
          repoUrl: s.repoUrl || oldMap[s.name]?.repoUrl || '',
          sshKey: s.sshKey || oldMap[s.name]?.sshKey || '',
          _running: oldMap[s.name]?._running || false
        }));
      });
      for (const s of list) {
        try {
          const d = await apiGet(`/api/server/details?name=${encodeURIComponent(s.name)}`);
          setServers(prev => prev.map(x => x.name === s.name
            ? { ...x, _running: d.running, _cpu: d.cpu, _mem: d.mem, _disk: d.disk, _uptime: d.uptime }
            : x));
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }, []);

  const deleteServer = useCallback(async (name) => {
    await apiDel('/api/server', { name });
    setServers(prev => prev.filter(x => x.name !== name));
  }, []);

  const updateServer = useCallback(async (body) => {
    const r = await apiPut('/api/server', body);
    if (Array.isArray(r)) setServers(r);
  }, []);

  const startServer = useCallback(async (name, cmd) => {
    return await apiPost('/api/start', { name, cmd });
  }, []);

  const stopServer = useCallback(async (name) => {
    return await apiPost('/api/stop', { name });
  }, []);

  const sendStdin = useCallback(async (name, data) => {
    await apiPost('/api/stdin', { name, data: data + '\n' });
  }, []);

  const getServerDetails = useCallback(async (name) => {
    return await apiGet(`/api/server/details?name=${encodeURIComponent(name)}`);
  }, []);

  useEffect(() => {
    refreshServers();
    const interval = setInterval(refreshServers, 5000);
    return () => clearInterval(interval);
  }, [refreshServers]);

  return {
    servers, setServers, selectedServer, setSelectedServer,
    refreshServers, deleteServer, updateServer,
    startServer, stopServer, sendStdin, getServerDetails
  };
}
