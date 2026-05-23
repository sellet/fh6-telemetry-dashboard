import { useTelemetryStore } from '../../state/telemetryStore';
import { Panel } from '../common/Panel';
import { formatLapTime } from '../../lib/format';
import { isRacing } from '../../../../shared/telemetry';

function TimeRow({ label, seconds, accent }: { label: string; seconds: number; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[9px] uppercase tracking-wide text-slate-500">{label}</span>
      <span
        className={`font-mono text-sm font-semibold ${accent ? 'text-cockpit-accent' : 'text-slate-100'}`}
      >
        {formatLapTime(seconds)}
      </span>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-cockpit-bg p-1 text-center">
      <div className="text-[9px] uppercase text-slate-500">{label}</div>
      <div className="font-mono text-lg font-bold text-slate-100">{value}</div>
    </div>
  );
}

export function LapInfo() {
  const f = useTelemetryStore((s) => s.frame);
  // Real race detection (lap/position/lap-clock) — not just "driving".
  const inRace = useTelemetryStore((s) => (s.frame ? isRacing(s.frame) : false));

  return (
    <Panel title="Lap & Race" tone={inRace ? 'race' : 'default'}>
      <div className="space-y-1">
        <TimeRow label="Current" seconds={f?.currentLap ?? 0} />
        <TimeRow label="Last" seconds={f?.lastLap ?? 0} />
        <TimeRow label="Best" seconds={f?.bestLap ?? 0} accent />
        <div className="grid grid-cols-2 gap-1 pt-0.5">
          <Mini label="Lap" value={f && f.lapNumber > 0 ? String(f.lapNumber) : '--'} />
          <Mini label="Position" value={f && f.racePosition > 0 ? String(f.racePosition) : '--'} />
        </div>
      </div>
    </Panel>
  );
}
