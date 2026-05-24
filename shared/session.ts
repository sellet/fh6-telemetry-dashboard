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
/** Caps on the new tags / notes metadata. */
export const SESSION_TAG_MAX_LENGTH = 32;
export const SESSION_MAX_TAGS = 16;
export const SESSION_NOTES_MAX_LENGTH = 2000;
/** Length of the truncated notes preview carried on SessionSummary. */
export const SESSION_NOTES_PREVIEW_LENGTH = 120;

export const SESSION_SCHEMA_VERSION = 3;

/** Half-open idle interval in milliseconds since the session's first frame. */
export type IdleRange = [number, number];

export interface SessionManifest {
  id: string;
  schemaVersion: number;
  status: SessionStatus;
  endReason: SessionEndReason;
  /** Optional in v1 manifests; treat undefined as 'free-roam'. */
  kind?: SessionKind;
  /** Optional user-supplied display name (shown after the id in the list). */
  name?: string;
  /** Free-form user tags. Normalised: trimmed, lowercase, deduped, capped. */
  tags?: string[];
  /** Free-form user notes. */
  notes?: string;
  /** Detected stopped-and-not-racing spans (relative to startedAt, in ms). */
  idleRangesMs?: IdleRange[];
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
  tags?: string[];
  /** Truncated to SESSION_NOTES_PREVIEW_LENGTH for the list view. */
  notes?: string;
  hasIdleRanges?: boolean;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  frameCount: number;
  topSpeed: number;
  maxRpm: number;
  distanceMeters: number;
  car: SessionCar;
}

export interface SessionMetaPatch {
  name?: string;
  tags?: string[];
  notes?: string;
}

/** Normalise a tag list: trim, lowercase-collapse-whitespace, dedupe, cap. */
export function normaliseTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, SESSION_TAG_MAX_LENGTH);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= SESSION_MAX_TAGS) break;
  }
  return out;
}

export function normaliseNotes(notes: string): string {
  return notes.trim().slice(0, SESSION_NOTES_MAX_LENGTH);
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
