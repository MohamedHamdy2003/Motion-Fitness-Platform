import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import jwt from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import { WebSocket, WebSocketServer } from 'ws';
import { uuid } from '../../common/http';
import { environment } from '../../config/environment';
import { query } from '../database/query';

export type AdminRealtimeTopic =
  | 'analytics'
  | 'users'
  | 'programs'
  | 'exercises'
  | 'meals'
  | 'meal-sections'
  | 'food-sections'
  | 'foods'
  | 'ingredients'
  | 'matching'
  | 'support';

export const ADMIN_WS_PATH = '/api/v1/admin/ws';
const MAX_ADMIN_SOCKETS = 200;
const AUTH_TIMEOUT_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const COALESCE_WINDOW_MS = 150;

interface TrackedAdminSocket {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  isAlive: boolean;
}

export function routeToRealtimeTopics(
  method: string,
  rawPath: string,
): AdminRealtimeTopic[] {
  const upper = method.toUpperCase();
  if (
    upper !== 'POST' &&
    upper !== 'PATCH' &&
    upper !== 'PUT' &&
    upper !== 'DELETE'
  ) {
    return [];
  }

  const path = rawPath.split('?')[0] || '';
  if (path.startsWith('/api/v1/admin/programs')) {
    return ['programs', 'analytics'];
  }
  if (path.startsWith('/api/v1/admin/exercises')) {
    return ['exercises', 'analytics'];
  }
  if (path.startsWith('/api/v1/admin/meals')) {
    return ['meals', 'analytics'];
  }
  if (path.startsWith('/api/v1/admin/meal-sections')) {
    return ['meal-sections'];
  }
  if (path.startsWith('/api/v1/admin/food-sections')) {
    return ['food-sections'];
  }
  if (path.startsWith('/api/v1/admin/foods')) {
    return ['foods'];
  }
  if (path.startsWith('/api/v1/admin/ingredients')) {
    return ['ingredients'];
  }
  if (path.startsWith('/api/v1/admin/users')) {
    return ['users', 'analytics'];
  }
  if (path.startsWith('/api/v1/admin/matching')) {
    return ['matching', 'analytics'];
  }
  if (
    path.startsWith('/api/v1/admin/faq') ||
    path.startsWith('/api/v1/admin/legal')
  ) {
    return ['support'];
  }
  if (path.startsWith('/api/v1/admin/analytics')) {
    return ['analytics'];
  }
  if (
    path === '/api/v1/auth/register' ||
    path === '/api/v1/auth/verify-email' ||
    path.startsWith('/api/v1/me') ||
    path.startsWith('/api/v1/profile')
  ) {
    return ['users', 'analytics'];
  }
  if (
    path.startsWith('/api/v1/workouts') ||
    path.startsWith('/api/v1/nutrition') ||
    path.startsWith('/api/v1/activity') ||
    path.startsWith('/api/v1/check-ins') ||
    path.startsWith('/api/v1/matching')
  ) {
    return ['analytics'];
  }
  return [];
}

@Injectable()
export class AdminEventsService implements OnApplicationShutdown {
  private wss?: WebSocketServer;
  private httpServer?: Server;
  private upgradeHandler?: (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void;
  private heartbeat?: NodeJS.Timeout;
  private flushTimer?: NodeJS.Timeout;
  private readonly clients = new Set<TrackedAdminSocket>();
  private readonly pendingTopics = new Set<AdminRealtimeTopic>();

  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  attachToHttpServer(httpServer: Server): void {
    if (this.wss) return;
    this.httpServer = httpServer;
    const wss = new WebSocketServer({
      noServer: true,
      maxPayload: 4096,
    });
    this.wss = wss;

    this.upgradeHandler = (req, socket, head) => {
      const pathname = (req.url || '').split('?')[0];
      if (pathname !== ADMIN_WS_PATH) {
        socket.destroy();
        return;
      }
      if (this.clients.size >= MAX_ADMIN_SOCKETS) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        this.handleConnection(ws);
      });
    };

    httpServer.on('upgrade', this.upgradeHandler);

    this.heartbeat = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          this.clients.delete(client);
          client.ws.terminate();
          continue;
        }
        client.isAlive = false;
        try {
          client.ws.ping();
        } catch {
          this.clients.delete(client);
          client.ws.terminate();
        }
      }
    }, HEARTBEAT_INTERVAL_MS).unref();
  }

  private async verifyAdminToken(
    token: string,
  ): Promise<
    { userId: string; sessionId: string } | 'UNAUTHENTICATED' | 'FORBIDDEN'
  > {
    if (!token || typeof token !== 'string') return 'UNAUTHENTICATED';
    const env = environment();
    let claims: jwt.JwtPayload;
    try {
      const verified = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      });
      if (
        typeof verified === 'string' ||
        !uuid.safeParse(verified.sub).success ||
        !uuid.safeParse(verified.sid).success ||
        typeof verified.exp !== 'number'
      ) {
        return 'UNAUTHENTICATED';
      }
      claims = verified;
    } catch {
      return 'UNAUTHENTICATED';
    }

    const [row] = await query(
      this.db,
      `SELECT s.id,
              u.verified_at,
              EXISTS(
                SELECT 1
                FROM user_roles ur
                WHERE ur.user_id = u.id AND ur.role_code = 'ADMIN'
              ) AS is_admin
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1
         AND s.user_id = $2
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND u.status = 'ACTIVE'`,
      [claims.sid, claims.sub],
    );
    if (!row) return 'UNAUTHENTICATED';
    if (!row.verified_at || !row.is_admin) return 'FORBIDDEN';
    return { userId: String(claims.sub), sessionId: String(claims.sid) };
  }

  private handleConnection(ws: WebSocket): void {
    let tracked: TrackedAdminSocket | null = null;
    let authenticating = false;

    const authTimer = setTimeout(() => {
      if (!tracked && ws.readyState === WebSocket.OPEN) {
        ws.close(4401, 'AUTH_TIMEOUT');
      }
    }, AUTH_TIMEOUT_MS).unref();

    ws.on('pong', () => {
      if (tracked) tracked.isAlive = true;
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      if (tracked) this.clients.delete(tracked);
    });

    ws.on('error', () => {
      clearTimeout(authTimer);
      if (tracked) this.clients.delete(tracked);
    });

    ws.on('message', (raw) => {
      let msg: { type?: string; token?: string };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        ws.close(4400, 'INVALID_JSON');
        return;
      }

      if (!tracked) {
        if (authenticating) return;
        if (msg?.type !== 'auth' || typeof msg.token !== 'string') {
          clearTimeout(authTimer);
          ws.close(4401, 'UNAUTHENTICATED');
          return;
        }
        authenticating = true;
        void this.verifyAdminToken(msg.token)
          .then((result) => {
            clearTimeout(authTimer);
            if (ws.readyState !== WebSocket.OPEN) return;
            if (result === 'UNAUTHENTICATED') {
              ws.close(4401, 'UNAUTHENTICATED');
              return;
            }
            if (result === 'FORBIDDEN') {
              ws.close(4403, 'FORBIDDEN');
              return;
            }
            tracked = {
              ws,
              userId: result.userId,
              sessionId: result.sessionId,
              isAlive: true,
            };
            this.clients.add(tracked);
            ws.send(JSON.stringify({ type: 'ready', ts: Date.now() }));
          })
          .catch(() => {
            clearTimeout(authTimer);
            if (ws.readyState === WebSocket.OPEN) {
              ws.close(4500, 'AUTH_ERROR');
            }
          });
        return;
      }

      tracked.isAlive = true;
      if (msg?.type === 'ping' && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
    });
  }

  emit(topics: AdminRealtimeTopic | AdminRealtimeTopic[]): void {
    if (this.clients.size === 0) return;
    const list = Array.isArray(topics) ? topics : [topics];
    if (list.length === 0) return;
    for (const topic of list) {
      this.pendingTopics.add(topic);
    }
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flushPending();
    }, COALESCE_WINDOW_MS).unref();
  }

  private flushPending(): void {
    if (this.pendingTopics.size === 0 || this.clients.size === 0) {
      this.pendingTopics.clear();
      return;
    }
    const payload = JSON.stringify({
      type: 'invalidate',
      topics: [...this.pendingTopics],
      ts: Date.now(),
    });
    this.pendingTopics.clear();

    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(payload);
        } catch {
          this.clients.delete(client);
          client.ws.terminate();
        }
      } else {
        this.clients.delete(client);
      }
    }
  }

  onApplicationShutdown(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.httpServer && this.upgradeHandler) {
      this.httpServer.off('upgrade', this.upgradeHandler);
      this.upgradeHandler = undefined;
    }
    for (const client of this.clients) {
      try {
        client.ws.close(1001, 'SERVER_SHUTDOWN');
      } catch {
        // Ignore shutdown errors.
      }
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = undefined;
    }
  }
}
