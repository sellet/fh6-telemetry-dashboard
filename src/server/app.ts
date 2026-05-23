import fs from 'node:fs';
import type { Config } from './config';
import type { Logger } from './logger';
import { createHttpServer } from './http/httpServer';
import { TelemetryBus } from './core/telemetryBus';
import { UdpReceiver } from './telemetry/udpReceiver';
import { LiveBroadcaster } from './ws/broadcaster';
import { WsServer } from './ws/wsServer';
import { SessionStore } from './session/sessionStore';
import { SessionManager, recoverInterruptedSessions } from './session/sessionManager';
import { ReplayEngine } from './replay/replayEngine';
import { SettingsStore } from './map/settingsStore';
import { MapTileService } from './map/tileService';
import type { ServerStatus } from '../../shared/api';

export interface ServerHandle {
  /** Web port the HTTP/WebSocket server is listening on. */
  webPort: number;
  close: () => Promise<void>;
}

/**
 * Wire and start every subsystem. Returns a handle whose close() shuts the
 * application down cleanly. Used by the CLI entrypoint and the integration test.
 */
export async function startServer(config: Config, logger: Logger): Promise<ServerHandle> {
  logger.info(
    {
      webPort: config.webPort,
      udpHost: config.udpHost,
      udpPort: config.udpPort,
      dataDir: config.dataDir,
    },
    'starting FH6 telemetry dashboard',
  );

  fs.mkdirSync(config.sessionsDir, { recursive: true });
  fs.mkdirSync(config.mapTilesDir, { recursive: true });

  await recoverInterruptedSessions(config, logger);

  const bus = new TelemetryBus();
  const udpReceiver = new UdpReceiver(config, logger, bus);
  const broadcaster = new LiveBroadcaster(bus, config.broadcastHz);
  const sessionStore = new SessionStore(config.sessionsDir, logger);
  const sessionManager = new SessionManager(config, logger, bus);
  const settingsStore = new SettingsStore(config.settingsFile, logger);
  const tileService = new MapTileService(config, logger);

  const getStatus = (): ServerStatus => {
    const udp = udpReceiver.getStats();
    const lastPacketMs = udpReceiver.getLastPacketTime();
    return {
      mode: 'live',
      udp: {
        host: udp.host,
        port: udp.port,
        packetsReceived: udp.packetsReceived,
        parseErrors: udp.parseErrors,
        bytesReceived: udp.bytesReceived,
        lastPacketAt: udp.lastPacketAt,
        receivingPackets: lastPacketMs > 0 && Date.now() - lastPacketMs < 2000,
        lockedSender: udp.lockedSender,
      },
      recording: sessionManager.getStatus(),
      map: tileService.getStatus(),
      allowDeleteSessions: config.allowDeleteSessions,
    };
  };

  const http = createHttpServer(config, logger, {
    getStatus,
    sessionStore,
    sessionManager,
    settingsStore,
    tileService,
  });
  const wsServer = new WsServer(http.server, logger, broadcaster, getStatus);
  wsServer.setReplayService(new ReplayEngine(logger, sessionStore));

  broadcaster.start();
  sessionManager.start();
  await http.listen({ host: '0.0.0.0', port: config.webPort });
  logger.info(`HTTP server listening on :${config.webPort}`);

  await udpReceiver.start();

  // Tiles are normally cached lazily as the map is viewed; this optionally
  // runs a full offline pre-download on startup.
  if (config.mapEnabled && config.mapAutodownloadTiles) {
    logger.info('MAP_AUTODOWNLOAD_TILES enabled — starting background bulk tile download');
    void tileService.downloadAll();
  }

  return {
    webPort: config.webPort,
    close: async () => {
      broadcaster.stop();
      await udpReceiver.stop();
      await sessionManager.shutdown();
      await wsServer.close();
      await http.close();
    },
  };
}
