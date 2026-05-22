import type { TelemetryFrame } from '../../../shared/telemetry';
import { emptyStats, type SessionStats } from '../../../shared/session';

const GRAVITY = 9.80665;

/** Accumulates running session statistics frame by frame. */
export class StatsAccumulator {
  private frameCount = 0;
  private speedSum = 0;
  private topSpeed = 0;
  private maxRpm = 0;
  private maxPower = 0;
  private maxTorque = 0;
  private maxLateralG = 0;
  private maxLongitudinalG = 0;
  private maxGForce = 0;
  private distance = 0;
  private bestLap = 0;
  private readonly laps = new Set<number>();
  private maxTireTempFl = 0;
  private maxTireTempFr = 0;
  private maxTireTempRl = 0;
  private maxTireTempRr = 0;

  update(frame: TelemetryFrame): void {
    this.frameCount += 1;
    this.speedSum += frame.speed;
    this.topSpeed = Math.max(this.topSpeed, frame.speed);
    this.maxRpm = Math.max(this.maxRpm, frame.currentEngineRpm);
    this.maxPower = Math.max(this.maxPower, frame.power);
    this.maxTorque = Math.max(this.maxTorque, frame.torque);

    // Forza local axes: X = lateral, Z = longitudinal.
    const latG = Math.abs(frame.accelerationX) / GRAVITY;
    const lonG = Math.abs(frame.accelerationZ) / GRAVITY;
    this.maxLateralG = Math.max(this.maxLateralG, latG);
    this.maxLongitudinalG = Math.max(this.maxLongitudinalG, lonG);
    this.maxGForce = Math.max(
      this.maxGForce,
      Math.hypot(frame.accelerationX, frame.accelerationZ) / GRAVITY,
    );

    this.distance = Math.max(this.distance, frame.distanceTraveled);

    if (frame.bestLap > 0 && (this.bestLap === 0 || frame.bestLap < this.bestLap)) {
      this.bestLap = frame.bestLap;
    }
    if (frame.lapNumber > 0) this.laps.add(frame.lapNumber);

    this.maxTireTempFl = Math.max(this.maxTireTempFl, frame.tireTempFl);
    this.maxTireTempFr = Math.max(this.maxTireTempFr, frame.tireTempFr);
    this.maxTireTempRl = Math.max(this.maxTireTempRl, frame.tireTempRl);
    this.maxTireTempRr = Math.max(this.maxTireTempRr, frame.tireTempRr);
  }

  get count(): number {
    return this.frameCount;
  }

  snapshot(): SessionStats {
    if (this.frameCount === 0) return emptyStats();
    return {
      topSpeed: this.topSpeed,
      avgSpeed: this.speedSum / this.frameCount,
      maxRpm: this.maxRpm,
      maxPower: this.maxPower,
      maxTorque: this.maxTorque,
      maxLateralG: this.maxLateralG,
      maxLongitudinalG: this.maxLongitudinalG,
      maxGForce: this.maxGForce,
      distanceMeters: this.distance,
      bestLap: this.bestLap,
      lapCount: this.laps.size,
      maxTireTempFl: this.maxTireTempFl,
      maxTireTempFr: this.maxTireTempFr,
      maxTireTempRl: this.maxTireTempRl,
      maxTireTempRr: this.maxTireTempRr,
    };
  }
}
