import type { TelemetryFrame } from '../../../shared/telemetry';
import { FIELD_SIZE, MIN_PACKET_BYTES, PACKET_FIELDS, type FieldType } from './offsets';

/** Thrown when a buffer is too short to be a plausible FH6 packet. */
export class Fh6ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Fh6ParseError';
  }
}

function readField(buf: Buffer, type: FieldType, offset: number): number {
  switch (type) {
    case 's32':
      return buf.readInt32LE(offset);
    case 'u32':
      return buf.readUInt32LE(offset);
    case 'f32':
      return buf.readFloatLE(offset);
    case 'u16':
      return buf.readUInt16LE(offset);
    case 'u8':
      return buf.readUInt8(offset);
    case 's8':
      return buf.readInt8(offset);
  }
}

/**
 * Parse a raw FH6 Data Out UDP datagram into a normalized telemetry frame.
 *
 * Length-tolerant by design: rejects only buffers shorter than
 * MIN_PACKET_BYTES, and reads optional trailing fields only when present.
 * `recvTime` is stamped by the caller, not derived from the packet.
 */
export function parseFrame(buf: Buffer, recvTime: number = Date.now()): TelemetryFrame {
  if (buf.length < MIN_PACKET_BYTES) {
    throw new Fh6ParseError(
      `invalid packet length: got ${buf.length} bytes, need >= ${MIN_PACKET_BYTES}`,
    );
  }

  const out: Record<string, number> = { recvTime };

  for (const field of PACKET_FIELDS) {
    const end = field.offset + FIELD_SIZE[field.type];
    if (end > buf.length) {
      // Required fields are always within a >= MIN_PACKET_BYTES buffer;
      // only optional trailing fields legitimately fall off the end.
      if (field.optional) continue;
      throw new Fh6ParseError(
        `field "${field.name}" at offset ${field.offset} exceeds packet length ${buf.length}`,
      );
    }
    out[field.name] = readField(buf, field.type, field.offset);
  }

  return out as unknown as TelemetryFrame;
}

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

/**
 * Diagnostic plausibility check — used by the capture tool to flag a wrong
 * offset table. NEVER used to reject packets at runtime.
 */
export function validateFrame(frame: TelemetryFrame): ValidationResult {
  const issues: string[] = [];

  const inRange = (name: string, value: number, min: number, max: number) => {
    if (!Number.isFinite(value) || value < min || value > max) {
      issues.push(`${name}=${value} outside expected [${min}, ${max}]`);
    }
  };

  inRange('isRaceOn', frame.isRaceOn, 0, 1);
  inRange('engineMaxRpm', frame.engineMaxRpm, 0, 20000);
  inRange('currentEngineRpm', frame.currentEngineRpm, 0, 20000);
  inRange('speed', frame.speed, 0, 200);
  inRange('gear', frame.gear, -1, 11);
  inRange('accelerator', frame.accelerator, 0, 255);
  inRange('brake', frame.brake, 0, 255);
  inRange('steer', frame.steer, -128, 127);
  inRange('fuel', frame.fuel, 0, 1);
  if (frame.currentEngineRpm > frame.engineMaxRpm + 500) {
    issues.push(
      `currentEngineRpm=${frame.currentEngineRpm} exceeds engineMaxRpm=${frame.engineMaxRpm}`,
    );
  }

  return { ok: issues.length === 0, issues };
}
