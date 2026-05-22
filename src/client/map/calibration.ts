import type { MapCalibration } from '../../../shared/mapDefaults';

export type WorldToPixel = (worldX: number, worldZ: number) => [number, number];

/**
 * Build a world→pixel transform via independent per-axis linear regression
 * through the two calibration reference points.
 */
export function makeWorldToPixel(cal: MapCalibration): WorldToPixel {
  const dWorldX = cal.worldB[0] - cal.worldA[0] || 1;
  const dWorldZ = cal.worldB[1] - cal.worldA[1] || 1;
  const slopeX = (cal.pixelB[0] - cal.pixelA[0]) / dWorldX;
  const slopeY = (cal.pixelB[1] - cal.pixelA[1]) / dWorldZ;
  const interceptX = cal.pixelA[0] - slopeX * cal.worldA[0];
  const interceptY = cal.pixelA[1] - slopeY * cal.worldA[1];

  return (worldX, worldZ) => [slopeX * worldX + interceptX, slopeY * worldZ + interceptY];
}
