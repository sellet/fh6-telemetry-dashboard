import type { TelemetryBus } from '../core/telemetryBus';
import type { TelemetryFrame } from '../../../shared/telemetry';
import type { TelemetryMsg } from '../../../shared/protocol';

/**
 * Coalesces the 60 Hz live telemetry stream down to BROADCAST_HZ. Always sends
 * the freshest frame, never a backlog — the dashboard does not benefit from
 * 60 Hz and this halves WebSocket/JSON cost per client.
 */
export class LiveBroadcaster {
  private latest: TelemetryFrame | null = null;
  private timer: NodeJS.Timeout | null = null;
  private sink: ((json: string) => void) | null = null;

  constructor(
    private readonly bus: TelemetryBus,
    private readonly broadcastHz: number,
  ) {}

  /** The sink receives one pre-serialized telemetry message per tick. */
  setSink(sink: (json: string) => void): void {
    this.sink = sink;
  }

  start(): void {
    this.bus.onFrame((frame) => {
      this.latest = frame;
    });
    const intervalMs = Math.max(1, Math.round(1000 / this.broadcastHz));
    this.timer = setInterval(() => this.flush(), intervalMs);
  }

  private flush(): void {
    if (!this.latest || !this.sink) return;
    const msg: TelemetryMsg = { type: 'telemetry', source: 'live', frame: this.latest };
    this.sink(JSON.stringify(msg));
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
