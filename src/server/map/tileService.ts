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

/** Smallest plausible real tile — anything below this is an error placeholder. */
const MIN_TILE_BYTES = 256;
/** Attempts per tile before giving up (1 initial + retries). */
const MAX_FETCH_ATTEMPTS = 3;
/** How long a failed tile is skipped before it is retried on demand. */
const NEGATIVE_CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_NEGATIVE_ENTRIES = 20_000;

/** A real JPEG tile starts with the SOI marker FF D8 and is not tiny. */
function isValidTile(buf: Buffer): boolean {
  return buf.length >= MIN_TILE_BYTES && buf[0] === 0xff && buf[1] === 0xd8;
}

export interface TileStatus {
  enabled: boolean;
  tilesAvailable: boolean;
  tileDownload: TileDownloadState;
  tileCount: number;
}

/**
 * Serves map tiles with lazy, on-demand caching: a tile is fetched from the
 * upstream provider and cached to the data volume the first time it is
 * requested (i.e. as the player drives into that area).
 *
 * Downloads are size/format-checked and retried; an invalid response is never
 * written to the cache. Tiles that keep failing are remembered for a short
 * time only, so they retry automatically when the player returns — or
 * immediately when the dashboard's refresh button clears that memory.
 */
export class MapTileService {
  private bulkState: TileDownloadState = 'idle';
  private tileCount: number;
  /** key -> timestamp until which the tile is treated as missing. */
  private readonly missing = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<Buffer | null>>();

  constructor(
    private readonly config: Config,
    private readonly logger: Logger,
  ) {
    this.migrateLayoutIfNeeded();
    this.tileCount = this.countTiles(config.mapTilesDir);
  }

  /**
   * Earlier versions sent the upstream URL as `{z}/{x}/{y}` instead of the
   * `{z}/{y}/{x}` MapGenie actually expects, so each cached file ended up at
   * the transposed path. Swap x/y in every cached tile path once, then write
   * a marker so this never runs again.
   */
  private migrateLayoutIfNeeded(): void {
    const marker = path.join(this.config.mapTilesDir, '.layout');
    if (fs.existsSync(marker)) return;

    let zooms: string[];
    try {
      zooms = fs.readdirSync(this.config.mapTilesDir).filter((n) => /^\d+$/.test(n));
    } catch {
      return;
    }

    if (zooms.length === 0) {
      try {
        fs.mkdirSync(this.config.mapTilesDir, { recursive: true });
        fs.writeFileSync(marker, 'yx-v1\n');
      } catch {
        /* nothing to migrate, no marker — try again next boot */
      }
      return;
    }

    const moves: Array<{ from: string; to: string }> = [];
    for (const zName of zooms) {
      const zDir = path.join(this.config.mapTilesDir, zName);
      for (const xName of fs.readdirSync(zDir)) {
        const xDir = path.join(zDir, xName);
        let stat;
        try {
          stat = fs.statSync(xDir);
        } catch {
          continue;
        }
        if (!stat.isDirectory() || !/^\d+$/.test(xName)) continue;
        for (const yFile of fs.readdirSync(xDir)) {
          const match = yFile.match(/^(\d+)\.jpg$/);
          if (!match) continue;
          moves.push({
            from: path.join(xDir, yFile),
            to: path.join(zDir, match[1], `${xName}.jpg`),
          });
        }
      }
    }

    if (moves.length === 0) {
      fs.writeFileSync(marker, 'yx-v1\n');
      return;
    }

    this.logger.info(`migrating ${moves.length} cached map tiles to corrected y/x layout`);

    // Two-phase rename so (X,Y) and (Y,X) swapping cannot collide.
    for (const m of moves) {
      fs.mkdirSync(path.dirname(m.to), { recursive: true });
      fs.renameSync(m.from, m.to + '.__migrating');
    }
    for (const m of moves) {
      fs.renameSync(m.to + '.__migrating', m.to);
    }

    // Remove now-empty source directories.
    for (const zName of zooms) {
      const zDir = path.join(this.config.mapTilesDir, zName);
      for (const sub of fs.readdirSync(zDir)) {
        const subDir = path.join(zDir, sub);
        try {
          if (fs.statSync(subDir).isDirectory() && fs.readdirSync(subDir).length === 0) {
            fs.rmdirSync(subDir);
          }
        } catch {
          /* ignore */
        }
      }
    }

    fs.writeFileSync(marker, 'yx-v1\n');
    this.logger.info('tile layout migration complete');
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

    const blockedUntil = this.missing.get(key);
    if (blockedUntil !== undefined) {
      if (blockedUntil > Date.now()) return null;
      this.missing.delete(key); // TTL expired — allow a fresh attempt
    }

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

  /** Forget all negatively-cached tiles so missing ones retry immediately. */
  clearMissing(): void {
    this.missing.clear();
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
      // Do not cache a bad file; remember the miss briefly so it is retried
      // when the player comes back (or on a manual refresh).
      if (this.missing.size >= MAX_NEGATIVE_ENTRIES) this.missing.clear();
      this.missing.set(key, Date.now() + NEGATIVE_CACHE_TTL_MS);
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

  /** Fetch one tile, validating its size and retrying a corrupt download. */
  private async fetchUpstream(z: number, x: number, y: number): Promise<Buffer | null> {
    const url = this.config.mapTilesUrl
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) return null; // genuine 404/403 — map edge, no point retrying
        const buf = Buffer.from(await res.arrayBuffer());
        if (isValidTile(buf)) return buf;
        this.logger.debug(
          `tile ${z}/${x}/${y} response too small (${buf.length} bytes), attempt ${attempt}/${MAX_FETCH_ATTEMPTS}`,
        );
      } catch {
        // timeout or network error — retry
      }
    }
    return null;
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
