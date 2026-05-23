import { useState } from 'react';
import { useTelemetryStore } from '../state/telemetryStore';
import { api } from '../lib/api';
import { ConnectionBadge } from './common/ConnectionBadge';

interface TopBarProps {
  onOpenSessions: () => void;
}

export function TopBar({ onOpenSessions }: TopBarProps) {
  const mode = useTelemetryStore((s) => s.mode);
  const recording = useTelemetryStore((s) => s.status?.recording.active ?? false);
  const replaySessionId = useTelemetryStore((s) => s.replay.sessionId);
  const [cutting, setCutting] = useState(false);

  const handleCut = async (): Promise<void> => {
    setCutting(true);
    try {
      await api.cutRecording();
    } catch (err) {
      console.error(err);
    } finally {
      setCutting(false);
    }
  };

  return (
    <header className="flex items-center justify-between border-b border-cockpit-edge bg-cockpit-panel px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tracking-wide text-slate-100">
          FH6 <span className="text-cockpit-accent">TELEMETRY</span>
        </span>
        {mode === 'replay' ? (
          <span className="flex items-center gap-1.5 rounded bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-300">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            REPLAY
            {replaySessionId && (
              <span className="font-mono font-normal text-sky-400/70">{replaySessionId}</span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-300">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            LIVE
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <a
          href="https://github.com/acaranta/fh6-telemetry-dashboard"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
          title="View source on GitHub"
          className="text-slate-400 transition-colors hover:text-slate-100"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
            />
          </svg>
        </a>
        {recording && (
          <>
            <span className="flex items-center gap-1.5 text-xs text-red-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              Recording
            </span>
            <button
              onClick={() => void handleCut()}
              disabled={cutting}
              title="End the current recording; the next frame starts a fresh session."
              className="rounded border border-cockpit-edge px-2 py-1 text-xs text-slate-200 hover:bg-cockpit-bg disabled:cursor-not-allowed disabled:opacity-40"
            >
              ✂ Cut
            </button>
          </>
        )}
        <ConnectionBadge />
        <button
          onClick={onOpenSessions}
          className="rounded border border-cockpit-edge px-3 py-1 text-sm text-slate-200 hover:bg-cockpit-bg"
        >
          Sessions
        </button>
      </div>
    </header>
  );
}
