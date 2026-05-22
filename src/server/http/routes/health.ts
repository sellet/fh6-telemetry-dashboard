import type { FastifyInstance } from 'fastify';

const startedAt = Date.now();

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/api/health', () => ({
    status: 'ok',
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  }));
}
