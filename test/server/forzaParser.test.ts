import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { Fh6ParseError, parseFrame, validateFrame } from '../../src/server/telemetry/forzaParser';
import { MIN_PACKET_BYTES, PACKET_FIELDS } from '../../src/server/telemetry/offsets';
import type { TelemetryFrame } from '../../shared/telemetry';
import { buildPacket, sentinelValues } from '../fixtures/buildPacket';

describe('parseFrame', () => {
  it('round-trips every field in the offset table', () => {
    const values = sentinelValues(true);
    const buf = buildPacket(values, { includeTireWear: true });
    const frame = parseFrame(buf, 1234);

    expect(frame.recvTime).toBe(1234);
    for (const field of PACKET_FIELDS) {
      const expected = field.type === 'f32' ? Math.fround(values[field.name]) : values[field.name];
      expect((frame as unknown as Record<string, number>)[field.name]).toBe(expected);
    }
  });

  it('rejects a buffer shorter than the minimum length', () => {
    const tooShort = Buffer.alloc(MIN_PACKET_BYTES - 1);
    expect(() => parseFrame(tooShort)).toThrow(Fh6ParseError);
  });

  it('parses a minimum-length packet with tyre wear left undefined', () => {
    const buf = buildPacket({}, { length: MIN_PACKET_BYTES });
    const frame = parseFrame(buf);
    expect(frame.tireWearFl).toBeUndefined();
    expect(frame.tireWearRr).toBeUndefined();
    expect(frame.speed).toBe(0);
  });

  it('parses the optional tyre-wear block on a longer packet', () => {
    const buf = buildPacket(
      { tireWearFl: 0.5, tireWearFr: 0.25, tireWearRl: 0.75, tireWearRr: 1 },
      { includeTireWear: true },
    );
    const frame = parseFrame(buf);
    expect(frame.tireWearFl).toBe(0.5);
    expect(frame.tireWearFr).toBe(0.25);
    expect(frame.tireWearRl).toBe(0.75);
    expect(frame.tireWearRr).toBe(1);
  });

  it('leaves tyre wear undefined on a canonical 324-byte packet', () => {
    const buf = buildPacket();
    expect(buf.length).toBe(324);
    const frame = parseFrame(buf);
    expect(frame.tireWearFl).toBeUndefined();
  });

  it('decodes little-endian signed values (reverse gear, left steer)', () => {
    const buf = buildPacket({ gear: -1, steer: -100, isRaceOn: 1 });
    const frame = parseFrame(buf);
    expect(frame.gear).toBe(-1);
    expect(frame.steer).toBe(-100);
    expect(frame.isRaceOn).toBe(1);
  });

  it('tolerates an oversized packet', () => {
    const buf = buildPacket({ speed: 42 }, { length: 360, includeTireWear: true });
    const frame = parseFrame(buf);
    expect(frame.speed).toBe(42);
  });
});

describe('validateFrame', () => {
  const plausible = (): TelemetryFrame =>
    parseFrame(
      buildPacket({
        isRaceOn: 1,
        engineMaxRpm: 8000,
        currentEngineRpm: 5000,
        speed: 40,
        gear: 3,
        accelerator: 200,
        brake: 0,
        steer: 10,
        fuel: 0.5,
      }),
    );

  it('accepts a plausible frame', () => {
    expect(validateFrame(plausible()).ok).toBe(true);
  });

  it('flags an implausible speed', () => {
    const frame = plausible();
    frame.speed = 9999;
    const result = validateFrame(frame);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes('speed'))).toBe(true);
  });

  it('flags RPM exceeding the engine maximum', () => {
    const frame = plausible();
    frame.currentEngineRpm = 12000;
    expect(validateFrame(frame).ok).toBe(false);
  });
});

// Offset-verification gate: assert a REAL captured FH6 packet decodes to
// plausible values. Capture one with `npm run capture`, which writes
// test/fixtures/packet.bin, then implement this test.
describe.todo('real captured FH6 packet (test/fixtures/packet.bin)');
