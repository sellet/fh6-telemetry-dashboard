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

describe('SessionManager', () => {
  it('records a session and finalizes it after the inactivity timeout', async () => {
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
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'),
    ) as SessionManifest;
    expect(manifest.status).toBe('completed');
    expect(manifest.endReason).toBe('timeout');
    expect(manifest.frameCount).toBe(5);

    const lines = fs.readFileSync(path.join(dir, 'telemetry.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(5);
    expect(fs.existsSync(path.join(dir, 'stats.json'))).toBe(true);
    expect(manager.getStatus().active).toBe(false);
  });

  it('does not start a session for menu (isRaceOn=0) frames', async () => {
    const config = makeConfig();
    const bus = new TelemetryBus();
    const manager = new SessionManager(config, silentLogger, bus);
    manager.start();

    emit(bus, { isRaceOn: 0, speed: 0 });
    emit(bus, { isRaceOn: 0, speed: 0 });
    expect(manager.getStatus().active).toBe(false);

    await manager.shutdown();
    expect(fs.existsSync(config.sessionsDir)).toBe(false);
  });

  it('finalizes the active session on shutdown', async () => {
    const config = makeConfig();
    const bus = new TelemetryBus();
    const manager = new SessionManager(config, silentLogger, bus);
    manager.start();

    emit(bus, { isRaceOn: 1, speed: 30 });
    await manager.shutdown();

    const dir = path.join(config.sessionsDir, fs.readdirSync(config.sessionsDir)[0]);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'),
    ) as SessionManifest;
    expect(manifest.status).toBe('completed');
    expect(manifest.endReason).toBe('shutdown');
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
