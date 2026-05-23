import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../logger';
import type { SessionManifest, SessionSummary } from '../../../shared/session';

const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

function toSummary(m: SessionManifest): SessionSummary {
  return {
    id: m.id,
    status: m.status,
    kind: m.kind, // undefined in v1 manifests — client treats that as free-roam
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    durationMs: m.durationMs,
    frameCount: m.frameCount,
    topSpeed: m.stats.topSpeed,
    maxRpm: m.stats.maxRpm,
    distanceMeters: m.stats.distanceMeters,
    car: m.car,
  };
}

/** Filesystem CRUD over recorded sessions under the data volume. */
export class SessionStore {
  constructor(
    private readonly sessionsDir: string,
    private readonly logger: Logger,
  ) {}

  /** Guard against path traversal — session ids are alphanumeric + dashes. */
  isValidId(id: string): boolean {
    return SESSION_ID_RE.test(id) && id.length <= 64;
  }

  sessionDir(id: string): string {
    return path.join(this.sessionsDir, id);
  }

  async list(limit: number): Promise<SessionSummary[]> {
    let entries: string[];
    try {
      entries = await fsp.readdir(this.sessionsDir);
    } catch {
      return [];
    }
    const summaries: SessionSummary[] = [];
    for (const id of entries) {
      if (!this.isValidId(id)) continue;
      const manifest = await this.readManifest(id);
      if (manifest) summaries.push(toSummary(manifest));
    }
    summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return summaries.slice(0, limit);
  }

  async getManifest(id: string): Promise<SessionManifest | null> {
    if (!this.isValidId(id)) return null;
    return this.readManifest(id);
  }

  private async readManifest(id: string): Promise<SessionManifest | null> {
    try {
      const raw = await fsp.readFile(path.join(this.sessionsDir, id, 'manifest.json'), 'utf8');
      return JSON.parse(raw) as SessionManifest;
    } catch (err) {
      this.logger.warn(`skipping unreadable session "${id}": ${(err as Error).message}`);
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    if (!this.isValidId(id)) return false;
    const dir = this.sessionDir(id);
    try {
      await fsp.access(dir);
    } catch {
      return false;
    }
    await fsp.rm(dir, { recursive: true, force: true });
    this.logger.info(`deleted session ${id}`);
    return true;
  }
}
