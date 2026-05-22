import type { Server } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { Logger } from '../logger';
import type { LiveBroadcaster } from './broadcaster';
import type { ClientMessage, ServerMessage } from '../../../shared/protocol';
import type { ServerStatus } from '../../../shared/api';

/** Per-connection replay controller — implemented by the replay engine (M5). */
export interface ReplaySession {
  pause(): void;
  resume(): void;
  stop(): void;
  setSpeed(speed: number): void;
  seek(toMs: number): void;
}

/** Factory for per-connection replay sessions. Null until the engine is wired. */
export interface ReplayService {
  start(
    sessionId: string,
    speed: number,
    send: (msg: ServerMessage) => void,
  ): Promise<ReplaySession>;
}

interface Conn {
  socket: WebSocket;
  mode: 'live' | 'replay';
  isAlive: boolean;
  replay: ReplaySession | null;
}

const MAX_BUFFERED_BYTES = 1024 * 1024;
const HEARTBEAT_MS = 30_000;
const STATUS_INTERVAL_MS = 1000;

export class WsServer {
  private readonly wss: WebSocketServer;
  private readonly conns = new Set<Conn>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  private replayService: ReplayService | null = null;

  constructor(
    server: Server,
    private readonly logger: Logger,
    broadcaster: LiveBroadcaster,
    private readonly getStatus: () => ServerStatus,
  ) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (pathname !== '/ws') {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws) => this.onConnection(ws));
    broadcaster.setSink((json) => this.broadcastToLive(json));

    this.heartbeatTimer = setInterval(() => this.runHeartbeat(), HEARTBEAT_MS);
    this.statusTimer = setInterval(() => this.broadcastStatus(), STATUS_INTERVAL_MS);
  }

  /** Wire the replay engine (M5). Until set, replay messages are rejected. */
  setReplayService(service: ReplayService): void {
    this.replayService = service;
  }

  private onConnection(socket: WebSocket): void {
    const conn: Conn = { socket, mode: 'live', isAlive: true, replay: null };
    this.conns.add(conn);
    this.logger.debug(`WebSocket client connected (${this.conns.size} total)`);

    this.send(conn, { type: 'hello', mode: 'live' });

    socket.on('pong', () => {
      conn.isAlive = true;
    });
    socket.on('message', (data) => {
      void this.handleMessage(conn, data);
    });
    socket.on('error', (err) => {
      this.logger.debug(`WebSocket client error: ${err.message}`);
    });
    socket.on('close', () => {
      conn.replay?.stop();
      this.conns.delete(conn);
      this.logger.debug(`WebSocket client disconnected (${this.conns.size} total)`);
    });
  }

  private async handleMessage(conn: Conn, data: RawData): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      this.send(conn, { type: 'error', code: 'bad_json', message: 'invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'ping':
        this.send(conn, { type: 'pong' });
        return;

      case 'subscribe.live':
        conn.replay?.stop();
        conn.replay = null;
        conn.mode = 'live';
        this.send(conn, { type: 'hello', mode: 'live' });
        return;

      case 'replay.start': {
        if (!this.replayService) {
          this.send(conn, {
            type: 'error',
            code: 'replay_unavailable',
            message: 'replay is not available',
          });
          return;
        }
        conn.replay?.stop();
        conn.replay = null;
        try {
          const session = await this.replayService.start(msg.sessionId, msg.speed ?? 1, (out) =>
            this.send(conn, out),
          );
          conn.replay = session;
          conn.mode = 'replay';
        } catch (err) {
          this.send(conn, {
            type: 'error',
            code: 'replay_failed',
            message: err instanceof Error ? err.message : 'replay failed to start',
          });
        }
        return;
      }

      case 'replay.pause':
        conn.replay?.pause();
        return;
      case 'replay.resume':
        conn.replay?.resume();
        return;
      case 'replay.stop':
        conn.replay?.stop();
        conn.replay = null;
        conn.mode = 'live';
        this.send(conn, { type: 'hello', mode: 'live' });
        return;
      case 'replay.setSpeed':
        conn.replay?.setSpeed(msg.speed);
        return;
      case 'replay.seek':
        conn.replay?.seek(msg.toMs);
        return;

      default:
        this.send(conn, {
          type: 'error',
          code: 'unknown_message',
          message: `unknown message type`,
        });
    }
  }

  private send(conn: Conn, msg: ServerMessage): void {
    if (conn.socket.readyState === WebSocket.OPEN) {
      conn.socket.send(JSON.stringify(msg));
    }
  }

  /** Broadcast a pre-serialized telemetry message to all live-mode clients. */
  broadcastToLive(json: string): void {
    for (const conn of this.conns) {
      if (conn.mode !== 'live') continue;
      if (conn.socket.readyState !== WebSocket.OPEN) continue;
      if (conn.socket.bufferedAmount > MAX_BUFFERED_BYTES) continue;
      conn.socket.send(json);
    }
  }

  private broadcastStatus(): void {
    if (this.conns.size === 0) return;
    const json = JSON.stringify({ type: 'status', status: this.getStatus() });
    for (const conn of this.conns) {
      if (conn.mode === 'live' && conn.socket.readyState === WebSocket.OPEN) {
        conn.socket.send(json);
      }
    }
  }

  private runHeartbeat(): void {
    for (const conn of this.conns) {
      if (!conn.isAlive) {
        conn.socket.terminate();
        continue;
      }
      conn.isAlive = false;
      conn.socket.ping();
    }
  }

  get clientCount(): number {
    return this.conns.size;
  }

  async close(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    for (const conn of this.conns) {
      conn.replay?.stop();
      conn.socket.terminate();
    }
    this.conns.clear();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}
