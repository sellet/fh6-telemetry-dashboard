/** Recorded-session metadata shared between server and client. */

export interface SessionCar {
  ordinal: number;
  class: number;
  performanceIndex: number;
  drivetrain: number;
  cylinders: number;
}

export interface SessionStats {
  /** Top speed in m/s. */
  topSpeed: number;
  /** Mean speed in m/s. */
  avgSpeed: number;
  maxRpm: number;
  /** Peak engine power in watts. */
  maxPower: number;
  /** Peak engine torque in N·m. */
  maxTorque: number;
  maxLateralG: number;
  maxLongitudinalG: number;
  maxGForce: number;
  distanceMeters: number;
  /** Best lap in seconds, 0 if none completed. */
  bestLap: number;
  lapCount: number;
  maxTireTempFl: number;
  maxTireTempFr: number;
  maxTireTempRl: number;
  maxTireTempRr: number;
}

export type SessionStatus = 'recording' | 'completed';
/** Race vs free-roam, derived from `isRaceOn` of the first frame in the session. */
export type SessionKind = 'race' | 'free-roam';
export type SessionEndReason =
  | 'timeout'
  | 'shutdown'
  | 'recovered'
  | 'cut'
  | 'race-start'
  | 'race-end'
  | 'car-change'
  | 'driving-ended'
  | 'merged'
  | null;

/** Maximum length of a user-supplied session display name. */
export const SESSION_NAME_MAX_LENGTH = 64;

export const SESSION_SCHEMA_VERSION = 2;

export interface SessionManifest {
  id: string;
  schemaVersion: number;
  status: SessionStatus;
  endReason: SessionEndReason;
  /** Optional in v1 manifests; treat undefined as 'free-roam'. */
  kind?: SessionKind;
  /** Optional user-supplied display name (shown after the id in the list). */
  name?: string;
  createdBy: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  frameCount: number;
  droppedFrames: number;
  dataFile: string;
  compressed: boolean;
  car: SessionCar;
  stats: SessionStats;
}

/** Condensed session entry for the browser list. */
export interface SessionSummary {
  id: string;
  status: SessionStatus;
  kind?: SessionKind;
  name?: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  frameCount: number;
  topSpeed: number;
  maxRpm: number;
  distanceMeters: number;
  car: SessionCar;
}

export function emptyStats(): SessionStats {
  return {
    topSpeed: 0,
    avgSpeed: 0,
    maxRpm: 0,
    maxPower: 0,
    maxTorque: 0,
    maxLateralG: 0,
    maxLongitudinalG: 0,
    maxGForce: 0,
    distanceMeters: 0,
    bestLap: 0,
    lapCount: 0,
    maxTireTempFl: 0,
    maxTireTempFr: 0,
    maxTireTempRl: 0,
    maxTireTempRr: 0,
  };
}
