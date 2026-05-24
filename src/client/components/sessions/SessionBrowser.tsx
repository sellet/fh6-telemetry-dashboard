import { useEffect, useMemo, useState } from 'react';
import { useTelemetryStore } from '../../state/telemetryStore';
import { useSessions } from '../../hooks/useSessions';
import { api, type StorageInfo } from '../../lib/api';
import type { SessionMetaPatch, SessionSummary } from '../../../../shared/session';
import { carDisplayName } from '../../lib/format';
import { SessionCard } from './SessionCard';

interface SessionBrowserProps {
  open: boolean;
  onClose: () => void;
}

type SortKey = 'newest' | 'oldest' | 'longest' | 'topSpeed';
type KindFilter = 'all' | 'race' | 'free-roam';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  longest: 'Longest',
  topSpeed: 'Top speed',
};

function compareSessions(a: SessionSummary, b: SessionSummary, sort: SortKey): number {
  switch (sort) {
    case 'oldest':
      return a.startedAt.localeCompare(b.startedAt);
    case 'longest':
      return b.durationMs - a.durationMs;
    case 'topSpeed':
      return b.topSpeed - a.topSpeed;
    case 'newest':
    default:
      return b.startedAt.localeCompare(a.startedAt);
  }
}

function matchesSearch(session: SessionSummary, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (session.name?.toLowerCase().includes(needle)) return true;
  if (session.notes?.toLowerCase().includes(needle)) return true;
  if (session.tags?.some((t) => t.includes(needle))) return true;
  if (carDisplayName(session.car.ordinal).toLowerCase().includes(needle)) return true;
  if (session.id.toLowerCase().includes(needle)) return true;
  return false;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function SessionBrowser({ open, onClose }: SessionBrowserProps) {
  const send = useTelemetryStore((s) => s.send);
  const allowDelete = useTelemetryStore((s) => s.status?.allowDeleteSessions ?? false);
  const { sessions, loading, error, reload } = useSessions(open);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [kind, setKind] = useState<KindFilter>('all');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [showStorage, setShowStorage] = useState(false);
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) (s.tags ?? []).forEach((t) => set.add(t));
    return [...set].sort();
  }, [sessions]);

  const visibleSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions
      .filter((s) => matchesSearch(s, q))
      .filter((s) => {
        if (kind === 'all') return true;
        const k = s.kind ?? 'free-roam';
        return k === kind;
      })
      .filter((s) => {
        if (activeTags.size === 0) return true;
        const tags = new Set(s.tags ?? []);
        for (const t of activeTags) if (!tags.has(t)) return false;
        return true;
      })
      .slice()
      .sort((a, b) => compareSessions(a, b, sort));
  }, [sessions, search, sort, kind, activeTags]);

  const selectedIds = useMemo(() => {
    if (selected.size === 0) return [] as string[];
    const knownIds = new Set(sessions.map((s) => s.id));
    return [...selected].filter((id) => knownIds.has(id));
  }, [selected, sessions]);

  useEffect(() => {
    if (!showStorage || !open) return;
    let cancelled = false;
    void api
      .storage()
      .then((info) => {
        if (!cancelled) setStorage(info);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [showStorage, open, sessions.length]);

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

  const toggleTagFilter = (tag: string): void => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

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

  const update = async (id: string, patch: SessionMetaPatch): Promise<void> => {
    await api.updateSession(id, patch);
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

  const deleteOldestFreeRoam = async (): Promise<void> => {
    const candidates = sessions
      .filter((s) => (s.kind ?? 'free-roam') === 'free-roam')
      .slice()
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .slice(0, 10);
    if (candidates.length === 0) return;
    if (
      !window.confirm(
        `Delete the ${candidates.length} oldest free-roam session(s)? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      for (const s of candidates) {
        try {
          await api.deleteSession(s.id);
        } catch (err) {
          console.error(`failed to delete ${s.id}`, err);
        }
      }
      await reload();
      try {
        setStorage(await api.storage());
      } catch (err) {
        console.error(err);
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const filtered = visibleSessions.length !== sessions.length;

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
              <span className="ml-2 text-xs font-normal text-slate-500">
                ({filtered ? `${visibleSessions.length} / ${sessions.length}` : sessions.length})
              </span>
            )}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowStorage((v) => !v)}
              className={`rounded border px-3 py-1 text-sm hover:bg-cockpit-bg ${
                showStorage
                  ? 'border-cockpit-accent text-cockpit-accent'
                  : 'border-cockpit-edge text-slate-300'
              }`}
              title="Show disk usage"
            >
              Disk
            </button>
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

        <div className="flex flex-wrap items-center gap-2 border-b border-cockpit-edge bg-cockpit-bg/40 px-4 py-2 text-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, notes, car, tag…"
            className="min-w-0 flex-1 rounded border border-cockpit-edge bg-cockpit-bg px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cockpit-accent focus:outline-none"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-cockpit-edge bg-cockpit-bg px-2 py-1 text-xs text-slate-200 focus:border-cockpit-accent focus:outline-none"
            aria-label="Sort sessions"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
          {(['all', 'race', 'free-roam'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                kind === k
                  ? 'border-cockpit-accent bg-cockpit-accent/20 text-cockpit-accent'
                  : 'border-cockpit-edge text-slate-400 hover:text-slate-200'
              }`}
            >
              {k === 'free-roam' ? 'Free-roam' : k === 'race' ? 'Race' : 'All'}
            </button>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 border-b border-cockpit-edge bg-cockpit-bg/20 px-4 py-2">
            <span className="mr-1 text-[10px] uppercase text-slate-500">Tags</span>
            {allTags.map((tag) => {
              const active = activeTags.has(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    active
                      ? 'border-cockpit-accent bg-cockpit-accent/20 text-cockpit-accent'
                      : 'border-cockpit-edge text-slate-400 hover:text-slate-200'
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
            {activeTags.size > 0 && (
              <button
                onClick={() => setActiveTags(new Set())}
                className="ml-1 text-[10px] text-slate-500 underline hover:text-slate-200"
              >
                clear
              </button>
            )}
          </div>
        )}

        {showStorage && (
          <div className="border-b border-cockpit-edge bg-cockpit-bg/40 px-4 py-3 text-xs text-slate-300">
            {storage ? (
              <>
                <div className="flex flex-wrap items-baseline gap-4">
                  <span>
                    Total:{' '}
                    <strong className="text-slate-100">{formatBytes(storage.totalBytes)}</strong>
                  </span>
                  <span>
                    Sessions: <strong className="text-slate-100">{storage.sessionCount}</strong>
                  </span>
                  <span className="text-slate-400">
                    Race: {storage.byKind.race} · Free-roam: {storage.byKind.freeRoam}
                  </span>
                  {allowDelete && storage.byKind.freeRoam > 0 && (
                    <button
                      onClick={() => void deleteOldestFreeRoam()}
                      disabled={bulkBusy}
                      className="ml-auto rounded border border-red-500/40 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                    >
                      Delete oldest 10 free-roam
                    </button>
                  )}
                </div>
                {storage.largest.length > 0 && (
                  <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-slate-400">
                    {storage.largest.map((s) => (
                      <li key={s.id} className="flex justify-between gap-3">
                        <span className="truncate">{s.id}</span>
                        <span>{formatBytes(s.bytes)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <span className="text-slate-500">Loading disk usage…</span>
            )}
          </div>
        )}

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
          {!loading && !error && sessions.length > 0 && visibleSessions.length === 0 && (
            <p className="py-8 text-center text-slate-500">
              No sessions match the current filters.
            </p>
          )}
          {visibleSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              allowDelete={allowDelete}
              selectable={allowDelete}
              selected={selected.has(session.id)}
              onToggleSelect={toggleSelect}
              onReplay={replay}
              onDelete={(id) => void remove(id)}
              onUpdate={update}
              onTagClick={toggleTagFilter}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
