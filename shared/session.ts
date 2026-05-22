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
export type SessionEndReason = 'timeout' | 'shutdown' | 'recovered' | null;

export const SESSION_SCHEMA_VERSION = 1;

export interface SessionManifest {
  id: string;
  schemaVersion: number;
  status: SessionStatus;
  endReason: SessionEndReason;
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
