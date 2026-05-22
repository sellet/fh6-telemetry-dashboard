/** Track-map calibration and tile-pyramid defaults (FH6 Japan). */

/** Two reference points pinning game-world coordinates to map pixels. */
export interface MapCalibration {
  /** [worldX, worldZ] of reference point A. */
  worldA: [number, number];
  /** [pixelX, pixelY] of reference point A at the max zoom level. */
  pixelA: [number, number];
  worldB: [number, number];
  pixelB: [number, number];
}

export interface MapDefaultView {
  center: [number, number];
  zoom: number;
}

export interface MapSettings {
  calibration: MapCalibration;
  defaultView: MapDefaultView | null;
}

/** Tile pyramid parameters for the bundled MapGenie FH6 tile set. */
export const FH6_MAP = {
  minZoom: 9,
  maxZoom: 14,
  tileSize: 256,
  /** Seed tile near the map centre at max zoom (pixelA / tileSize). */
  seedTile: { z: 14, x: 8162, y: 8154 },
};

/**
 * Default calibration derived from the fh6-tel reference project. Users can
 * override it via the in-app calibrator; overrides persist to settings.json.
 */
export const DEFAULT_MAP_SETTINGS: MapSettings = {
  calibration: {
    worldA: [-119.49, 3888.59],
    pixelA: [2089486, 2087415],
    worldB: [-7104.77, -1863.08],
    pixelB: [2086885, 2089556],
  },
  defaultView: null,
};

export function isCoordinatePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

export function isValidCalibration(value: unknown): value is MapCalibration {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    isCoordinatePair(c.worldA) &&
    isCoordinatePair(c.pixelA) &&
    isCoordinatePair(c.worldB) &&
    isCoordinatePair(c.pixelB)
  );
}
