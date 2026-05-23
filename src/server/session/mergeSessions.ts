import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config';
import type { Logger } from '../logger';
import {
  SESSION_NAME_MAX_LENGTH,
  SESSION_SCHEMA_VERSION,
  type SessionKind,
  type SessionManifest,
} from '../../../shared/session';
import { SessionStore } from './sessionStore';
import { StatsAccumulator } from './statsAccumulator';
import { formatSessionId, streamTelemetryFile } from './sessionManager';

export interface MergeOptions {
  name?: string;
}

/**
 * Merge several recorded sessions into a single new session by concatenating
 * their telemetry streams in chronological order. The source sessions are
 * deleted once the merged session is committed to disk.
 *
 * Throws if any id is unknown, if any source is still recording, or if fewer
 * than two valid sources are supplied.
 */
export async function mergeSessions(
  config: Config,
  store: SessionStore,
  logger: Logger,
  ids: string[],
  options: MergeOptions = {},
): Promise<SessionManifest> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length < 2) {
    throw new Error('merge requires at least two distinct session ids');
  }

  const sources: SessionManifest[] = [];
  for (const id of uniqueIds) {
    const manifest = await store.getManifest(id);
    if (!manifest) throw new Error(`session "${id}" not found`);
    if (manifest.status !== 'completed') {
      throw new Error(`session "${id}" is still ${manifest.status} — finish it before merging`);
    }
    sources.push(manifest);
  }

  sources.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  const newId = formatSessionId(new Date());
  const newDir = path.join(config.sessionsDir, newId);
  fs.mkdirSync(newDir, { recursive: true });
  const dataPath = path.join(newDir, 'telemetry.jsonl');
  const out = fs.createWriteStream(dataPath, { flags: 'w' });

  const stats = new StatsAccumulator();
  let frameCount = 0;
  let droppedFrames = 0;
  let firstRecvTime = 0;
  let lastRecvTime = 0;
  let anyRace = false;

  try {
    for (const src of sources) {
      anyRace = anyRace || src.kind === 'race';
      droppedFrames += src.droppedFrames;
      const srcDataPath = path.join(store.sessionDir(src.id), src.dataFile);
      await streamTelemetryFile(srcDataPath, src.compressed, (frame) => {
        stats.update(frame);
        out.write(JSON.stringify(frame) + '\n');
        frameCount += 1;
        if (firstRecvTime === 0) firstRecvTime = frame.recvTime;
        lastRecvTime = frame.recvTime;
      });
    }
  } finally {
    await new Promise<void>((resolve) => out.end(() => resolve()));
  }

  if (frameCount === 0) {
    await fsp.rm(newDir, { recursive: true, force: true });
    throw new Error('no telemetry frames could be merged from the selected sessions');
  }

  const snapshot = stats.snapshot();
  fs.writeFileSync(path.join(newDir, 'stats.json'), JSON.stringify(snapshot, null, 2));

  const first = sources[0];
  const last = sources[sources.length - 1];
  const startedAtIso = new Date(firstRecvTime || Date.parse(first.startedAt)).toISOString();
  const endedAtIso = new Date(
    lastRecvTime || Date.parse(last.endedAt ?? last.startedAt),
  ).toISOString();
  const trimmedName = options.name?.trim().slice(0, SESSION_NAME_MAX_LENGTH);

  const manifest: SessionManifest = {
    id: newId,
    schemaVersion: SESSION_SCHEMA_VERSION,
    status: 'completed',
    endReason: 'merged',
    kind: (anyRace ? 'race' : 'free-roam') as SessionKind,
    name: trimmedName && trimmedName.length > 0 ? trimmedName : undefined,
    createdBy: 'fh6-telemetry-dashboard',
    startedAt: startedAtIso,
    endedAt: endedAtIso,
    durationMs: Math.max(0, Date.parse(endedAtIso) - Date.parse(startedAtIso)),
    frameCount,
    droppedFrames,
    dataFile: 'telemetry.jsonl',
    compressed: false,
    car: first.car,
    stats: snapshot,
  };
  fs.writeFileSync(path.join(newDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  logger.info(`merged ${sources.length} sessions into ${newId} (${frameCount} frames)`);

  // Only delete sources after the merged session is fully committed.
  for (const src of sources) {
    await store.delete(src.id);
  }

  return manifest;
}
