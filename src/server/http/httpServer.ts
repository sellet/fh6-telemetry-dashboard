import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from '../logger';
import { registerHealthRoutes } from './routes/health';

export function createHttpServer(logger: Logger): FastifyInstance {
  // Fastify types the instance's logger generic to pino's Logger, which
  // diverges from FastifyBaseLogger over `msgPrefix`; erase that mismatch so
  // the rest of the app works with a plain FastifyInstance.
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: true,
  }) as unknown as FastifyInstance;

  registerHealthRoutes(app);

  return app;
}
