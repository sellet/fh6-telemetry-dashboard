import { useTelemetryStore } from '../../state/telemetryStore';
import { Panel } from '../common/Panel';
import { CAR_CLASSES, DRIVETRAIN_TYPES } from '../../../../shared/telemetry';
import { carDisplayName } from '../../lib/format';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-cockpit-bg p-1.5">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="truncate whitespace-nowrap font-mono text-sm font-semibold text-slate-100">
        {value}
      </div>
    </div>
  );
}

export function VehicleStats() {
  const f = useTelemetryStore((s) => s.frame);

  const carClass = f ? (CAR_CLASSES[f.carClass] ?? `#${f.carClass}`) : '--';
  const drivetrain = f ? (DRIVETRAIN_TYPES[f.drivetrainType] ?? '--') : '--';

  const carName = f && f.carOrdinal > 0 ? carDisplayName(f.carOrdinal) : '--';

  return (
    <Panel title="Vehicle">
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-5">
        <Stat label="Power" value={f ? `${(f.power / 1000).toFixed(0)} kW` : '--'} />
        <Stat label="Torque" value={f ? `${f.torque.toFixed(0)} Nm` : '--'} />
        <Stat label="Boost" value={f ? f.boost.toFixed(1) : '--'} />
        <Stat label="Fuel" value={f ? `${(f.fuel * 100).toFixed(0)}%` : '--'} />
        <Stat label="Class" value={carClass} />
        <Stat label="Drive" value={drivetrain} />
        <Stat
          label="PI"
          value={f && f.carPerformanceIndex > 0 ? String(f.carPerformanceIndex) : '--'}
        />
        <Stat label="Car ID" value={f && f.carOrdinal > 0 ? String(f.carOrdinal) : '--'} />
        <Stat label="Cyl." value={f && f.numCylinders > 0 ? String(f.numCylinders) : '--'} />
      </div>
      <div className="mt-1 rounded bg-cockpit-bg p-1.5">
        <div className="text-[9px] uppercase tracking-wide text-slate-500">Make / model</div>
        <div className="truncate text-xs font-semibold text-slate-100" title={carName}>
          {carName}
        </div>
      </div>
    </Panel>
  );
}
