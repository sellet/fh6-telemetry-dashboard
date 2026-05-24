import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore } from '../../src/server/session/sessionStore';
import type { Logger } from '../../src/server/logger';
import {
  SESSION_NOTES_MAX_LENGTH,
  SESSION_NOTES_PREVIEW_LENGTH,
  SESSION_SCHEMA_VERSION,
  SESSION_TAG_MAX_LENGTH,
  emptyStats,
  type SessionManifest,
} from '../../shared/session';

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh6-store-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeManifest(id: string, overrides: Partial<SessionManifest> = {}): void {
  const dir = path.join(tmpDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const manifest: SessionManifest = {
    id,
    schemaVersion: SESSION_SCHEMA_VERSION,
    status: 'completed',
    endReason: 'shutdown',
    kind: 'free-roam',
    createdBy: 'test',
    startedAt: new Date(1000).toISOString(),
    endedAt: new Date(2000).toISOString(),
    durationMs: 1000,
    frameCount: 1,
    droppedFrames: 0,
    dataFile: 'telemetry.jsonl',
    compressed: false,
    car: { ordinal: 1, class: 0, performanceIndex: 0, drivetrain: 0, cylinders: 0 },
    stats: emptyStats(),
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
}

describe('SessionStore.updateMeta', () => {
  it('normalises tags (trim, lowercase, dedupe, cap, length)', async () => {
    writeManifest('s1');
    const store = new SessionStore(tmpDir, silentLogger);
    const longTag = 'x'.repeat(SESSION_TAG_MAX_LENGTH + 10);
    const many = Array.from({ length: 30 }, (_, i) => `Tag ${i}`);

    const updated = await store.updateMeta('s1', {
      tags: ['  Baja ', 'baja', 'Sunset', 'sunset', '', '   ', longTag, ...many],
    });

    expect(updated).not.toBeNull();
    const tags = updated!.tags!;
    expect(tags).toContain('baja');
    expect(tags).toContain('sunset');
    expect(tags.filter((t) => t === 'baja')).toHaveLength(1);
    expect(tags.length).toBeLessThanOrEqual(16);
    expect(tags.every((t) => t.length <= SESSION_TAG_MAX_LENGTH)).toBe(true);
    expect(tags.every((t) => t === t.toLowerCase())).toBe(true);
  });

  it('trims and caps notes; an empty string clears them', async () => {
    writeManifest('s1');
    const store = new SessionStore(tmpDir, silentLogger);

    const long = 'a'.repeat(SESSION_NOTES_MAX_LENGTH + 50);
    const withNotes = await store.updateMeta('s1', { notes: `  ${long}  ` });
    expect(withNotes!.notes!.length).toBe(SESSION_NOTES_MAX_LENGTH);

    const cleared = await store.updateMeta('s1', { notes: '   ' });
    expect(cleared!.notes).toBeUndefined();
  });

  it('preserves untouched fields when patching just one', async () => {
    writeManifest('s1', { name: 'Original', tags: ['keep'], notes: 'keep notes' });
    const store = new SessionStore(tmpDir, silentLogger);

    const updated = await store.updateMeta('s1', { name: 'Renamed' });
    expect(updated!.name).toBe('Renamed');
    expect(updated!.tags).toEqual(['keep']);
    expect(updated!.notes).toBe('keep notes');
  });

  it('rename() remains a backwards-compatible wrapper', async () => {
    writeManifest('s1');
    const store = new SessionStore(tmpDir, silentLogger);
    const updated = await store.rename('s1', '  My run  ');
    expect(updated!.name).toBe('My run');
  });

  it('returns null for missing sessions', async () => {
    const store = new SessionStore(tmpDir, silentLogger);
    const result = await store.updateMeta('nope', { name: 'x' });
    expect(result).toBeNull();
  });
});

describe('SessionStore.list summary projection', () => {
  it('truncates the notes preview and reports hasIdleRanges', async () => {
    writeManifest('s1', {
      notes: 'n'.repeat(SESSION_NOTES_PREVIEW_LENGTH + 50),
      idleRangesMs: [[0, 5000]],
    });
    const store = new SessionStore(tmpDir, silentLogger);
    const summaries = await store.list(50);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].notes!.length).toBe(SESSION_NOTES_PREVIEW_LENGTH);
    expect(summaries[0].hasIdleRanges).toBe(true);
  });
});

describe('SessionStore.storage', () => {
  it('sums telemetry-file sizes and reports kind breakdown', async () => {
    writeManifest('a', { kind: 'free-roam' });
    fs.writeFileSync(path.join(tmpDir, 'a', 'telemetry.jsonl'), 'x'.repeat(100));
    writeManifest('b', { kind: 'race' });
    fs.writeFileSync(path.join(tmpDir, 'b', 'telemetry.jsonl.gz'), Buffer.alloc(250));

    const store = new SessionStore(tmpDir, silentLogger);
    const info = await store.storage();
    expect(info.sessionCount).toBe(2);
    expect(info.totalBytes).toBe(350);
    expect(info.byKind).toEqual({ race: 1, freeRoam: 1 });
    expect(info.largest[0].id).toBe('b');
  });
});
