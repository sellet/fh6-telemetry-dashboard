import { Buffer } from 'node:buffer';
import {
  EXPECTED_PACKET_BYTES,
  FIELD_SIZE,
  PACKET_FIELDS,
  type FieldType,
} from '../../src/server/telemetry/offsets';

function writeField(buf: Buffer, type: FieldType, offset: number, value: number): void {
  switch (type) {
    case 's32':
      buf.writeInt32LE(value, offset);
      break;
    case 'u32':
      buf.writeUInt32LE(value, offset);
      break;
    case 'f32':
      buf.writeFloatLE(value, offset);
      break;
    case 'u16':
      buf.writeUInt16LE(value, offset);
      break;
    case 'u8':
      buf.writeUInt8(value, offset);
      break;
    case 's8':
      buf.writeInt8(value, offset);
      break;
  }
}

export interface BuildPacketOptions {
  /** Total buffer length. Defaults to EXPECTED_PACKET_BYTES (or 340 with wear). */
  length?: number;
  /** Include the optional trailing tyre-wear block. */
  includeTireWear?: boolean;
}

/**
 * Build a synthetic FH6 packet buffer from the offset table. Field values come
 * from `values`; any field not supplied is written as 0. Fields that fall
 * outside the buffer length are skipped.
 */
export function buildPacket(
  values: Record<string, number> = {},
  opts: BuildPacketOptions = {},
): Buffer {
  const includeTireWear = opts.includeTireWear ?? false;
  const length = opts.length ?? (includeTireWear ? 340 : EXPECTED_PACKET_BYTES);
  const buf = Buffer.alloc(length);

  for (const field of PACKET_FIELDS) {
    if (field.optional && !includeTireWear) continue;
    if (field.offset + FIELD_SIZE[field.type] > length) continue;
    writeField(buf, field.type, field.offset, values[field.name] ?? 0);
  }

  return buf;
}

/**
 * Generate a deterministic, type-appropriate value map covering every packet
 * field — used to assert the full offset table round-trips through the parser.
 */
export function sentinelValues(includeOptional = true): Record<string, number> {
  const values: Record<string, number> = {};
  PACKET_FIELDS.forEach((field, index) => {
    if (field.optional && !includeOptional) return;
    switch (field.type) {
      case 'f32':
        values[field.name] = index + 0.25;
        break;
      case 's32':
      case 'u32':
        values[field.name] = 100000 + index;
        break;
      case 'u16':
        values[field.name] = 1000 + index;
        break;
      case 'u8':
        values[field.name] = (index % 250) + 1;
        break;
      case 's8':
        values[field.name] = (index % 100) - 50;
        break;
    }
  });
  return values;
}
