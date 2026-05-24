import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config';
import type { Logger } from '../../logger';
import type { SessionStore } from '../../session/sessionStore';
import type { SessionManager } from '../../session/sessionManager';
import { mergeSessions } from '../../session/mergeSessions';
import type { SessionMetaPatch } from '../../../../shared/session';

const ALLOWED_PATCH_KEYS = new Set(['name', 'tags', 'notes']);

export function registerSessionRoutes(
  app: FastifyInstance,
  config: Config,
  logger: Logger,
  store: SessionStore,
  manager: SessionManager,
): void {
  app.get('/api/sessions', () => store.list(config.maxSessionListItems));

  app.get('/api/storage', () => store.storage());

  // End the current recording immediately; the next telemetry frame starts a
  // fresh session. No-op when nothing is recording.
  app.post('/api/sessions/cut', async () => {
    const sessionId = await manager.cut();
    return { cut: sessionId !== null, sessionId };
  });

  // Merge several completed sessions into a single new one, then delete the
  // sources. Gated by ALLOW_DELETE_SESSIONS because the merge is destructive.
  app.post<{ Body: { ids?: unknown; name?: unknown } }>(
    '/api/sessions/merge',
    async (req, reply) => {
      if (!config.allowDeleteSessions) {
        return reply.code(403).send({ error: 'session merge is disabled' });
      }
      const body = req.body ?? {};
      const ids = Array.isArray(body.ids)
        ? body.ids.filter((v): v is string => typeof v === 'string')
        : [];
      if (ids.length < 2) {
        return reply.code(400).send({ error: 'need at least two session ids to merge' });
      }
      const name = typeof body.name === 'string' ? body.name : undefined;
      try {
        const manifest = await mergeSessions(config, store, logger, ids, { name });
        return manifest;
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : 'merge failed' });
      }
    },
  );

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const manifest = await store.getManifest(req.params.id);
    if (!manifest) {
      return reply.code(404).send({ error: 'session not found' });
    }
    return manifest;
  });

  app.patch<{
    Params: { id: string };
    Body: { name?: unknown; tags?: unknown; notes?: unknown } | null;
  }>('/api/sessions/:id', async (req, reply) => {
    const body = req.body ?? {};
    for (const key of Object.keys(body)) {
      if (!ALLOWED_PATCH_KEYS.has(key)) {
        return reply.code(400).send({ error: `unknown field: ${key}` });
      }
    }
    const patch: SessionMetaPatch = {};
    if ('name' in body) {
      if (typeof body.name !== 'string') {
        return reply.code(400).send({ error: 'name must be a string' });
      }
      patch.name = body.name;
    }
    if ('tags' in body) {
      if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== 'string')) {
        return reply.code(400).send({ error: 'tags must be an array of strings' });
      }
      patch.tags = body.tags as string[];
    }
    if ('notes' in body) {
      if (typeof body.notes !== 'string') {
        return reply.code(400).send({ error: 'notes must be a string' });
      }
      patch.notes = body.notes;
    }
    const updated = await store.updateMeta(req.params.id, patch);
    if (!updated) {
      return reply.code(404).send({ error: 'session not found' });
    }
    return updated;
  });

  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    if (!config.allowDeleteSessions) {
      return reply.code(403).send({ error: 'session deletion is disabled' });
    }
    const deleted = await store.delete(req.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: 'session not found' });
    }
    return { deleted: req.params.id };
  });
}
