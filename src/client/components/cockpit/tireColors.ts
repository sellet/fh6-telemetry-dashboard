export function tempColor(rawTempF: number): string {
  const tempC = (rawTempF - 32) * (5 / 9);

  if (tempC < 0) return '#475569';
  if (tempC <= 36) return '#3b82f6';
  if (tempC <= 70) return '#22c55e';
  if (tempC <= 120) return '#f59e0b';
  return '#ef4444';
}