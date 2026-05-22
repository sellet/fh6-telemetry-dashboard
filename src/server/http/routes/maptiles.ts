import type { FastifyInstance } from 'fastify';
import type { MapTileService } from '../../map/tileService';

/** Validate a tile coordinate; Number() parsing also blocks path traversal. */
function parseCoord(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 2 ** 23 ? n : null;
}

export function registerMapTileRoutes(app: FastifyInstance, tiles: MapTileService): void {
  // Lazy tile proxy: cached tiles are served from disk, misses are fetched
  // from upstream and cached as the player drives into new areas.
  app.get<{ Params: { z: string; x: string; y: string } }>(
    '/maptiles/:z/:x/:y',
    async (req, reply) => {
      const z = parseCoord(req.params.z);
      const x = parseCoord(req.params.x);
      const y = parseCoord(req.params.y.replace(/\.jpg$/, ''));
      if (z === null || x === null || y === null) {
        return reply.code(400).send({ error: 'invalid tile coordinate' });
      }
      const tile = await tiles.getTile(z, x, y);
      if (!tile) {
        return reply.code(404).send();
      }
      return reply.type('image/jpeg').header('Cache-Control', 'public, max-age=604800').send(tile);
    },
  );

  // Trigger a bulk flood-fill download for offline pre-caching.
  app.post('/api/maptiles/download', () => {
    void tiles.downloadAll();
    return { started: true, status: tiles.getStatus() };
  });
}
