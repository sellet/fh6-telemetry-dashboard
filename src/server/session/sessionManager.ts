import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { Config } from '../config';
import type { Logger } from '../logger';
import type { TelemetryBus } from '../core/telemetryBus';
import { isRacing, type TelemetryFrame } from '../../../shared/telemetry';
import {
  SESSION_SCHEMA_VERSION,
  emptyStats,
  type SessionEndReason,
  type SessionKind,
  type SessionManifest,
  type SessionStats,
  type SessionStatus,
} from '../../../shared/session';
import { JsonlWriter } from './jsonlWriter';
import { StatsAccumulator } from './statsAccumulator';

interface ActiveSession {
  id: string;
  dir: string;
  writer: JsonlWriter;
  stats: StatsAccumulator;
  startedAt: Date;
  lastFrameTimeMs: number;
  firstFrame: TelemetryFrame;
  kind: SessionKind;
}

export interface RecordingStatus {
  active: boolean;
  sessionId: string | null;
  frameCount: number;
  droppedFrames: number;
  error: string | null;
}

function kindFor(frame: TelemetryFrame): SessionKind {
  // Race kind is derived from lap/position state, NOT isRaceOn (which only
  // means "the player is driving" — open-world cruising is also isRaceOn=1).
  return isRacing(frame) ? 'race' : 'free-roam';
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

export function formatSessionId(date: Date): string {
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${stamp}-${Math.random().toString(16).slice(2, 6)}`;
}

async function gzipFile(src: string, dest: string): Promise<void> {
  await pipeline(fs.createReadStream(src), zlib.createGzip(), fs.createWriteStream(dest));
}

/** Stream a JSONL telemetry file line by line, transparently gunzipping. */
export async function streamTelemetryFile(
  filePath: string,
  compressed: boolean,
  onFrame: (frame: TelemetryFrame) => void,
): Promise<void> {
  const fileStream = fs.createReadStream(filePath);
  const input = compressed ? fileStream.pipe(zlib.createGunzip()) : fileStream;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      onFrame(JSON.parse(trimmed) as TelemetryFrame);
    } catch {
      // skip a malformed line rather than abort the whole file
    }
  }
}

/**
 * Records each driving session to disk. A session starts on the first
 * telemetry frame and automatically splits whenever `isRaceOn` flips
 * (race-start / race-end) or `carOrdinal` changes. A session ends when no
 * telemetry packets have been received for SESSION_TIMEOUT_SECONDS. The
 * `cut()` API splits the current recording on demand.
 */
export class SessionManager {
  private state: SessionStatus | 'idle' = 'idle';
  private active: ActiveSession | null = null;
  private timeoutTimer: NodeJS.Timeout | null = null;
  private recordingError: string | null = null;
  /** Chain of pending finalizations so transitions never block ingestion. */
  private pendingFinalize: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: Config,
    private readonly logger: Logger,
    private readonly bus: TelemetryBus,
  ) {}

  start(): void {
    this.bus.onFrame((frame) => this.onFrame(frame));
    this.timeoutTimer = setInterval(() => {
      void this.checkTimeout();
    }, 1000);
  }

  private onFrame(frame: TelemetryFrame): void {
    const isDriving = frame.isRaceOn === 1;

    if (this.state === 'idle') {
      // Don't record menu/paused time — only start when the player is actually
      // driving. Positions reported with isRaceOn=0 are unreliable anyway.
      if (!isDriving) return;
      this.beginSession(frame);
    } else if (this.active) {
      const a = this.active;
      if (!isDriving) {
        // Player went back to menus / paused. Finalize the session — a new
        // one will start the next time they drive.
        const old = a;
        this.state = 'idle';
        this.active = null;
        const finalize = this.pendingFinalize.then(() => this.finalizeOne(old, 'driving-ended'));
        this.pendingFinalize = finalize.catch(() => {});
        return;
      }
      const frameKind = kindFor(frame);
      if (frameKind !== a.kind) {
        // Entered or left a timed event — finalize the old session and start
        // a new one whose first frame is this transition frame.
        this.rollSession(frame, frameKind === 'race' ? 'race-start' : 'race-end');
      } else if (frame.carOrdinal !== a.firstFrame.carOrdinal) {
        this.rollSession(frame, 'car-change');
      }
    }

    const active = this.active;
    if (this.state === 'recording' && active) {
      active.writer.write(frame);
      active.stats.update(frame);
      active.lastFrameTimeMs = Date.now();
    }
  }

  /**
   * Finalize the current session and immediately begin a new one with
   * `currentFrame` as its first frame. The finalize runs asynchronously so
   * ingestion of the new session is not blocked.
   */
  private rollSession(currentFrame: TelemetryFrame, reason: SessionEndReason): void {
    const old = this.active;
    if (!old || this.state !== 'recording') return;
    this.state = 'idle';
    this.active = null;
    const finalize = this.pendingFinalize.then(() => this.finalizeOne(old, reason));
    this.pendingFinalize = finalize.catch(() => {
      // errors are logged inside finalizeOne; do not poison the chain
    });
    this.beginSession(currentFrame);
  }

  private beginSession(firstFrame: TelemetryFrame): void {
    const startedAt = new Date();
    const id = formatSessionId(startedAt);
    const dir = path.join(this.config.sessionsDir, id);
    fs.mkdirSync(dir, { recursive: true });

    this.recordingError = null;
    const writer = new JsonlWriter(path.join(dir, 'telemetry.jsonl'), (err) => {
      this.recordingError = err.message;
      this.logger.error({ err }, `recording write error for session ${id}`);
    });

    this.active = {
      id,
      dir,
      writer,
      stats: new StatsAccumulator(),
      startedAt,
      lastFrameTimeMs: Date.now(),
      firstFrame,
      kind: kindFor(firstFrame),
    };
    this.state = 'recording';

    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify(
        this.buildManifest(
          this.active,
          'recording',
          null,
          'telemetry.jsonl',
          false,
          emptyStats(),
          null,
        ),
        null,
        2,
      ),
    );
    this.logger.info(`session ${id} started (${this.active.kind})`);
  }

  private async checkTimeout(now = Date.now()): Promise<void> {
    if (this.state !== 'recording' || !this.active) return;
    if (now - this.active.lastFrameTimeMs >= this.config.sessionTimeoutMs) {
      await this.finalize('timeout');
    }
  }

  /** Test hook: drive the inactivity check with an explicit clock. */
  checkTimeoutAt(now: number): Promise<void> {
    return this.checkTimeout(now);
  }

  /** Detach the active session from the manager and finalize it. */
  private async finalize(reason: SessionEndReason): Promise<void> {
    const active = this.active;
    if (!active || this.state !== 'recording') return;
    this.state = 'idle';
    this.active = null;
    await this.finalizeOne(active, reason);
  }

  /**
   * Finalize a specific session object — closes its writer, optionally gzips,
   * writes stats and the final manifest. Takes the session by argument so
   * `rollSession` can finalize the old session in the background while a new
   * one is already accepting frames.
   */
  private async finalizeOne(active: ActiveSession, reason: SessionEndReason): Promise<void> {
    try {
      await active.writer.close();
    } catch (err) {
      this.logger.error({ err }, `failed to close writer for session ${active.id}`);
    }

    let compressed = false;
    let dataFile = 'telemetry.jsonl';
    if (this.config.compressFinishedSessions && reason !== 'shutdown') {
      try {
        await gzipFile(
          path.join(active.dir, 'telemetry.jsonl'),
          path.join(active.dir, 'telemetry.jsonl.gz'),
        );
        await fsp.rm(path.join(active.dir, 'telemetry.jsonl'));
        compressed = true;
        dataFile = 'telemetry.jsonl.gz';
      } catch (err) {
        this.logger.error({ err }, `failed to compress session ${active.id}`);
      }
    }

    const stats = active.stats.snapshot();
    fs.writeFileSync(path.join(active.dir, 'stats.json'), JSON.stringify(stats, null, 2));

    const manifest = this.buildManifest(
      active,
      'completed',
      reason,
      dataFile,
      compressed,
      stats,
      new Date(),
    );
    fs.writeFileSync(path.join(active.dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    this.logger.info(`session ${active.id} finalized (${reason}, ${manifest.frameCount} frames)`);
  }

  /** Manually end the current session. The next incoming frame starts a fresh one. */
  async cut(): Promise<string | null> {
    if (this.state !== 'recording' || !this.active) return null;
    const old = this.active;
    this.state = 'idle';
    this.active = null;
    await this.pendingFinalize;
    await this.finalizeOne(old, 'cut');
    return old.id;
  }

  private buildManifest(
    active: ActiveSession,
    status: SessionStatus,
    endReason: SessionEndReason,
    dataFile: string,
    compressed: boolean,
    stats: SessionStats,
    endedAt: Date | null,
  ): SessionManifest {
    const f = active.firstFrame;
    return {
      id: active.id,
      schemaVersion: SESSION_SCHEMA_VERSION,
      status,
      endReason,
      kind: active.kind,
      createdBy: 'fh6-telemetry-dashboard',
      startedAt: active.startedAt.toISOString(),
      endedAt: endedAt ? endedAt.toISOString() : null,
      durationMs: endedAt ? endedAt.getTime() - active.startedAt.getTime() : 0,
      frameCount: active.writer.lineCount,
      droppedFrames: active.writer.dropped,
      dataFile,
      compressed,
      car: {
        ordinal: f.carOrdinal,
        class: f.carClass,
        performanceIndex: f.carPerformanceIndex,
        drivetrain: f.drivetrainType,
        cylinders: f.numCylinders,
      },
      stats,
    };
  }

  getStatus(): RecordingStatus {
    return {
      active: this.state === 'recording',
      sessionId: this.active?.id ?? null,
      frameCount: this.active?.writer.lineCount ?? 0,
      droppedFrames: this.active?.writer.dropped ?? 0,
      error: this.recordingError,
    };
  }

  /** Finalize cleanly on shutdown — skips gzip to stay within the stop grace. */
  async shutdown(): Promise<void> {
    if (this.timeoutTimer) {
      clearInterval(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.state === 'recording') {
      await this.finalize('shutdown');
    }
    // Wait for any background finalizations queued by rollSession().
    await this.pendingFinalize;
  }
}

/**
 * Repair sessions left in `recording` state by a hard shutdown: recompute
 * stats by streaming the JSONL, then rewrite the manifest as completed.
 */
export async function recoverInterruptedSessions(config: Config, logger: Logger): Promise<void> {
  let ids: string[];
  try {
    ids = await fsp.readdir(config.sessionsDir);
  } catch {
    return;
  }

  for (const id of ids) {
    const dir = path.join(config.sessionsDir, id);
    const manifestPath = path.join(dir, 'manifest.json');
    let manifest: SessionManifest;
    try {
      manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8')) as SessionManifest;
    } catch {
      continue;
    }
    if (manifest.status !== 'recording') continue;

    logger.warn(`recovering interrupted session ${id}`);
    const dataPath = path.join(dir, manifest.compressed ? 'telemetry.jsonl.gz' : 'telemetry.jsonl');
    const stats = new StatsAccumulator();
    let frameCount = 0;
    let firstRecvTime = 0;
    let lastRecvTime = 0;

    try {
      await streamTelemetryFile(dataPath, manifest.compressed, (frame) => {
        stats.update(frame);
        frameCount += 1;
        if (firstRecvTime === 0) firstRecvTime = frame.recvTime;
        lastRecvTime = frame.recvTime;
      });
    } catch (err) {
      logger.error({ err }, `failed to recover session ${id}`);
      continue;
    }

    const snapshot = stats.snapshot();
    fs.writeFileSync(path.join(dir, 'stats.json'), JSON.stringify(snapshot, null, 2));

    const recovered: SessionManifest = {
      ...manifest,
      status: 'completed',
      endReason: 'recovered',
      endedAt: lastRecvTime ? new Date(lastRecvTime).toISOString() : manifest.startedAt,
      durationMs: lastRecvTime && firstRecvTime ? lastRecvTime - firstRecvTime : 0,
      frameCount,
      stats: snapshot,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(recovered, null, 2));
    logger.info(`recovered session ${id} (${frameCount} frames)`);
  }
}
