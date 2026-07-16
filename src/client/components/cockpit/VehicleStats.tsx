import { useState, useEffect } from 'react';
import { useTelemetryStore } from '../../state/telemetryStore';
import { Panel } from '../common/Panel';
import { CAR_CLASSES, DRIVETRAIN_TYPES } from '../../../../shared/telemetry';
import { carDisplayName } from '../../lib/format';

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded bg-cockpit-bg p-1.5">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="truncate whitespace-nowrap font-mono text-sm font-semibold text-slate-100 flex items-center min-h-[20px]">
        {value}
      </div>
    </div>
  );
}

export function VehicleStats() {
  const f = useTelemetryStore((s) => s.frame);
  
  // HP definido como padrão inicial da interface
  const [powerUnit, setPowerUnit] = useState<'kW' | 'HP'>('HP');
  
  const [dynamicCars, setDynamicCars] = useState<Record<number, string>>({});
  const [isUpdatingCars, setIsUpdatingCars] = useState(false);

  useEffect(() => {
    const savedCars = localStorage.getItem('fh6-dynamic-cars');
    if (savedCars) {
      try {
        setDynamicCars(JSON.parse(savedCars));
      } catch (e) {
        console.error("Error parsing saved cars", e);
      }
    }
  }, []);

  const carClass = f ? (CAR_CLASSES[f.carClass] ?? `#${f.carClass}`) : '--';
  const drivetrain = f ? (DRIVETRAIN_TYPES[f.drivetrainType] ?? '--') : '--';

  const getPowerValue = () => {
    if (!f) return '--';
    if (powerUnit === 'kW') {
      return `${(f.power / 1000).toFixed(0)} kW`;
    }
    return `${(f.power / 745.7).toFixed(0)} HP`;
  };

  const fetchLatestCars = async () => {
    setIsUpdatingCars(true);
    try {
      const timestamp = new Date().getTime();
      const response = await fetch(`https://gist.githubusercontent.com/HDR/0659d1717bc61504bf83750628963f4f/raw?t=${timestamp}`);
      
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      
      const normalizedCars: Record<number, string> = {};
      
      if (Array.isArray(data)) {
        for (const item of data) {
          const id = item.id ?? item.Ordinal ?? item.ordinal ?? item.Id ?? item.ID;
          if (id !== undefined && /^\d+$/.test(String(id))) {
            const make = item.make ?? item.Make ?? '';
            const model = item.model ?? item.Model ?? '';
            const year = item.year ?? item.Year ?? '';
            normalizedCars[parseInt(String(id))] = `${year} ${make} ${model}`.replace(/\s+/g, ' ').trim();
          }
        }
      } else if (typeof data === 'object' && data !== null) {
        const targetData = (data.Cars && typeof data.Cars === 'object' && !Array.isArray(data.Cars)) ? data.Cars : data;
        
        for (const [key, val] of Object.entries(targetData)) {
          let carId = null;
          let carName = "";

          if (/^\d+$/.test(String(key).trim())) {
            carId = parseInt(key);
            carName = String(val);
          } else if (/^\d+$/.test(String(val).trim())) {
            carId = parseInt(String(val));
            carName = key;
          }

          if (carId !== null) {
            normalizedCars[carId] = carName.replace(/\s+/g, ' ').trim();
          }
        }
      }
      
      setDynamicCars(normalizedCars);
      localStorage.setItem('fh6-dynamic-cars', JSON.stringify(normalizedCars));
      
      const totalCars = Object.keys(normalizedCars).length;
      alert(`Success! Updated list with ${totalCars} cars from GitHub.`);
      
    } catch (error) {
      console.error('Error fetching car list from Gist', error);
      alert('Could not update the list at this time. Check console for details.');
    } finally {
      setIsUpdatingCars(false);
    }
  };

  let finalCarName = '--';
  if (f && f.carOrdinal > 0) {
    if (dynamicCars[f.carOrdinal]) {
      finalCarName = dynamicCars[f.carOrdinal];
    } else {
      finalCarName = carDisplayName(f.carOrdinal);
    }
  }

  // Renderiza o quadrado de cor em volta da Classe do Carro
  const renderClassBadge = (cClass: string) => {
    if (cClass === '--' || cClass.startsWith('#')) return cClass;

    const getColor = (c: string) => {
      switch (c) {
        case 'E': return 'bg-slate-500 text-white';
        case 'D': return 'bg-sky-400 text-white';
        case 'C': return 'bg-yellow-400 text-black';
        case 'B': return 'bg-orange-500 text-white';
        case 'A': return 'bg-red-600 text-white';
        case 'S1': return 'bg-purple-600 text-white';
        case 'S2': return 'bg-blue-800 text-white';
        case 'R': return 'bg-pink-600 text-white';
        case 'X': return 'bg-green-500 text-white';
        default: return 'bg-cockpit-edge text-slate-300';
      }
    };

    return (
      <span className={`inline-block text-center min-w-[24px] px-1 py-[3px] rounded text-[11px] leading-none font-extrabold ${getColor(cClass)}`}>
        {cClass}
      </span>
    );
  };

  // Renderiza o quadrado de cor em volta do tipo de Tração (Drive)
  const renderDrivetrainBadge = (dt: string) => {
    if (dt === '--') return dt;

    const getColor = (d: string) => {
      switch (d.toUpperCase()) {
        case 'AWD': return 'bg-green-500 text-white'; // Mesmo verde da classe X
        case 'RWD': return 'bg-red-600 text-white';   // Mesmo vermelho da classe A
        case 'FWD': return 'bg-sky-400 text-white';   // Mesmo azul claro da classe D
        default: return 'bg-cockpit-edge text-slate-300';
      }
    };

    return (
      <span className={`inline-block text-center min-w-[36px] px-1.5 py-[3px] rounded text-[11px] leading-none font-extrabold ${getColor(dt)}`}>
        {dt}
      </span>
    );
  };

  return (
    <Panel title="Vehicle">
      <div className="flex justify-end gap-1 mb-2">
        <button
          onClick={() => setPowerUnit('kW')}
          className={`px-2.5 py-0.5 text-[10px] rounded font-mono font-bold transition-all ${
            powerUnit === 'kW'
              ? 'bg-cockpit-accent text-white shadow-sm'
              : 'bg-cockpit-edge/40 text-slate-400 hover:bg-cockpit-edge'
          }`}
        >
          kW
        </button>
        <button
          onClick={() => setPowerUnit('HP')}
          className={`px-2.5 py-0.5 text-[10px] rounded font-mono font-bold transition-all ${
            powerUnit === 'HP'
              ? 'bg-cockpit-accent text-white shadow-sm'
              : 'bg-cockpit-edge/40 text-slate-400 hover:bg-cockpit-edge'
          }`}
        >
          HP
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-5">
        <Stat label="Power" value={getPowerValue()} />
        <Stat label="Torque" value={f ? `${f.torque.toFixed(0)} Nm` : '--'} />
        <Stat label="Boost" value={f ? f.boost.toFixed(1) : '--'} />
        <Stat label="Fuel" value={f ? `${(f.fuel * 100).toFixed(0)}%` : '--'} />
        
        <Stat label="Class" value={renderClassBadge(carClass)} />
        <Stat label="Drive" value={renderDrivetrainBadge(drivetrain)} />
        
        <Stat
          label="PI"
          value={f && f.carPerformanceIndex > 0 ? String(f.carPerformanceIndex) : '--'}
        />
        <Stat label="Car ID" value={f && f.carOrdinal > 0 ? String(f.carOrdinal) : '--'} />
        <Stat label="Cyl." value={f && f.numCylinders > 0 ? String(f.numCylinders) : '--'} />
      </div>

      <div className="mt-1 rounded bg-cockpit-bg p-1.5 flex flex-col justify-center relative">
        <div className="flex justify-between items-center mb-0.5">
          <div className="text-[9px] uppercase tracking-wide text-slate-500">Make / model</div>
          
          <button
            onClick={fetchLatestCars}
            disabled={isUpdatingCars}
            className="px-2 py-0.5 text-[9px] rounded font-semibold bg-cockpit-edge/40 text-slate-400 hover:bg-cockpit-edge hover:text-white transition-all disabled:opacity-50"
            title="Sync new cars from GitHub"
          >
            {isUpdatingCars ? 'Downloading...' : '⟳ Update List'}
          </button>
        </div>
        <div className="truncate text-xs font-semibold text-slate-100" title={finalCarName}>
          {finalCarName}
        </div>
      </div>
    </Panel>
  );
}