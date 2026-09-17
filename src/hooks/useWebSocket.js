import { useEffect, useRef } from 'react';

export function useWebSocket(handlers) {
  const wsRef = useRef(null);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'stats' && handlersRef.current.onStats) handlersRef.current.onStats(msg.data);
        if (msg.type === 'serverState' && handlersRef.current.onServerState) handlersRef.current.onServerState(msg);
      } catch { /* ignore */ }
    };

    ws.onerror = () => undefined;

    return () => ws.close();
  }, []);

  return wsRef;
}
