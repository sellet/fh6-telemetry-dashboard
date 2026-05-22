/**
 * Forza Horizon 6 "Car Dash" packet field offset table.
 *
 * SINGLE SOURCE OF TRUTH for the parser, the synthetic packet builder and the
 * capture tool. Correcting an offset is a one-line change here.
 *
 * !!! UNVERIFIED !!!
 * These offsets were assembled from the official FH6 Data Out documentation
 * plus FH5 / Forza Motorsport community sources. The FH6-specific block
 * (carGroup / smashableVelDiff / smashableMass at 232-243) and the resulting
 * shift of positionX/Y/Z to 244+ are INFERRED and may be wrong.
 *
 * Validate against a real captured packet before trusting numeric values:
 *   npm run capture
 */

export type FieldType = 's32' | 'u32' | 'f32' | 'u16' | 'u8' | 's8';

export interface FieldDef {
  name: string;
  type: FieldType;
  offset: number;
  /** Optional trailing field — absent on shorter packets. */
  optional?: boolean;
}

export const FIELD_SIZE: Record<FieldType, number> = {
  s32: 4,
  u32: 4,
  f32: 4,
  u16: 2,
  u8: 1,
  s8: 1,
};

/** Minimum packet length we will attempt to parse. */
export const MIN_PACKET_BYTES = 323;
/** Canonical FH6 "Car Dash" packet length (without optional tyre wear). */
export const EXPECTED_PACKET_BYTES = 324;

export const PACKET_FIELDS: FieldDef[] = [
  { name: 'isRaceOn', type: 's32', offset: 0 },
  { name: 'timestampMs', type: 'u32', offset: 4 },

  { name: 'engineMaxRpm', type: 'f32', offset: 8 },
  { name: 'engineIdleRpm', type: 'f32', offset: 12 },
  { name: 'currentEngineRpm', type: 'f32', offset: 16 },

  { name: 'accelerationX', type: 'f32', offset: 20 },
  { name: 'accelerationY', type: 'f32', offset: 24 },
  { name: 'accelerationZ', type: 'f32', offset: 28 },

  { name: 'velocityX', type: 'f32', offset: 32 },
  { name: 'velocityY', type: 'f32', offset: 36 },
  { name: 'velocityZ', type: 'f32', offset: 40 },

  { name: 'angularVelocityX', type: 'f32', offset: 44 },
  { name: 'angularVelocityY', type: 'f32', offset: 48 },
  { name: 'angularVelocityZ', type: 'f32', offset: 52 },

  { name: 'yaw', type: 'f32', offset: 56 },
  { name: 'pitch', type: 'f32', offset: 60 },
  { name: 'roll', type: 'f32', offset: 64 },

  { name: 'normalizedSuspensionTravelFl', type: 'f32', offset: 68 },
  { name: 'normalizedSuspensionTravelFr', type: 'f32', offset: 72 },
  { name: 'normalizedSuspensionTravelRl', type: 'f32', offset: 76 },
  { name: 'normalizedSuspensionTravelRr', type: 'f32', offset: 80 },

  { name: 'tireSlipRatioFl', type: 'f32', offset: 84 },
  { name: 'tireSlipRatioFr', type: 'f32', offset: 88 },
  { name: 'tireSlipRatioRl', type: 'f32', offset: 92 },
  { name: 'tireSlipRatioRr', type: 'f32', offset: 96 },

  { name: 'wheelRotationSpeedFl', type: 'f32', offset: 100 },
  { name: 'wheelRotationSpeedFr', type: 'f32', offset: 104 },
  { name: 'wheelRotationSpeedRl', type: 'f32', offset: 108 },
  { name: 'wheelRotationSpeedRr', type: 'f32', offset: 112 },

  { name: 'wheelOnRumbleStripFl', type: 's32', offset: 116 },
  { name: 'wheelOnRumbleStripFr', type: 's32', offset: 120 },
  { name: 'wheelOnRumbleStripRl', type: 's32', offset: 124 },
  { name: 'wheelOnRumbleStripRr', type: 's32', offset: 128 },

  { name: 'wheelInPuddleDepthFl', type: 'f32', offset: 132 },
  { name: 'wheelInPuddleDepthFr', type: 'f32', offset: 136 },
  { name: 'wheelInPuddleDepthRl', type: 'f32', offset: 140 },
  { name: 'wheelInPuddleDepthRr', type: 'f32', offset: 144 },

  { name: 'surfaceRumbleFl', type: 'f32', offset: 148 },
  { name: 'surfaceRumbleFr', type: 'f32', offset: 152 },
  { name: 'surfaceRumbleRl', type: 'f32', offset: 156 },
  { name: 'surfaceRumbleRr', type: 'f32', offset: 160 },

  { name: 'tireSlipAngleFl', type: 'f32', offset: 164 },
  { name: 'tireSlipAngleFr', type: 'f32', offset: 168 },
  { name: 'tireSlipAngleRl', type: 'f32', offset: 172 },
  { name: 'tireSlipAngleRr', type: 'f32', offset: 176 },

  { name: 'tireCombinedSlipFl', type: 'f32', offset: 180 },
  { name: 'tireCombinedSlipFr', type: 'f32', offset: 184 },
  { name: 'tireCombinedSlipRl', type: 'f32', offset: 188 },
  { name: 'tireCombinedSlipRr', type: 'f32', offset: 192 },

  { name: 'suspensionTravelMetersFl', type: 'f32', offset: 196 },
  { name: 'suspensionTravelMetersFr', type: 'f32', offset: 200 },
  { name: 'suspensionTravelMetersRl', type: 'f32', offset: 204 },
  { name: 'suspensionTravelMetersRr', type: 'f32', offset: 208 },

  { name: 'carOrdinal', type: 's32', offset: 212 },
  { name: 'carClass', type: 's32', offset: 216 },
  { name: 'carPerformanceIndex', type: 's32', offset: 220 },
  { name: 'drivetrainType', type: 's32', offset: 224 },
  { name: 'numCylinders', type: 's32', offset: 228 },

  // FH6-specific block — UNVERIFIED.
  { name: 'carGroup', type: 's32', offset: 232 },
  { name: 'smashableVelDiff', type: 'f32', offset: 236 },
  { name: 'smashableMass', type: 'f32', offset: 240 },

  { name: 'positionX', type: 'f32', offset: 244 },
  { name: 'positionY', type: 'f32', offset: 248 },
  { name: 'positionZ', type: 'f32', offset: 252 },

  { name: 'speed', type: 'f32', offset: 256 },
  { name: 'power', type: 'f32', offset: 260 },
  { name: 'torque', type: 'f32', offset: 264 },

  { name: 'tireTempFl', type: 'f32', offset: 268 },
  { name: 'tireTempFr', type: 'f32', offset: 272 },
  { name: 'tireTempRl', type: 'f32', offset: 276 },
  { name: 'tireTempRr', type: 'f32', offset: 280 },

  { name: 'boost', type: 'f32', offset: 284 },
  { name: 'fuel', type: 'f32', offset: 288 },
  { name: 'distanceTraveled', type: 'f32', offset: 292 },

  { name: 'bestLap', type: 'f32', offset: 296 },
  { name: 'lastLap', type: 'f32', offset: 300 },
  { name: 'currentLap', type: 'f32', offset: 304 },
  { name: 'currentRaceTime', type: 'f32', offset: 308 },

  { name: 'lapNumber', type: 'u16', offset: 312 },
  { name: 'racePosition', type: 'u8', offset: 314 },
  { name: 'accelerator', type: 'u8', offset: 315 },
  { name: 'brake', type: 'u8', offset: 316 },
  { name: 'clutch', type: 'u8', offset: 317 },
  { name: 'handbrake', type: 'u8', offset: 318 },
  { name: 'gear', type: 's8', offset: 319 },
  { name: 'steer', type: 's8', offset: 320 },
  { name: 'normalizedDrivingLine', type: 'u8', offset: 321 },
  { name: 'normalizedAiBrakeDifference', type: 'u8', offset: 322 },

  // Optional trailing tyre wear — present only on longer packets.
  { name: 'tireWearFl', type: 'f32', offset: 324, optional: true },
  { name: 'tireWearFr', type: 'f32', offset: 328, optional: true },
  { name: 'tireWearRl', type: 'f32', offset: 332, optional: true },
  { name: 'tireWearRr', type: 'f32', offset: 336, optional: true },
];
