/** REST API response shapes shared between server and client. */

export interface HealthResponse {
  status: 'ok';
  uptime: number;
}

export type TileDownloadState = 'idle' | 'downloading' | 'complete' | 'error';

export interface ServerStatus {
  mode: 'live';
  udp: {
    host: string;
    port: number;
    packetsReceived: number;
    parseErrors: number;
    bytesReceived: number;
    lastPacketAt: string | null;
    receivingPackets: boolean;
    lockedSender: string | null;
  };
  recording: {
    active: boolean;
    sessionId: string | null;
    frameCount: number;
    droppedFrames: number;
    error: string | null;
  };
  map: {
    enabled: boolean;
    tilesAvailable: boolean;
    tileDownload: TileDownloadState;
    tileCount: number;
  };
  allowDeleteSessions: boolean;
}
