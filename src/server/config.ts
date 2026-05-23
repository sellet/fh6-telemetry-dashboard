import path from 'node:path';

export interface Config {
  webPort: number;
  udpHost: string;
  udpPort: number;
  dataDir: string;
  sessionsDir: string;
  mapTilesDir: string;
  settingsFile: string;
  sessionTimeoutMs: number;
  compressFinishedSessions: boolean;
  allowDeleteSessions: boolean;
  lockToFirstSender: boolean;
  logLevel: string;
  broadcastHz: number;
  mapEnabled: boolean;
  mapAutodownloadTiles: boolean;
  mapTilesUrl: string;
  maxSessionListItems: number;
}

function envStr(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v ? v : fallback;
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return fallback;
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

export function loadConfig(): Config {
  const dataDir = path.resolve(envStr('DATA_DIR', '/data'));
  return {
    webPort: envInt('WEB_PORT', 8080),
    udpHost: envStr('UDP_HOST', '0.0.0.0'),
    udpPort: envInt('UDP_PORT', 20440),
    dataDir,
    sessionsDir: path.join(dataDir, 'sessions'),
    mapTilesDir: path.join(dataDir, 'maptiles'),
    settingsFile: path.join(dataDir, 'settings.json'),
    sessionTimeoutMs: Math.max(1, envInt('SESSION_TIMEOUT_SECONDS', 30)) * 1000,
    compressFinishedSessions: envBool('COMPRESS_FINISHED_SESSIONS', false),
    allowDeleteSessions: envBool('ALLOW_DELETE_SESSIONS', false),
    lockToFirstSender: envBool('LOCK_TO_FIRST_SENDER', false),
    logLevel: envStr('LOG_LEVEL', 'info'),
    broadcastHz: Math.min(60, Math.max(1, envInt('BROADCAST_HZ', 30))),
    mapEnabled: envBool('MAP_ENABLED', true),
    // Tiles are cached lazily on demand; this only controls an optional
    // full bulk pre-download on startup.
    mapAutodownloadTiles: envBool('MAP_AUTODOWNLOAD_TILES', false),
    // MapGenie stores tiles as {z}/{row}/{col}, so we substitute {y} (row)
    // before {x} (column). Swapping these yields a transposed map.
    mapTilesUrl: envStr(
      'MAP_TILES_URL',
      'https://tiles.mapgenie.io/games/forza-horizon-6/one/default-v2/{z}/{y}/{x}.jpg',
    ),
    maxSessionListItems: Math.max(1, envInt('MAX_SESSION_LIST_ITEMS', 500)),
  };
}
