import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../logger';
import {
  SESSION_NAME_MAX_LENGTH,
  SESSION_NOTES_PREVIEW_LENGTH,
  normaliseNotes,
  normaliseTags,
  type SessionKind,
  type SessionManifest,
  type SessionMetaPatch,
  type SessionSummary,
} from '../../../shared/session';

const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

export interface StorageEntry {
  id: string;
  bytes: number;
  kind: SessionKind;
}

export interface StorageInfo {
  totalBytes: number;
  sessionCount: number;
  byKind: { race: number; freeRoam: number };
  largest: Array<{ id: string; bytes: number }>;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function toSummary(m: SessionManifest): SessionSummary {
  const hasIdleRanges = Array.isArray(m.idleRangesMs) && m.idleRangesMs.length > 0;
  return {
    id: m.id,
    status: m.status,
    kind: m.kind, // undefined in v1 manifests — client treats that as free-roam
    name: m.name,
    tags: m.tags && m.tags.length > 0 ? m.tags : undefined,
    notes: m.notes ? truncate(m.notes, SESSION_NOTES_PREVIEW_LENGTH) : undefined,
    hasIdleRanges: hasIdleRanges || undefined,
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

  /**
   * Patch one or more metadata fields on a completed session. Each field is
   * normalised independently; an empty string / empty array clears the value.
   */
  async updateMeta(id: string, patch: SessionMetaPatch): Promise<SessionManifest | null> {
    const manifest = await this.getManifest(id);
    if (!manifest) return null;

    if (patch.name !== undefined) {
      const trimmed = patch.name.trim().slice(0, SESSION_NAME_MAX_LENGTH);
      manifest.name = trimmed.length > 0 ? trimmed : undefined;
    }
    if (patch.tags !== undefined) {
      const tags = normaliseTags(patch.tags);
      manifest.tags = tags.length > 0 ? tags : undefined;
    }
    if (patch.notes !== undefined) {
      const notes = normaliseNotes(patch.notes);
      manifest.notes = notes.length > 0 ? notes : undefined;
    }

    await fsp.writeFile(
      path.join(this.sessionDir(id), 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
    this.logger.info(`session ${id} metadata updated`);
    return manifest;
  }

  /** Backwards-compatible rename wrapper around {@link updateMeta}. */
  async rename(id: string, name: string): Promise<SessionManifest | null> {
    return this.updateMeta(id, { name });
  }

  /** Walk every session dir, summing the telemetry-file sizes. */
  async storage(): Promise<StorageInfo> {
    let entries: string[];
    try {
      entries = await fsp.readdir(this.sessionsDir);
    } catch {
      return { totalBytes: 0, sessionCount: 0, byKind: { race: 0, freeRoam: 0 }, largest: [] };
    }
    const items: StorageEntry[] = [];
    let totalBytes = 0;
    let race = 0;
    let freeRoam = 0;
    for (const id of entries) {
      if (!this.isValidId(id)) continue;
      const manifest = await this.readManifest(id);
      if (!manifest) continue;
      const dir = this.sessionDir(id);
      let bytes = 0;
      for (const name of ['telemetry.jsonl', 'telemetry.jsonl.gz']) {
        try {
          const stat = await fsp.stat(path.join(dir, name));
          bytes += stat.size;
        } catch {
          // file isn't present in this format — that's fine
        }
      }
      const kind: SessionKind = manifest.kind ?? 'free-roam';
      items.push({ id, bytes, kind });
      totalBytes += bytes;
      if (kind === 'race') race += 1;
      else freeRoam += 1;
    }
    items.sort((a, b) => b.bytes - a.bytes);
    return {
      totalBytes,
      sessionCount: items.length,
      byKind: { race, freeRoam },
      largest: items.slice(0, 10).map(({ id, bytes }) => ({ id, bytes })),
    };
  }
}
