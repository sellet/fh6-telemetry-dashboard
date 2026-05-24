import type { HealthResponse, ServerStatus } from '../../../shared/api';
import type { SessionManifest, SessionMetaPatch, SessionSummary } from '../../../shared/session';
import type { MapSettings } from '../../../shared/mapDefaults';

export type { MapSettings };

export interface StorageInfo {
  totalBytes: number;
  sessionCount: number;
  byKind: { race: number; freeRoam: number };
  largest: Array<{ id: string; bytes: number }>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return (await res.json()) as T;
}

async function patchSession(id: string, patch: SessionMetaPatch): Promise<SessionManifest> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`failed to update session (${res.status})`);
  return (await res.json()) as SessionManifest;
}

export const api = {
  health: () => getJson<HealthResponse>('/api/health'),
  status: () => getJson<ServerStatus>('/api/status'),
  sessions: () => getJson<SessionSummary[]>('/api/sessions'),
  session: (id: string) => getJson<SessionManifest>(`/api/sessions/${encodeURIComponent(id)}`),
  settings: () => getJson<MapSettings>('/api/settings'),

  async deleteSession(id: string): Promise<void> {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`failed to delete session (${res.status})`);
  },

  async saveSettings(settings: MapSettings): Promise<void> {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error(`failed to save settings (${res.status})`);
  },

  async downloadMapTiles(): Promise<void> {
    const res = await fetch('/api/maptiles/download', { method: 'POST' });
    if (!res.ok) throw new Error(`failed to start tile download (${res.status})`);
  },

  async refreshMapTiles(): Promise<void> {
    const res = await fetch('/api/maptiles/refresh', { method: 'POST' });
    if (!res.ok) throw new Error(`failed to refresh tiles (${res.status})`);
  },

  async cutRecording(): Promise<void> {
    const res = await fetch('/api/sessions/cut', { method: 'POST' });
    if (!res.ok) throw new Error(`failed to cut recording (${res.status})`);
  },

  updateSession: (id: string, patch: SessionMetaPatch): Promise<SessionManifest> =>
    patchSession(id, patch),

  renameSession: (id: string, name: string): Promise<SessionManifest> => patchSession(id, { name }),

  storage: () => getJson<StorageInfo>('/api/storage'),

  async mergeSessions(ids: string[], name?: string): Promise<SessionManifest> {
    const res = await fetch('/api/sessions/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, name }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`failed to merge sessions (${res.status}) ${text}`);
    }
    return (await res.json()) as SessionManifest;
  },
};
