import { useState } from 'react';
import { useTelemetryStore } from '../../state/telemetryStore';
import { Panel } from '../common/Panel';
import { tempColor } from './tireColors';

function Spring() {
  return (
    <svg viewBox="0 0 16 10" width="16" height="10" aria-hidden className="shrink-0 text-slate-400">
      <path
        d="M0 5 L2 1 L4 9 L6 1 L8 9 L10 1 L12 9 L14 1 L16 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface CarSilhouetteProps {
  tempFl: number;
  tempFr: number;
  tempRl: number;
  tempRr: number;
}

function Wheel({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <rect
      x={x}
      y={y}
      width="14"
      height="34"
      rx="4"
      fill={color}
      stroke="#0a0c10"
      strokeWidth="1.5"
    />
  );
}

function CarSilhouette({ tempFl, tempFr, tempRl, tempRr }: CarSilhouetteProps) {
  return (
    <svg
      viewBox="0 0 80 180"
      className="mx-auto h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <rect
        x="10"
        y="8"
        width="60"
        height="164"
        rx="22"
        fill="#0a0c10"
        stroke="#94a3b8"
        strokeWidth="2"
      />
      <path d="M18 46 L62 46 L56 76 L24 76 Z" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.25" />
      <path
        d="M24 110 L56 110 L62 140 L18 140 Z"
        fill="#1e293b"
        stroke="#94a3b8"
        strokeWidth="1.25"
      />
      <line x1="40" y1="80" x2="40" y2="106" stroke="#475569" strokeWidth="1" />
      <circle cx="40" cy="93" r="2.5" fill="#475569" />
      <Wheel x={1} y={30} color={tempColor(tempFl)} />
      <Wheel x={65} y={30} color={tempColor(tempFr)} />
      <Wheel x={1} y={118} color={tempColor(tempRl)} />
      <Wheel x={65} y={118} color={tempColor(tempRr)} />
    </svg>
  );
}

interface WheelProps {
  label: string;
  temp: number;
  travel: number;
  slip: number;
  wear?: number;
  align: 'left' | 'right';
  tempUnit: 'C' | 'F'; // Adicionado para receber a unidade selecionada
}

function WheelReadout({ label, temp, travel, slip, wear, align, tempUnit }: WheelProps) {
  const t = Math.min(1, Math.max(0, travel));
  const slipPct = Math.min(100, Math.max(0, slip * 100));
  const wearPct = wear !== undefined ? Math.round(wear * 100) : null;
  const isRight = align === 'right';

  // Faz o cálculo dinâmico baseado no botão selecionado
  const formatTemp = (farenheit: number) => {
    if (farenheit <= 0) return '--';
    if (tempUnit === 'C') {
      return `${((farenheit - 32) * (5 / 9)).toFixed(0)}°C`;
    }
    return `${farenheit.toFixed(0)}°F`;
  };

  return (
    <div
      className={`flex flex-col justify-center gap-1.5 rounded-md bg-cockpit-bg/60 p-2 ${
        isRight ? 'items-end text-right' : 'items-start text-left'
      }`}
    >
      <div
        className={`flex w-full items-baseline gap-2 ${isRight ? 'justify-end' : 'justify-start'}`}
      >
        {!isRight && (
          <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        )}
        <span
          className="font-mono text-2xl font-bold leading-none"
          style={{ color: tempColor(temp), fontVariantNumeric: 'tabular-nums' }}
        >
          {formatTemp(temp)}
        </span>
        {isRight && (
          <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        )}
      </div>

      <div className={`flex w-full items-center gap-1.5 ${isRight ? 'flex-row-reverse' : ''}`}>
        <Spring />
        <div className="relative h-2 flex-1 overflow-hidden rounded bg-cockpit-edge">
          <div
            className="absolute inset-y-0 left-0 bg-sky-500/80 transition-[width] duration-100"
            style={{ width: `${t * 100}%` }}
          />
        </div>
        <span className="w-9 font-mono text-[10px] tabular-nums text-slate-400">
          {Math.round(t * 100)}%
        </span>
      </div>

      <div
        className={`flex w-full items-center gap-2 text-[9px] ${isRight ? 'flex-row-reverse' : ''}`}
      >
        <div className="relative h-1 w-12 overflow-hidden rounded bg-cockpit-edge">
          <div
            className="absolute inset-y-0 left-0 bg-cockpit-accent"
            style={{ width: `${slipPct}%` }}
          />
        </div>
        <span className="font-mono text-slate-500">slip {slip.toFixed(2)}</span>
        {wearPct !== null && (
          <span className="rounded bg-cockpit-edge px-1.5 py-0.5 font-mono text-slate-300">
            wear {wearPct}%
          </span>
        )}
      </div>
    </div>
  );
}

export function TireSuspensionPanel() {
  const f = useTelemetryStore((s) => s.frame);
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C'); // Estado para controlar a unidade

  return (
    <Panel title="Tires & Suspension" className="flex h-full flex-col">
      {/* Botões Seletores de Temperatura */}
      <div className="flex justify-end gap-1 mb-2 px-1">
        <button
          onClick={() => setTempUnit('C')}
          className={`px-2.5 py-0.5 text-[10px] rounded font-mono font-bold transition-all ${
            tempUnit === 'C'
              ? 'bg-cockpit-accent text-white shadow-sm'
              : 'bg-cockpit-edge/40 text-slate-400 hover:bg-cockpit-edge'
          }`}
        >
          °C
        </button>
        <button
          onClick={() => setTempUnit('F')}
          className={`px-2.5 py-0.5 text-[10px] rounded font-mono font-bold transition-all ${
            tempUnit === 'F'
              ? 'bg-cockpit-accent text-white shadow-sm'
              : 'bg-cockpit-edge/40 text-slate-400 hover:bg-cockpit-edge'
          }`}
        >
          °F
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 items-center gap-2 lg:grid-cols-[1fr_88px_1fr] lg:grid-rows-2">
        <WheelReadout
          align="right"
          label="FL"
          temp={f?.tireTempFl ?? 0}
          travel={f?.normalizedSuspensionTravelFl ?? 0}
          slip={f?.tireCombinedSlipFl ?? 0}
          wear={f?.tireWearFl}
          tempUnit={tempUnit}
        />
        <div className="hidden lg:col-start-2 lg:row-span-2 lg:block lg:self-stretch lg:py-1">
          <CarSilhouette
            tempFl={f?.tireTempFl ?? 0}
            tempFr={f?.tireTempFr ?? 0}
            tempRl={f?.tireTempRl ?? 0}
            tempRr={f?.tireTempRr ?? 0}
          />
        </div>
        <WheelReadout
          align="left"
          label="FR"
          temp={f?.tireTempFr ?? 0}
          travel={f?.normalizedSuspensionTravelFr ?? 0}
          slip={f?.tireCombinedSlipFr ?? 0}
          wear={f?.tireWearFr}
          tempUnit={tempUnit}
        />
        <WheelReadout
          align="right"
          label="RL"
          temp={f?.tireTempRl ?? 0}
          travel={f?.normalizedSuspensionTravelRl ?? 0}
          slip={f?.tireCombinedSlipRl ?? 0}
          wear={f?.tireWearRl}
          tempUnit={tempUnit}
        />
        <WheelReadout
          align="left"
          label="RR"
          temp={f?.tireTempRr ?? 0}
          travel={f?.normalizedSuspensionTravelRr ?? 0}
          slip={f?.tireCombinedSlipRr ?? 0}
          wear={f?.tireWearRr}
          tempUnit={tempUnit}
        />
      </div>
    </Panel>
  );
}