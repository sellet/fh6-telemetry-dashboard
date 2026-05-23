import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SessionManager,
  recoverInterruptedSessions,
} from '../../src/server/session/sessionManager';
import { TelemetryBus } from '../../src/server/core/telemetryBus';
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

function makeConfig(): Config {
  return {
    sessionsDir: path.join(tmpDir, 'sessions'),
    sessionTimeoutMs: 5000,
    compressFinishedSessions: false,
  } as unknown as Config;
}

function emit(bus: TelemetryBus, values: Record<string, number>, recvTime?: number): void {
  bus.emitFrame(parseFrame(buildPacket(values), recvTime));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh6-session-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function readManifest(dir: string): SessionManifest {
  return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as SessionManifest;
}

describe('SessionManager', () => {
  it('records a race session and finalizes it after the inactivity timeout', async () => {
    const config = makeConfig();
    const bus = new TelemetryBus();
    const manager = new SessionManager(config, silentLogger, bus);
    manager.start();

    for (let i = 0; i < 5; i += 1) {
      emit(bus, { isRaceOn: 1, speed: 10 + i, currentEngineRpm: 5000 });
    }
    expect(manager.getStatus().active).toBe(true);

    await manager.checkTimeoutAt(Date.now() + 10_000);
    await manager.shutdown();

    const sessions = fs.readdirSync(config.sessionsDir);
    expect(sessions).toHaveLength(1);

    const dir = path.join(config.sessionsDir, sessions[0]);
    const manifest = readManifest(dir);
    expect(manifest.status).toBe('completed');
    expect(manifest.endReason).toBe('timeout');
    expect(manifest.kind).toBe('race');
    expect(manifest.frameCount).toBe(5);

    const lines = fs.readFileSync(path.join(dir, 'telemetry.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(5);
    expect(fs.existsSync(path.join(dir, 'stats.json'))).toBe(true);
    expect(manager.getStatus().active).toBe(false);
  });

  it('starts a free-roam session on the very first frame, regardless of isRaceOn', async () => {
    const config = makeConfig();
    const bus = new TelemetryBus();
    const manager = new SessionManager(config, silentLogger, bus);
    manager.start();

    emit(bus, { isRaceOn: 0, speed: 5 });
    emit(bus, { isRaceOn: 0, speed: 6 });
    expect(manager.getStatus().active).toBe(true);

    await manager.shutdown();

    const dir = path.join(config.sessionsDir, fs.readdirSync(config.sessionsDir)[0]);
    const manifest = readManifest(dir);
    expect(manifest.kind).toBe('free-roam');
    expect(manifest.frameCount).toBe(2);
  });

  it('finalizes the active session on shutdown', async () => {
    const config = makeConfig();
    const bus = new TelemetryBus();
    const manager = new SessionManager(config, silentLogger, bus);
    manager.start();

    emit(bus, { isRaceOn: 1, speed: 30 });
    await manager.shutdown();

    const dir = path.join(config.sessionsDir, fs.readdirSync(config.sessionsDir)[0]);
    const manifest = readManifest(dir);
    expect(manifest.status).toBe('completed');
    expect(manifest.endReason).toBe('shutdown');
    expect(manifest.kind).toBe('race');
  });

  it('splits the session when isRaceOn flips 0 → 1 (race-start)', async () => {
    const config = makeConfig();
    const bus = new TelemetryBus();
    const manager = new SessionManager(config, silentLogger, bus);
    manager.start();

    emit(bus, { isRaceOn: 0, speed: 5 });
    emit(bus, { isRaceOn: 0, speed: 6 });
    emit(bus, { isRaceOn: 1, speed: 50 }); // boundary frame — starts new session
    emit(bus, { isRaceOn: 1, speed: 60 });
    await manager.shutdown();

    const sessions = fs.readdirSync(config.sessionsDir).sort();
    expect(sessions).toHaveLength(2);

    const manifests = sessions.map((id) => readManifest(path.join(config.sessionsDir, id)));
    const freeRoam = manifests.find((m) => m.kind === 'free-roam');
    const race = manifests.find((m) => m.kind === 'race');
    expect(freeRoam).toBeDefined();
    expect(race).toBeDefined();
    expect(freeRoam?.endReason).toBe('race-start');
    expect(freeRoam?.frameCount).toBe(2);
    expect(race?.frameCount).toBe(2);
  });

  it('splits the session when isRaceOn flips 1 → 0 (race-end)', async () => {
    const config = makeConfig();
    const bus = new TelemetryBus();
    const manager = new SessionManager(config, silentLogger, bus);
    manager.start();

    emit(bus, { isRaceOn: 1, speed: 50 });
    emit(bus, { isRaceOn: 1, speed: 60 });
    emit(bus, { isRaceOn: 0, speed: 10 });
    await manager.shutdown();

    const sessions = fs.readdirSync(config.sessionsDir);
    expect(sessions).toHaveLength(2);

    const manifests = sessions.map((id) => readManifest(path.join(config.sessionsDir, id)));
    const race = manifests.find((m) => m.kind === 'race');
    const freeRoam = manifests.find((m) => m.kind === 'free-roam');
    expect(race?.endReason).toBe('race-end');
    expect(freeRoam?.endReason).toBe('shutdown');
  });

  it('splits the session when carOrdinal changes', async () => {
    const config = makeConfig();
    const bus = new TelemetryBus();
    const manager = new SessionManager(config, silentLogger, bus);
    manager.start();

    emit(bus, { isRaceOn: 1, carOrdinal: 100, speed: 50 });
    emit(bus, { isRaceOn: 1, carOrdinal: 100, speed: 60 });
    emit(bus, { isRaceOn: 1, carOrdinal: 200, speed: 70 });
    await manager.shutdown();

    const sessions = fs.readdirSync(config.sessionsDir);
    expect(sessions).toHaveLength(2);

    const manifests = sessions
      .map((id) => readManifest(path.join(config.sessionsDir, id)))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    expect(manifests[0].endReason).toBe('car-change');
    expect(manifests[0].car.ordinal).toBe(100);
    expect(manifests[1].car.ordinal).toBe(200);
  });

  it('cut() finalizes the active session and lets the next frame start a fresh one', async () => {
    const config = makeConfig();
    const bus = new TelemetryBus();
    const manager = new SessionManager(config, silentLogger, bus);
    manager.start();

    emit(bus, { isRaceOn: 1, speed: 50 });
    emit(bus, { isRaceOn: 1, speed: 55 });
    const cutId = await manager.cut();
    expect(cutId).toBeTruthy();
    expect(manager.getStatus().active).toBe(false);

    emit(bus, { isRaceOn: 1, speed: 60 });
    expect(manager.getStatus().active).toBe(true);
    await manager.shutdown();

    const sessions = fs.readdirSync(config.sessionsDir);
    expect(sessions).toHaveLength(2);

    const cutManifest = readManifest(path.join(config.sessionsDir, cutId as string));
    expect(cutManifest.endReason).toBe('cut');
    expect(cutManifest.frameCount).toBe(2);
  });
});

describe('recoverInterruptedSessions', () => {
  it('repairs a session left in the recording state', async () => {
    const config = makeConfig();
    const id = '20260522-120000-test';
    const dir = path.join(config.sessionsDir, id);
    fs.mkdirSync(dir, { recursive: true });

    const lines: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      lines.push(
        JSON.stringify(parseFrame(buildPacket({ isRaceOn: 1, speed: i * 10 }), 1000 + i * 100)),
      );
    }
    fs.writeFileSync(path.join(dir, 'telemetry.jsonl'), lines.join('\n') + '\n');

    const interrupted: SessionManifest = {
      id,
      schemaVersion: SESSION_SCHEMA_VERSION,
      status: 'recording',
      endReason: null,
      createdBy: 'fh6-telemetry-dashboard',
      startedAt: new Date(1000).toISOString(),
      endedAt: null,
      durationMs: 0,
      frameCount: 0,
      droppedFrames: 0,
      dataFile: 'telemetry.jsonl',
      compressed: false,
      car: { ordinal: 0, class: 0, performanceIndex: 0, drivetrain: 0, cylinders: 0 },
      stats: emptyStats(),
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(interrupted));

    await recoverInterruptedSessions(config, silentLogger);

    const recovered = JSON.parse(
      fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'),
    ) as SessionManifest;
    expect(recovered.status).toBe('completed');
    expect(recovered.endReason).toBe('recovered');
    expect(recovered.frameCount).toBe(4);
    expect(recovered.durationMs).toBe(300);
    expect(fs.existsSync(path.join(dir, 'stats.json'))).toBe(true);
  });
});
