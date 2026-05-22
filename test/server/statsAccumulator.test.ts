import { describe, expect, it } from 'vitest';
import { StatsAccumulator } from '../../src/server/session/statsAccumulator';
import { parseFrame } from '../../src/server/telemetry/forzaParser';
import { buildPacket } from '../fixtures/buildPacket';
import type { TelemetryFrame } from '../../shared/telemetry';

function frame(values: Record<string, number>): TelemetryFrame {
  return parseFrame(buildPacket(values));
}

describe('StatsAccumulator', () => {
  it('tracks top speed, max RPM and average speed', () => {
    const acc = new StatsAccumulator();
    acc.update(frame({ speed: 30, currentEngineRpm: 4000 }));
    acc.update(frame({ speed: 55, currentEngineRpm: 7000 }));
    acc.update(frame({ speed: 40, currentEngineRpm: 5000 }));

    const stats = acc.snapshot();
    expect(stats.topSpeed).toBe(55);
    expect(stats.maxRpm).toBe(7000);
    expect(stats.avgSpeed).toBeCloseTo((30 + 55 + 40) / 3);
    expect(acc.count).toBe(3);
  });

  it('counts distinct laps and keeps the fastest lap', () => {
    const acc = new StatsAccumulator();
    acc.update(frame({ lapNumber: 1, bestLap: 0 }));
    acc.update(frame({ lapNumber: 2, bestLap: 92.5 }));
    acc.update(frame({ lapNumber: 2, bestLap: 92.5 }));
    acc.update(frame({ lapNumber: 3, bestLap: 90 }));

    const stats = acc.snapshot();
    expect(stats.lapCount).toBe(3);
    expect(stats.bestLap).toBe(90);
  });

  it('takes the maximum of cumulative distance', () => {
    const acc = new StatsAccumulator();
    acc.update(frame({ distanceTraveled: 100 }));
    acc.update(frame({ distanceTraveled: 500 }));
    acc.update(frame({ distanceTraveled: 480 }));
    expect(acc.snapshot().distanceMeters).toBe(500);
  });

  it('returns empty stats when no frames were seen', () => {
    const stats = new StatsAccumulator().snapshot();
    expect(stats.topSpeed).toBe(0);
    expect(stats.avgSpeed).toBe(0);
    expect(stats.lapCount).toBe(0);
  });
});
