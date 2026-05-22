/**
 * Normalized Forza Horizon 6 telemetry frame.
 *
 * Produced by the server packet parser and sent verbatim over WebSocket and
 * stored (one per line) in telemetry.jsonl. The shape is intentionally flat so
 * it maps 1:1 onto the declarative packet offset table.
 */
export interface TelemetryFrame {
  /** Server receipt time (ms epoch). Drives replay timing — NOT the in-game clock. */
  recvTime: number;

  /** 1 while driving, 0 in menus / paused. */
  isRaceOn: number;
  /** In-game elapsed clock (ms). Wraps/resets — kept as data only. */
  timestampMs: number;

  engineMaxRpm: number;
  engineIdleRpm: number;
  currentEngineRpm: number;

  accelerationX: number;
  accelerationY: number;
  accelerationZ: number;

  velocityX: number;
  velocityY: number;
  velocityZ: number;

  angularVelocityX: number;
  angularVelocityY: number;
  angularVelocityZ: number;

  yaw: number;
  pitch: number;
  roll: number;

  normalizedSuspensionTravelFl: number;
  normalizedSuspensionTravelFr: number;
  normalizedSuspensionTravelRl: number;
  normalizedSuspensionTravelRr: number;

  tireSlipRatioFl: number;
  tireSlipRatioFr: number;
  tireSlipRatioRl: number;
  tireSlipRatioRr: number;

  wheelRotationSpeedFl: number;
  wheelRotationSpeedFr: number;
  wheelRotationSpeedRl: number;
  wheelRotationSpeedRr: number;

  wheelOnRumbleStripFl: number;
  wheelOnRumbleStripFr: number;
  wheelOnRumbleStripRl: number;
  wheelOnRumbleStripRr: number;

  wheelInPuddleDepthFl: number;
  wheelInPuddleDepthFr: number;
  wheelInPuddleDepthRl: number;
  wheelInPuddleDepthRr: number;

  surfaceRumbleFl: number;
  surfaceRumbleFr: number;
  surfaceRumbleRl: number;
  surfaceRumbleRr: number;

  tireSlipAngleFl: number;
  tireSlipAngleFr: number;
  tireSlipAngleRl: number;
  tireSlipAngleRr: number;

  tireCombinedSlipFl: number;
  tireCombinedSlipFr: number;
  tireCombinedSlipRl: number;
  tireCombinedSlipRr: number;

  suspensionTravelMetersFl: number;
  suspensionTravelMetersFr: number;
  suspensionTravelMetersRl: number;
  suspensionTravelMetersRr: number;

  carOrdinal: number;
  carClass: number;
  carPerformanceIndex: number;
  drivetrainType: number;
  numCylinders: number;

  /** FH6-specific fields (offsets 232-243) — UNVERIFIED, see offsets.ts. */
  carGroup: number;
  smashableVelDiff: number;
  smashableMass: number;

  positionX: number;
  positionY: number;
  positionZ: number;

  /** Speed magnitude in m/s. */
  speed: number;
  /** Engine power in watts. */
  power: number;
  /** Engine torque in N·m. */
  torque: number;

  tireTempFl: number;
  tireTempFr: number;
  tireTempRl: number;
  tireTempRr: number;

  boost: number;
  /** Fuel fraction 0..1. */
  fuel: number;
  distanceTraveled: number;

  bestLap: number;
  lastLap: number;
  currentLap: number;
  currentRaceTime: number;
  lapNumber: number;
  racePosition: number;

  accelerator: number;
  brake: number;
  clutch: number;
  handbrake: number;
  gear: number;
  steer: number;
  normalizedDrivingLine: number;
  normalizedAiBrakeDifference: number;

  /** Optional trailing tyre-wear fields — present only on longer packets. */
  tireWearFl?: number;
  tireWearFr?: number;
  tireWearRl?: number;
  tireWearRr?: number;
}

export type CornerKey = 'Fl' | 'Fr' | 'Rl' | 'Rr';
export const CORNER_KEYS: CornerKey[] = ['Fl', 'Fr', 'Rl', 'Rr'];

/** Forza car class index → label. */
export const CAR_CLASSES: Record<number, string> = {
  0: 'D',
  1: 'C',
  2: 'B',
  3: 'A',
  4: 'S1',
  5: 'S2',
  6: 'S3',
  7: 'X',
};

/** Forza drivetrain index → label. */
export const DRIVETRAIN_TYPES: Record<number, string> = {
  0: 'FWD',
  1: 'RWD',
  2: 'AWD',
};
