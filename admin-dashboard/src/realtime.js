import { useEffect, useState } from 'react';

const PING_INTERVAL_MS = 25_000;
const COALESCE_DELAY_MS = 350;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 15_000;

function buildWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/v1/admin/ws`;
}

export function useAdminRealtime(session) {
  const [status, setStatus] = useState('disconnected');
  const [revisions, setRevisions] = useState({});

  useEffect(() => {
    if (!session?.getAccessToken || typeof WebSocket === 'undefined') {
      setStatus('disconnected');
      return;
    }

    let disposed = false;
    let socket = null;
    let reconnectTimer = null;
    let pingTimer = null;
    let flushTimer = null;
    let backoffMs = BASE_BACKOFF_MS;
    let forceTokenRefresh = false;
    const pendingTopics = new Set();

    function clearTimers() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
    }

    function scheduleFlush(topics) {
      for (const topic of topics) {
        if (typeof topic === 'string' && topic) pendingTopics.add(topic);
      }
      if (flushTimer || pendingTopics.size === 0) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        if (disposed || pendingTopics.size === 0) return;
        const batch = [...pendingTopics];
        pendingTopics.clear();
        setRevisions((prev) => {
          const next = { ...prev };
          for (const topic of batch) {
            next[topic] = (next[topic] || 0) + 1;
          }
          return next;
        });
      }, COALESCE_DELAY_MS);
    }

    function scheduleReconnect(immediate = false) {
      if (disposed) return;
      clearTimers();
      setStatus('reconnecting');
      const delay = immediate ? 250 : backoffMs;
      backoffMs = Math.min(MAX_BACKOFF_MS, Math.round(backoffMs * 1.8));
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    }

    function connect() {
      if (disposed) return;
      clearTimers();
      setStatus((prev) => (prev === 'connected' ? 'connected' : 'connecting'));

      let ws;
      try {
        ws = new WebSocket(buildWsUrl());
      } catch {
        scheduleReconnect(false);
        return;
      }
      socket = ws;

      ws.addEventListener('open', () => {
        if (disposed || socket !== ws) return;
        const shouldRefresh = forceTokenRefresh;
        forceTokenRefresh = false;
        void session
          .getAccessToken({ forceRefresh: shouldRefresh })
          .then((token) => {
            if (disposed || socket !== ws || ws.readyState !== WebSocket.OPEN) {
              return;
            }
            if (!token) {
              ws.close(4401);
              return;
            }
            ws.send(JSON.stringify({ type: 'auth', token }));
          })
          .catch(() => {
            if (socket === ws && ws.readyState === WebSocket.OPEN) {
              ws.close(4401);
            }
          });
      });

      ws.addEventListener('message', (event) => {
        if (disposed || socket !== ws) return;
        let msg;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (msg?.type === 'ready') {
          backoffMs = BASE_BACKOFF_MS;
          setStatus('connected');
          if (pingTimer) clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: 'ping' }));
              } catch {
                // Close handler will trigger reconnect.
              }
            }
          }, PING_INTERVAL_MS);
        } else if (msg?.type === 'invalidate' && Array.isArray(msg.topics)) {
          scheduleFlush(msg.topics);
        }
      });

      ws.addEventListener('close', (event) => {
        if (disposed || socket !== ws) return;
        socket = null;
        clearTimers();
        if (event.code === 4403) {
          setStatus('disconnected');
          return;
        }
        if (event.code === 4401) {
          forceTokenRefresh = true;
          scheduleReconnect(true);
          return;
        }
        scheduleReconnect(false);
      });

      ws.addEventListener('error', () => {
        // The close event always follows and triggers reconnect.
      });
    }

    function handleResume() {
      if (disposed || document.visibilityState === 'hidden') return;
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        backoffMs = BASE_BACKOFF_MS;
        connect();
      }
    }

    window.addEventListener('online', handleResume);
    document.addEventListener('visibilitychange', handleResume);
    connect();

    return () => {
      disposed = true;
      clearTimers();
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      window.removeEventListener('online', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
      if (socket) {
        try {
          socket.close(1000, 'CLIENT_UNMOUNT');
        } catch {
          // Ignore close errors during teardown.
        }
        socket = null;
      }
    };
  }, [session]);

  return { status, revisions };
}
