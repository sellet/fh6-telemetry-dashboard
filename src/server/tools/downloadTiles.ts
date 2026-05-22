/**
 * Dev / ops tool: bulk-download the FH6 map tiles into the data volume for
 * offline use.
 *
 *   npm run download-tiles
 *
 * Tiles are normally cached lazily as the dashboard map is viewed; run this to
 * pre-cache the whole map.
 */
import fs from 'node:fs';
import { loadConfig } from '../config';
import { createLogger } from '../logger';
import { MapTileService } from '../map/tileService';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  fs.mkdirSync(config.mapTilesDir, { recursive: true });

  const tiles = new MapTileService(config, logger);
  await tiles.downloadAll();
  logger.info(tiles.getStatus(), 'bulk tile download complete');
}

main().catch((err: unknown) => {
  console.error('tile download failed', err);
  process.exit(1);
});
