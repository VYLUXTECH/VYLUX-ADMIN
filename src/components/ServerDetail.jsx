import { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';

export default function ServerDetail({ servers, selectedServer, setSelectedServer, startServer, stopServer, sendStdin, getServerDetails, updateServer, deleteServer, onNavigate }) {
  const toast = useToast();
  const [tab, setTab] = useState('console');
  const [log, setLog] = useState('');
  const logBufferRef = useRef('');
  const [stdin, setStdin] = useState('');
  const [details, setDetails] = useState(null);
  const [filePath, setFilePath] = useState('/');
  const [files, setFiles] = useState([]);
  const [fileLoading, setFileLoading] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [settingsCmd, setSettingsCmd] = useState('');
  const [settingsDomain, setSettingsDomain] = useState('');
  const [settingsRepoUrl, setSettingsRepoUrl] = useState('');
  const [settingsSshKey, setSettingsSshKey] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const logRef = useRef(null);
  const pollRef = useRef(null);

  const server = servers.find(s => s.name === selectedServer);

  useEffect(() => {
    if (!server) return;
    queueMicrotask(() => {
      setSettingsName(server.name);
      setSettingsCmd(server.cmd || '');
      setSettingsDomain(server.domain || '');
      setSettingsRepoUrl(server.repoUrl || '');
      setSettingsSshKey(server.sshKey || '');
      logBufferRef.current = '';
      setLog(server._running ? 'Process running. Log will appear here...' : 'Service not started. Press Start.');
      setFilePath('/');
      setTab('console');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.name, server?.cmd, server?.domain, server?.repoUrl, server?.sshKey, server?._running]);

  useEffect(() => {
    if (!server?._running) return;
    const doPoll = async () => {
      if (!selectedServer) return;
      try {
        const d = await getServerDetails(selectedServer);
        setDetails(d);
        if (d.log && d.log !== logBufferRef.current) {
          logBufferRef.current = d.log;
          setLog(d.log || 'No output.');
          if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        }
      } catch { /* ignore */ }
    };
    doPoll();
    pollRef.current = setInterval(doPoll, 2000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [server?._running, selectedServer, getServerDetails]);

  const handleStart = async () => {
    if (!server) return;
    try {
      const r = await startServer(server.name, server.cmd);
      logBufferRef.current = r.log || '';
      setLog(r.log || 'Started.');
      toast('Service started', 'success');
    } catch (e) { toast(`Start failed: ${e.message}`, 'error'); }
  };

  const handleStop = async () => {
    if (!server) return;
    try {
      await stopServer(server.name);
      setLog(prev => prev + '\n--- Stopped ---');
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      toast('Service stopped', 'success');
    } catch (e) { toast(`Stop failed: ${e.message}`, 'error'); }
  };

  const handleRestart = async () => {
    if (!server) return;
    try {
      await stopServer(server.name);
      const r = await startServer(server.name, server.cmd);
      logBufferRef.current = r.log || '';
      setLog(r.log || 'Restarted.');
      toast('Service restarted', 'success');
    } catch (e) { toast(`Restart failed: ${e.message}`, 'error'); }
  };

  const handleUpdate = async () => {
    if (!server) return;
    try {
      const r = await apiPost('/api/server/update', { name: server.name });
      toast('Update complete: ' + (r.output || '').slice(0, 100), 'success');
    } catch (e) { toast(`Update failed: ${e.message}`, 'error'); }
  };

  const handleDelete = async () => {
    if (!server || !confirm(`Delete "${server.name}" and all its files?`)) return;
    try {
      await deleteServer(server.name);
      setSelectedServer(null);
      onNavigate('dashboard');
      toast(`Service deleted`, 'success');
    } catch (e) { toast(`Delete failed: ${e.message}`, 'error'); }
  };

  const handleStdin = async () => {
    if (!server || !stdin.trim()) return;
    try {
      await sendStdin(server.name, stdin);
      setStdin('');
    } catch (e) { toast(`Stdin error: ${e.message}`, 'error'); }
  };

  const handleSaveSettings = async () => {
    if (!settingsName.trim() || !settingsCmd.trim()) {
      setSettingsError('Name and command required');
      return;
    }
    setSettingsError('');
    try {
      const body = { name: selectedServer, newName: settingsName, cmd: settingsCmd, domain: settingsDomain || '', repoUrl: settingsRepoUrl || '', sshKey: settingsSshKey || '' };
      await updateServer(body);
      toast('Settings saved', 'success');
    } catch (e) { setSettingsError(e.message); }
  };

  const loadFiles = async () => {
    if (!selectedServer) return;
    const p = filePath.startsWith('/') ? filePath : '/' + filePath;
    setFilePath(p);
    setFileLoading(true);
    try {
      const f = await apiGet(`/api/server/files?name=${encodeURIComponent(selectedServer)}&path=${encodeURIComponent(p)}`);
      setFiles(f);
    } catch { setFiles([]); }
    setFileLoading(false);
  };

  useEffect(() => {
    if (tab !== 'files' || !selectedServer) return;
    const p = filePath.startsWith('/') ? filePath : '/' + filePath;
    const doFetch = async () => {
      setFileLoading(true);
      try {
        const f = await apiGet(`/api/server/files?name=${encodeURIComponent(selectedServer)}&path=${encodeURIComponent(p)}`);
        setFiles(f);
      } catch { setFiles([]); }
      setFileLoading(false);
    };
    doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedServer]);

  const navFile = (p) => { setFilePath(p); setTimeout(loadFiles, 0); };
  const dlFile = (p) => { window.open(`/api/server/file?name=${encodeURIComponent(selectedServer)}&path=${encodeURIComponent(p)}`); };

  const handleUpload = async (fileList) => {
    if (!fileList.length || !selectedServer) return;
    for (const f of fileList) {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('path', filePath);
      await fetch(`/api/server/upload?name=${encodeURIComponent(selectedServer)}`, { method: 'POST', body: fd });
    }
    toast('Upload complete', 'success');
    loadFiles();
  };

  const handleMkdir = async () => {
    const name = prompt('Folder name:');
    if (!name || !selectedServer) return;
    try {
      await apiPost('/api/server/mkdir', { name: selectedServer, path: `${filePath.replace(/\/+$/, '')}/${name}` });
      toast('Folder created', 'success');
      loadFiles();
    } catch (e) { toast(`Error: ${e.message}`, 'error'); }
  };

  if (!server) {
    return (
      <div className="page active" id="page-server">
        <div className="empty-state" style={{ marginTop: 60 }}>Select a service from the sidebar.</div>
      </div>
    );
  }

  const tabs = [
    { id: 'console', label: 'Console', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg> },
    { id: 'files', label: 'Files', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { id: 'settings', label: 'Settings', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg> },
  ];

  return (
    <div className="page active" id="page-server" style={{ animation: 'fadeIn 0.3s ease' }}>
      <div className="card server-header">
        <div className="server-header-top">
          <span className={`server-dot-lg ${server._running ? 'running' : 'stopped'}`} />
          <div className="server-name-display">
            <span className="server-name-text">{server.name}</span>
            <span className="server-cmd">{server.cmd}</span>
          </div>
          <div className="server-actions">
            {!server._running ? (
              <button className="btn btn-success btn-sm" onClick={handleStart}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Start
              </button>
            ) : (
              <>
                <button className="btn btn-warning btn-sm" onClick={handleRestart}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                  Restart
                </button>
                <button className="btn btn-danger btn-sm" onClick={handleStop}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                  Stop
                </button>
              </>
            )}
            <button className="btn btn-accent btn-sm" onClick={handleUpdate}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
              Update
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleDelete}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              Delete
            </button>
          </div>
        </div>
        <div className="server-resources">
          <span>CPU: <strong>{details ? `${details.cpu || 0}%` : '—'}</strong></span>
          <span>RAM: <strong>{details ? (details.mem >= 1024 ? `${(details.mem / 1024).toFixed(1)}MB` : `${details.mem}KB`) : '—'}</strong></span>
          <span>Disk: <strong>{details ? `${details.disk || 0}MB` : '—'}</strong></span>
          <span>PID: <strong>{details?.pid || '—'}</strong></span>
          <span>Uptime: <strong>{details?.uptime ? `${Math.floor(details.uptime / 60)}m ${details.uptime % 60}s` : '—'}</strong></span>
        </div>
      </div>

      <div className="tabs">
        {tabs.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'console' && (
        <div className="tab-content active" id="tab-console">
          <div className="card console-card">
            <div className="card-title">Console Log</div>
            <div className="terminal-box full" ref={logRef}>{log}</div>
            <div className="input-row">
              <input
                value={stdin}
                onChange={e => setStdin(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleStdin(); }}
                placeholder="stdin..."
                disabled={!server._running}
                className="terminal-input"
              />
              <button className="btn btn-accent btn-sm" onClick={handleStdin} disabled={!server._running}>Send</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'files' && (
        <div className="tab-content active" id="tab-files">
          <div className="card">
            <div className="input-row file-nav">
              <input value={filePath} onChange={e => setFilePath(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadFiles(); }} />
              <button className="btn btn-accent btn-sm" onClick={loadFiles}>Browse</button>
              <label className="btn btn-success btn-sm upload-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload
                <input type="file" hidden multiple onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />
              </label>
              <button className="btn btn-ghost btn-sm" onClick={handleMkdir}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                Folder
              </button>
            </div>
          </div>
          <div className="card file-table" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleUpload([...e.dataTransfer.files]); }}>
            {fileLoading ? (
              <div className="file-row" style={{ cursor: 'default', color: 'var(--text-muted)' }}>Loading...</div>
            ) : files.length === 0 && filePath === '/' ? (
              <div className="file-row" style={{ cursor: 'default', color: 'var(--text-muted)' }}>Empty directory</div>
            ) : (
              <>
                {filePath !== '/' && (
                  <div className="file-row" onClick={() => navFile(filePath.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/')}>
                    <span className="file-icon folder">📂</span>
                    <span className="file-name folder">..</span>
                    <span className="file-size">—</span>
                  </div>
                )}
                {files.filter(f => f.isDir).sort((a, b) => a.name.localeCompare(b.name)).map(f => {
                  const fp = `${filePath.replace(/\/+$/, '')}/${f.name}`;
                  return (
                    <div key={fp} className="file-row" onClick={() => navFile(fp)}>
                      <span className="file-icon folder">📁</span>
                      <span className="file-name folder">{f.name}</span>
                      <span className="file-size">—</span>
                    </div>
                  );
                })}
                {files.filter(f => !f.isDir).sort((a, b) => a.name.localeCompare(b.name)).map(f => {
                  const fp = `${filePath.replace(/\/+$/, '')}/${f.name}`;
                  return (
                    <div key={fp} className="file-row" onClick={() => dlFile(fp)}>
                      <span className="file-icon">📄</span>
                      <span className="file-name">{f.name}</span>
                      <span className="file-size">{f.size || '—'}</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="tab-content active" id="tab-settings">
          <div className="card settings-card">
            <div className="card-title">Service Settings</div>
            <div className="form-group">
              <label>Name</label>
              <input value={settingsName} onChange={e => setSettingsName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Main File</label>
              <input value={settingsCmd} onChange={e => setSettingsCmd(e.target.value)} className="mono" />
            </div>
            <div className="settings-divider" />
            <div className="card-title" style={{ fontSize: 13 }}>Domain</div>
            <div className="form-group">
              <label>Public URL (optional)</label>
              <input value={settingsDomain} onChange={e => setSettingsDomain(e.target.value)} placeholder="Leave empty to skip" />
            </div>
            <div className="settings-divider" />
            <div className="card-title" style={{ fontSize: 13 }}>Git Repository</div>
            <div className="form-group">
              <label>Git Repo URL</label>
              <input value={settingsRepoUrl} onChange={e => setSettingsRepoUrl(e.target.value)} placeholder="git@github.com:user/repo.git" className="mono" />
            </div>
            <div className="form-group">
              <label>SSH Key (for private repos)</label>
              <textarea value={settingsSshKey} onChange={e => setSettingsSshKey(e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..." rows={4} className="mono" style={{ fontFamily: 'monospace', fontSize: 11 }} />
            </div>
            {settingsError && <div className="form-error">{settingsError}</div>}
            <button className="btn btn-accent" onClick={handleSaveSettings} style={{ marginTop: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
