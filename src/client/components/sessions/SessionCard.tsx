import { useState } from 'react';
import type { SessionMetaPatch, SessionSummary } from '../../../../shared/session';
import { CAR_CLASSES } from '../../../../shared/telemetry';
import { carDisplayName, formatClockTime, formatDuration, MPS_TO_KMH } from '../../lib/format';

interface SessionCardProps {
  session: SessionSummary;
  allowDelete: boolean;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onReplay: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: SessionMetaPatch) => Promise<void>;
  onTagClick?: (tag: string) => void;
}

export function SessionCard({
  session,
  allowDelete,
  selectable,
  selected,
  onToggleSelect,
  onReplay,
  onDelete,
  onUpdate,
  onTagClick,
}: SessionCardProps) {
  const carClass = CAR_CLASSES[session.car.class] ?? `Class ${session.car.class}`;
  const topKmh = Math.round(session.topSpeed * MPS_TO_KMH);
  const carName = carDisplayName(session.car.ordinal);
  const isRace = session.kind === 'race';
  const tags = session.tags ?? [];
  const notes = session.notes ?? '';

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(session.name ?? '');
  const [draftNotes, setDraftNotes] = useState(notes);
  const [draftTags, setDraftTags] = useState(tags.join(', '));
  const [saving, setSaving] = useState(false);

  const openEditor = (): void => {
    setDraftName(session.name ?? '');
    setDraftNotes(notes);
    setDraftTags(tags.join(', '));
    setEditing(true);
  };
  const cancelEdit = (): void => setEditing(false);
  const commitEdit = async (): Promise<void> => {
    setSaving(true);
    try {
      const tagList = draftTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      await onUpdate(session.id, {
        name: draftName,
        notes: draftNotes,
        tags: tagList,
      });
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`rounded-lg border bg-cockpit-bg p-3 transition-colors ${
        selected ? 'border-cockpit-accent ring-1 ring-cockpit-accent/40' : 'border-cockpit-edge'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(session.id)}
              aria-label={`Select session ${session.id}`}
              className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-orange-500"
            />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100">{carName}</div>
            <div className="flex items-baseline gap-2 font-mono text-[11px] text-slate-500">
              <span>{session.id}</span>
              {!editing && session.name && (
                <span className="truncate font-sans text-xs text-cockpit-accent">
                  · {session.name}
                </span>
              )}
              {!editing && (
                <button
                  onClick={openEditor}
                  title="Edit name, notes and tags"
                  className="text-[11px] text-slate-500 hover:text-slate-200"
                >
                  ✎
                </button>
              )}
            </div>
            <div className="text-xs text-slate-500">{formatClockTime(session.startedAt)}</div>
            {!editing && tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => onTagClick?.(tag)}
                    title={onTagClick ? `Filter by tag "${tag}"` : tag}
                    className="rounded-full border border-cockpit-edge bg-cockpit-panel px-2 py-0.5 text-[10px] text-slate-300 hover:border-cockpit-accent hover:text-cockpit-accent"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {isRace && (
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300">
              Race
            </span>
          )}
          {session.hasIdleRanges && (
            <span
              title="This session contains stopped/idle spans"
              className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-200"
            >
              ⏸ idle
            </span>
          )}
          {session.status !== 'completed' && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
              {session.status}
            </span>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-2 grid gap-1.5 rounded border border-cockpit-edge bg-cockpit-panel p-2">
          <label className="text-[10px] uppercase text-slate-500">Name</label>
          <input
            type="text"
            autoFocus
            value={draftName}
            maxLength={64}
            placeholder="Session name"
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelEdit();
            }}
            className="rounded border border-cockpit-edge bg-cockpit-bg px-2 py-0.5 text-xs text-slate-100 focus:border-cockpit-accent focus:outline-none"
          />
          <label className="text-[10px] uppercase text-slate-500">Tags (comma separated)</label>
          <input
            type="text"
            value={draftTags}
            placeholder="e.g. baja, sunset, hot-lap"
            onChange={(e) => setDraftTags(e.target.value)}
            className="rounded border border-cockpit-edge bg-cockpit-bg px-2 py-0.5 text-xs text-slate-100 focus:border-cockpit-accent focus:outline-none"
          />
          <label className="text-[10px] uppercase text-slate-500">Notes</label>
          <textarea
            value={draftNotes}
            maxLength={2000}
            rows={3}
            placeholder="What was this session about?"
            onChange={(e) => setDraftNotes(e.target.value)}
            className="rounded border border-cockpit-edge bg-cockpit-bg px-2 py-1 text-xs text-slate-100 focus:border-cockpit-accent focus:outline-none"
          />
          <div className="mt-1 flex items-center gap-1.5">
            <button
              onClick={() => void commitEdit()}
              disabled={saving}
              className="rounded bg-cockpit-accent px-3 py-0.5 text-[11px] font-semibold text-black hover:bg-orange-400 disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={cancelEdit}
              className="rounded border border-cockpit-edge px-3 py-0.5 text-[11px] text-slate-300 hover:bg-cockpit-bg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
        <Metric label="Duration" value={formatDuration(session.durationMs)} />
        <Metric label="Frames" value={session.frameCount.toLocaleString()} />
        <Metric label="Top" value={`${topKmh}`} suffix="km/h" />
        <Metric label="Class" value={carClass} />
      </div>

      {!editing && notes && (
        <p className="mt-2 line-clamp-2 whitespace-pre-line text-xs text-slate-400" title={notes}>
          {notes}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onReplay(session.id)}
          className="flex-1 rounded bg-cockpit-accent px-3 py-1.5 text-sm font-semibold text-black hover:bg-orange-400"
        >
          Replay
        </button>
        {allowDelete && (
          <button
            onClick={() => onDelete(session.id)}
            className="rounded border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded bg-cockpit-panel p-1.5">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="font-mono text-sm font-semibold text-slate-100">
        {value}
        {suffix && <span className="ml-0.5 text-[10px] font-normal text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}
