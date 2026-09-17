import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export default function Terminal() {
  const containerRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'var(--mono), monospace',
      theme: { background: '#0a0a0a', foreground: '#d7d7d7', cursor: '#d7d7d7' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const token = localStorage.getItem('vylux_token') || '';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws/term?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => term.clear();
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') term.write(e.data);
      else e.data.text().then(t => term.write(t));
    };
    ws.onclose = () => term.writeln('\r\n\x1b[31m[connection closed]\x1b[0m');
    ws.onerror = () => term.writeln('\r\n\x1b[31m[connection error]\x1b[0m');

    term.onData(data => {
      if (ws.readyState === 1) ws.send(data);
    });

    const onResize = () => {
      try { fit.fit(); } catch {}
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      ws.close();
      term.dispose();
    };
  }, []);

  return (
    <div className="page active" id="page-terminal">
      <div className="card terminal-card">
        <div className="card-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          Full Terminal
          <span className="terminal-badge">pty · bash</span>
        </div>
        <div className="xterm-box" ref={containerRef} />
      </div>
    </div>
  );
}