import { useMemo, useState } from 'react';
import { useTelemetryStore } from '../../state/telemetryStore';
import { useSessions } from '../../hooks/useSessions';
import { api } from '../../lib/api';
import { SessionCard } from './SessionCard';

interface SessionBrowserProps {
  open: boolean;
  onClose: () => void;
}

export function SessionBrowser({ open, onClose }: SessionBrowserProps) {
  const send = useTelemetryStore((s) => s.send);
  const allowDelete = useTelemetryStore((s) => s.status?.allowDeleteSessions ?? false);
  const { sessions, loading, error, reload } = useSessions(open);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const selectedIds = useMemo(() => {
    if (selected.size === 0) return [] as string[];
    const knownIds = new Set(sessions.map((s) => s.id));
    return [...selected].filter((id) => knownIds.has(id));
  }, [selected, sessions]);

  if (!open) return null;

  const replay = (id: string): void => {
    send({ type: 'replay.start', sessionId: id, speed: 1 });
    onClose();
  };

  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = (): void => setSelected(new Set());

  const remove = async (id: string): Promise<void> => {
    try {
      await api.deleteSession(id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await reload();
    } catch (err) {
      console.error(err);
    }
  };

  const rename = async (id: string, name: string): Promise<void> => {
    await api.renameSession(id, name);
    await reload();
  };

  const bulkDelete = async (): Promise<void> => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} session(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      for (const id of selectedIds) {
        try {
          await api.deleteSession(id);
        } catch (err) {
          console.error(`failed to delete ${id}`, err);
        }
      }
      clearSelection();
      await reload();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkMerge = async (): Promise<void> => {
    if (selectedIds.length < 2) return;
    const name =
      window.prompt(
        `Merge ${selectedIds.length} sessions into one — the originals will be deleted. ` +
          'Optional name for the merged session:',
        '',
      ) ?? '';
    // Cancel returns null; window.prompt returning null aborts.
    setBulkBusy(true);
    try {
      await api.mergeSessions(selectedIds, name);
      clearSelection();
      await reload();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-cockpit-edge bg-cockpit-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-cockpit-edge p-4">
          <h2 className="text-lg font-semibold text-slate-100">
            Recorded Sessions
            {sessions.length > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-500">({sessions.length})</span>
            )}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => void reload()}
              className="rounded border border-cockpit-edge px-3 py-1 text-sm text-slate-300 hover:bg-cockpit-bg"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="rounded border border-cockpit-edge px-3 py-1 text-sm text-slate-300 hover:bg-cockpit-bg"
            >
              Close
            </button>
          </div>
        </div>

        {allowDelete && selectedIds.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-cockpit-edge bg-cockpit-bg/50 px-4 py-2 text-sm">
            <span className="text-slate-300">
              {selectedIds.length} selected
              <button
                onClick={clearSelection}
                className="ml-2 text-xs text-slate-500 underline hover:text-slate-200"
              >
                clear
              </button>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void bulkMerge()}
                disabled={bulkBusy || selectedIds.length < 2}
                title={
                  selectedIds.length < 2
                    ? 'Select at least two sessions to merge'
                    : 'Concatenate the selected sessions, then delete the originals'
                }
                className="rounded bg-cockpit-accent px-3 py-1 text-sm font-semibold text-black hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Merge {selectedIds.length}
              </button>
              <button
                onClick={() => void bulkDelete()}
                disabled={bulkBusy}
                className="rounded border border-red-500/40 px-3 py-1 text-sm text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete {selectedIds.length}
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-3 overflow-y-auto p-4">
          {loading && <p className="text-center text-slate-500">Loading…</p>}
          {error && <p className="text-center text-red-400">{error}</p>}
          {!loading && !error && sessions.length === 0 && (
            <p className="py-8 text-center text-slate-500">
              No sessions recorded yet. Start driving in Forza Horizon 6.
            </p>
          )}
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              allowDelete={allowDelete}
              selectable={allowDelete}
              selected={selected.has(session.id)}
              onToggleSelect={toggleSelect}
              onReplay={replay}
              onDelete={(id) => void remove(id)}
              onRename={rename}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
