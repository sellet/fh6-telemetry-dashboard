import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config';
import type { Logger } from '../logger';
import type { TileDownloadState } from '../../../shared/api';
import { FH6_MAP } from '../../../shared/mapDefaults';

const MAX_TILES = 30_000;
const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 8000;

export interface TileStatus {
  enabled: boolean;
  tilesAvailable: boolean;
  tileDownload: TileDownloadState;
  tileCount: number;
}

/**
 * Best-effort flood-fill downloader for the MapGenie FH6 tile pyramid.
 * Treats non-200 responses as map edges; resumable across runs. If nothing
 * downloads (e.g. the tile server is unreachable) the dashboard falls back to
 * a tile-less vector track trace.
 */
export class TileDownloader {
  private state: TileDownloadState = 'idle';
  private tileCount: number;

  constructor(
    private readonly config: Config,
    private readonly logger: Logger,
  ) {
    this.tileCount = this.countTiles(this.config.mapTilesDir);
  }

  getStatus(): TileStatus {
    return {
      enabled: this.config.mapEnabled,
      tilesAvailable: this.tileCount > 0,
      tileDownload: this.state,
      tileCount: this.tileCount,
    };
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

  async run(): Promise<void> {
    if (this.state === 'downloading') return;
    this.state = 'downloading';
    this.logger.info('map tile download started');
    try {
      for (let z = FH6_MAP.minZoom; z <= FH6_MAP.maxZoom; z += 1) {
        const shift = FH6_MAP.maxZoom - z;
        await this.floodFill(z, FH6_MAP.seedTile.x >> shift, FH6_MAP.seedTile.y >> shift);
        if (this.tileCount >= MAX_TILES) break;
      }
      this.state = this.tileCount > 0 ? 'complete' : 'error';
      this.logger.info(`map tile download finished: ${this.tileCount} tiles (${this.state})`);
    } catch (err) {
      this.state = 'error';
      this.logger.error({ err }, 'map tile download failed');
    }
  }

  private async floodFill(z: number, seedX: number, seedY: number): Promise<void> {
    const visited = new Set<string>();
    let frontier: Array<[number, number]> = [[seedX, seedY]];

    while (frontier.length > 0 && this.tileCount < MAX_TILES) {
      const batch = frontier.slice(0, CONCURRENCY);
      frontier = frontier.slice(CONCURRENCY);
      const neighborLists = await Promise.all(
        batch.map(([x, y]) => this.visitTile(z, x, y, visited)),
      );
      for (const neighbors of neighborLists) {
        for (const nb of neighbors) {
          if (!visited.has(`${nb[0]},${nb[1]}`)) frontier.push(nb);
        }
      }
    }
  }

  private async visitTile(
    z: number,
    x: number,
    y: number,
    visited: Set<string>,
  ): Promise<Array<[number, number]>> {
    const key = `${x},${y}`;
    if (visited.has(key) || x < 0 || y < 0) return [];
    visited.add(key);

    const dest = path.join(this.config.mapTilesDir, String(z), String(x), `${y}.jpg`);
    const ok = fs.existsSync(dest) ? true : await this.downloadTile(z, x, y, dest);
    if (!ok) return [];

    return [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
  }

  private async downloadTile(z: number, x: number, y: number, dest: string): Promise<boolean> {
    const url = this.config.mapTilesUrl
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) return false;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) return false;
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, buf);
      this.tileCount += 1;
      return true;
    } catch {
      return false;
    }
  }
}
