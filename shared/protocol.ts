/** WebSocket message protocol shared between server and client. */
import type { ServerStatus } from './api';
import type { TelemetryFrame } from './telemetry';

export type ConnectionMode = 'live' | 'replay';
export type ReplayState = 'playing' | 'paused' | 'ended';

/** Replay speed multipliers offered to the client. */
export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;

// ---------------------------------------------------------------- client → server

export interface SubscribeLiveMsg {
  type: 'subscribe.live';
}
export interface ReplayStartMsg {
  type: 'replay.start';
  sessionId: string;
  speed?: number;
}
export interface ReplayPauseMsg {
  type: 'replay.pause';
}
export interface ReplayResumeMsg {
  type: 'replay.resume';
}
export interface ReplayStopMsg {
  type: 'replay.stop';
}
export interface ReplaySetSpeedMsg {
  type: 'replay.setSpeed';
  speed: number;
}
export interface ReplaySeekMsg {
  type: 'replay.seek';
  toMs: number;
}
export interface PingMsg {
  type: 'ping';
}

export type ClientMessage =
  | SubscribeLiveMsg
  | ReplayStartMsg
  | ReplayPauseMsg
  | ReplayResumeMsg
  | ReplayStopMsg
  | ReplaySetSpeedMsg
  | ReplaySeekMsg
  | PingMsg;

// ---------------------------------------------------------------- server → client

export interface HelloMsg {
  type: 'hello';
  mode: ConnectionMode;
}
export interface TelemetryMsg {
  type: 'telemetry';
  source: ConnectionMode;
  frame: TelemetryFrame;
}
export interface StatusMsg {
  type: 'status';
  status: ServerStatus;
}
export interface ReplayProgressMsg {
  type: 'replay.progress';
  frameIndex: number;
  elapsedMs: number;
  totalMs: number;
}
export interface ReplayStateMsg {
  type: 'replay.state';
  state: ReplayState;
  sessionId: string;
  speed: number;
}
export interface ErrorMsg {
  type: 'error';
  code: string;
  message: string;
}
export interface PongMsg {
  type: 'pong';
}

export type ServerMessage =
  | HelloMsg
  | TelemetryMsg
  | StatusMsg
  | ReplayProgressMsg
  | ReplayStateMsg
  | ErrorMsg
  | PongMsg;
