import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mergeSessions } from '../../src/server/session/mergeSessions';
import { SessionStore } from '../../src/server/session/sessionStore';
import { parseFrame } from '../../src/server/telemetry/forzaParser';
import { buildPacket } from '../fixtures/buildPacket';
import type { Config } from '../../src/server/config';
import type { Logger } from '../../src/server/logger';
import { SESSION_SCHEMA_VERSION, emptyStats, type SessionManifest } from '../../shared/session';

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

let tmpDir: string;
let config: Config;
let store: SessionStore;

function makeConfig(): Config {
  return {
    sessionsDir: path.join(tmpDir, 'sessions'),
  } as unknown as Config;
}

function writeSession(opts: {
  id: string;
  startedAtMs: number;
  frameCount: number;
  framesEvery?: number;
  carOrdinal?: number;
  kind?: 'race' | 'free-roam';
  speedBase?: number;
}): void {
  const dir = path.join(config.sessionsDir, opts.id);
  fs.mkdirSync(dir, { recursive: true });

  const step = opts.framesEvery ?? 16;
  const lines: string[] = [];
  for (let i = 0; i < opts.frameCount; i += 1) {
    const speed = (opts.speedBase ?? 0) + i;
    lines.push(
      JSON.stringify(
        parseFrame(
          buildPacket({ isRaceOn: 1, speed, carOrdinal: opts.carOrdinal ?? 100 }),
          opts.startedAtMs + i * step,
        ),
      ),
    );
  }
  fs.writeFileSync(path.join(dir, 'telemetry.jsonl'), lines.join('\n') + '\n');

  const manifest: SessionManifest = {
    id: opts.id,
    schemaVersion: SESSION_SCHEMA_VERSION,
    status: 'completed',
    endReason: 'timeout',
    kind: opts.kind ?? 'free-roam',
    createdBy: 'fh6-telemetry-dashboard',
    startedAt: new Date(opts.startedAtMs).toISOString(),
    endedAt: new Date(opts.startedAtMs + opts.frameCount * step).toISOString(),
    durationMs: opts.frameCount * step,
    frameCount: opts.frameCount,
    droppedFrames: 0,
    dataFile: 'telemetry.jsonl',
    compressed: false,
    car: {
      ordinal: opts.carOrdinal ?? 100,
      class: 0,
      performanceIndex: 0,
      drivetrain: 0,
      cylinders: 0,
    },
    stats: emptyStats(),
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh6-merge-'));
  config = makeConfig();
  fs.mkdirSync(config.sessionsDir, { recursive: true });
  store = new SessionStore(config.sessionsDir, silentLogger);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('mergeSessions', () => {
  it('concatenates two sessions in chronological order and deletes the sources', async () => {
    writeSession({ id: 'a', startedAtMs: 1000, frameCount: 3, speedBase: 0 });
    writeSession({ id: 'b', startedAtMs: 5000, frameCount: 4, speedBase: 100 });

    const merged = await mergeSessions(config, store, silentLogger, ['b', 'a'], {
      name: 'My merged run',
    });

    expect(merged.frameCount).toBe(7);
    expect(merged.endReason).toBe('merged');
    expect(merged.name).toBe('My merged run');

    // Sources gone, merged present
    const remaining = fs.readdirSync(config.sessionsDir).sort();
    expect(remaining).toEqual([merged.id]);

    // Lines are in time order: speeds 0..2 then 100..103
    const lines = fs
      .readFileSync(path.join(config.sessionsDir, merged.id, 'telemetry.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { speed: number; recvTime: number });
    expect(lines.map((l) => l.speed)).toEqual([0, 1, 2, 100, 101, 102, 103]);
    for (let i = 1; i < lines.length; i += 1) {
      expect(lines[i].recvTime).toBeGreaterThanOrEqual(lines[i - 1].recvTime);
    }
    expect(fs.existsSync(path.join(config.sessionsDir, merged.id, 'stats.json'))).toBe(true);
  });

  it('marks the merged session as race if any source was a race', async () => {
    writeSession({ id: 'a', startedAtMs: 1000, frameCount: 2, kind: 'free-roam' });
    writeSession({ id: 'b', startedAtMs: 2000, frameCount: 2, kind: 'race' });

    const merged = await mergeSessions(config, store, silentLogger, ['a', 'b']);
    expect(merged.kind).toBe('race');
  });

  it('rejects merging fewer than two sessions', async () => {
    writeSession({ id: 'a', startedAtMs: 1000, frameCount: 1 });
    await expect(mergeSessions(config, store, silentLogger, ['a'])).rejects.toThrow();
  });

  it('rejects merging an unknown session', async () => {
    writeSession({ id: 'a', startedAtMs: 1000, frameCount: 1 });
    await expect(mergeSessions(config, store, silentLogger, ['a', 'ghost'])).rejects.toThrow(
      /not found/,
    );
  });
});
