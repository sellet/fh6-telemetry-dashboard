import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config';
import type { Logger } from '../logger';
import type { TileDownloadState } from '../../../shared/api';
import { FH6_MAP } from '../../../shared/mapDefaults';

const MAX_BULK_TILES = 30_000;
const BULK_CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 8000;

export interface TileStatus {
  enabled: boolean;
  tilesAvailable: boolean;
  tileDownload: TileDownloadState;
  tileCount: number;
}

/**
 * Serves map tiles with lazy, on-demand caching: a tile is fetched from the
 * upstream provider and cached to the data volume the first time it is
 * requested (i.e. as the player drives into that area). A bulk flood-fill
 * download is also available for offline pre-caching.
 */
export class MapTileService {
  private bulkState: TileDownloadState = 'idle';
  private tileCount: number;
  private readonly missing = new Set<string>();
  private readonly inFlight = new Map<string, Promise<Buffer | null>>();

  constructor(
    private readonly config: Config,
    private readonly logger: Logger,
  ) {
    this.tileCount = this.countTiles(config.mapTilesDir);
  }

  getStatus(): TileStatus {
    return {
      enabled: this.config.mapEnabled,
      tilesAvailable: this.tileCount > 0,
      tileDownload: this.bulkState,
      tileCount: this.tileCount,
    };
  }

  private tilePath(z: number, x: number, y: number): string {
    return path.join(this.config.mapTilesDir, String(z), String(x), `${y}.jpg`);
  }

  /** Return a tile, fetching and caching it from upstream on a cache miss. */
  async getTile(z: number, x: number, y: number): Promise<Buffer | null> {
    const dest = this.tilePath(z, x, y);
    try {
      return await fsp.readFile(dest);
    } catch {
      // not cached yet
    }

    if (!this.config.mapEnabled) return null;
    const key = `${z}/${x}/${y}`;
    if (this.missing.has(key)) return null;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const job = this.fetchAndCache(z, x, y, dest, key);
    this.inFlight.set(key, job);
    try {
      return await job;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async fetchAndCache(
    z: number,
    x: number,
    y: number,
    dest: string,
    key: string,
  ): Promise<Buffer | null> {
    const buf = await this.fetchUpstream(z, x, y);
    if (!buf) {
      this.missing.add(key);
      return null;
    }
    try {
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, buf);
      this.tileCount += 1;
    } catch (err) {
      this.logger.warn({ err }, `failed to cache tile ${key}`);
    }
    return buf;
  }

  private async fetchUpstream(z: number, x: number, y: number): Promise<Buffer | null> {
    const url = this.config.mapTilesUrl
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length > 0 ? buf : null;
    } catch {
      return null;
    }
  }

  /** Flood-fill the whole reachable tile pyramid for offline use. */
  async downloadAll(): Promise<void> {
    if (this.bulkState === 'downloading' || !this.config.mapEnabled) return;
    this.bulkState = 'downloading';
    this.missing.clear();
    const before = this.tileCount;
    this.logger.info('bulk map tile download started');
    try {
      for (let z = FH6_MAP.minZoom; z <= FH6_MAP.maxZoom; z += 1) {
        await this.floodFill(z);
        if (this.tileCount >= MAX_BULK_TILES) break;
      }
      this.bulkState = 'complete';
      this.logger.info(
        `bulk map tile download finished: +${this.tileCount - before} tiles (${this.tileCount} total)`,
      );
    } catch (err) {
      this.bulkState = 'error';
      this.logger.error({ err }, 'bulk map tile download failed');
    }
  }

  private async floodFill(z: number): Promise<void> {
    const visited = new Set<string>();
    let frontier = this.seedsForZoom(z);
    for (const [x, y] of frontier) visited.add(`${x},${y}`);

    while (frontier.length > 0 && this.tileCount < MAX_BULK_TILES) {
      const batch = frontier.slice(0, BULK_CONCURRENCY);
      frontier = frontier.slice(BULK_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async ([x, y]): Promise<Array<[number, number]>> => {
          const tile = await this.getTile(z, x, y);
          return tile
            ? [
                [x + 1, y],
                [x - 1, y],
                [x, y + 1],
                [x, y - 1],
              ]
            : [];
        }),
      );
      for (const neighbors of results) {
        for (const [nx, ny] of neighbors) {
          const k = `${nx},${ny}`;
          if (nx >= 0 && ny >= 0 && !visited.has(k)) {
            visited.add(k);
            frontier.push([nx, ny]);
          }
        }
      }
    }
  }

  /** Seed the flood-fill from already-cached tiles, else the default seed. */
  private seedsForZoom(z: number): Array<[number, number]> {
    const seeds: Array<[number, number]> = [];
    const zoomDir = path.join(this.config.mapTilesDir, String(z));
    try {
      for (const xName of fs.readdirSync(zoomDir)) {
        const x = Number(xName);
        if (!Number.isInteger(x)) continue;
        for (const yFile of fs.readdirSync(path.join(zoomDir, xName))) {
          const y = Number(yFile.replace(/\.jpg$/, ''));
          if (Number.isInteger(y)) seeds.push([x, y]);
        }
      }
    } catch {
      // no tiles cached at this zoom yet
    }
    if (seeds.length === 0) {
      const shift = FH6_MAP.maxZoom - z;
      seeds.push([FH6_MAP.seedTile.x >> shift, FH6_MAP.seedTile.y >> shift]);
    }
    return seeds;
  }

  private countTiles(dir: string): number {
    let count = 0;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) count += this.countTiles(full);
      else if (entry.name.endsWith('.jpg')) count += 1;
    }
    return count;
  }
}
