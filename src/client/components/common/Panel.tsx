import type { ReactNode } from 'react';

export type PanelTone = 'default' | 'race';

interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
  /** Highlights the panel when the car is on track (isRaceOn=1). */
  tone?: PanelTone;
}

const TONES: Record<PanelTone, string> = {
  default: 'border-cockpit-edge bg-cockpit-panel',
  race: 'border-red-500/40 bg-red-950/40 ring-1 ring-red-500/20',
};

/** Standard dark cockpit card with an optional section title. */
export function Panel({ title, children, className, tone = 'default' }: PanelProps) {
  return (
    <section
      className={`rounded-lg border p-2 transition-colors ${TONES[tone]} ${className ?? ''}`}
    >
      {title && (
        <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
