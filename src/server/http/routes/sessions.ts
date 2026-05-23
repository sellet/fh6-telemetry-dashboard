import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config';
import type { SessionStore } from '../../session/sessionStore';
import type { SessionManager } from '../../session/sessionManager';

export function registerSessionRoutes(
  app: FastifyInstance,
  config: Config,
  store: SessionStore,
  manager: SessionManager,
): void {
  app.get('/api/sessions', () => store.list(config.maxSessionListItems));

  // End the current recording immediately; the next telemetry frame starts a
  // fresh session. No-op when nothing is recording.
  app.post('/api/sessions/cut', async () => {
    const sessionId = await manager.cut();
    return { cut: sessionId !== null, sessionId };
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const manifest = await store.getManifest(req.params.id);
    if (!manifest) {
      return reply.code(404).send({ error: 'session not found' });
    }
    return manifest;
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
