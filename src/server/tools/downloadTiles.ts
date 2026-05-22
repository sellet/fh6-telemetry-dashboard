/**
 * Dev / ops tool: download the MapGenie FH6 map tiles into the data volume.
 *
 *   npm run download-tiles
 *
 * Normally the server downloads tiles automatically on first boot
 * (MAP_AUTODOWNLOAD_TILES=true); run this to pre-seed or refresh them.
 */
import fs from 'node:fs';
import { loadConfig } from '../config';
import { createLogger } from '../logger';
import { TileDownloader } from '../map/tileDownloader';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  fs.mkdirSync(config.mapTilesDir, { recursive: true });

  const downloader = new TileDownloader(config, logger);
  await downloader.run();
  logger.info(downloader.getStatus(), 'tile download complete');
}

main().catch((err: unknown) => {
  console.error('tile download failed', err);
  process.exit(1);
});
