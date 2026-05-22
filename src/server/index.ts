import { loadConfig } from './config';
import { createLogger } from './logger';
import { createHttpServer } from './http/httpServer';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info(
    {
      webPort: config.webPort,
      udpHost: config.udpHost,
      udpPort: config.udpPort,
      dataDir: config.dataDir,
    },
    'starting FH6 telemetry dashboard',
  );

  const http = createHttpServer(logger);
  await http.listen({ host: '0.0.0.0', port: config.webPort });
  logger.info(`HTTP server listening on :${config.webPort}`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — shutting down`);
    await http.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
