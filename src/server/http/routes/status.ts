import type { FastifyInstance } from 'fastify';
import type { ServerStatus } from '../../../../shared/api';

export function registerStatusRoutes(app: FastifyInstance, getStatus: () => ServerStatus): void {
  app.get('/api/status', () => getStatus());
}
