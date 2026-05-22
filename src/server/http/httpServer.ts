import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from '../config';
import type { Logger } from '../logger';
import type { ServerStatus } from '../../../shared/api';
import type { SessionStore } from '../session/sessionStore';
import { registerHealthRoutes } from './routes/health';
import { registerStatusRoutes } from './routes/status';
import { registerSessionRoutes } from './routes/sessions';

export interface HttpDeps {
  getStatus: () => ServerStatus;
  sessionStore: SessionStore;
}

export function createHttpServer(config: Config, logger: Logger, deps: HttpDeps): FastifyInstance {
  // Fastify types the instance's logger generic to pino's Logger, which
  // diverges from FastifyBaseLogger over `msgPrefix`; erase that mismatch so
  // the rest of the app works with a plain FastifyInstance.
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: true,
  }) as unknown as FastifyInstance;

  registerHealthRoutes(app);
  registerStatusRoutes(app, deps.getStatus);
  registerSessionRoutes(app, config, deps.sessionStore);

  // Map tiles are downloaded into the data volume at runtime (M7).
  app.register(fastifyStatic, {
    root: config.mapTilesDir,
    prefix: '/maptiles/',
    decorateReply: false,
  });

  const clientDir = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.register(fastifyStatic, { root: clientDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/ws')) {
        return reply.type('text/html').sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not found' });
    });
    logger.info(`serving client build from ${clientDir}`);
  } else {
    app.get('/', (_req, reply) => {
      reply
        .type('text/plain')
        .send('FH6 Telemetry Dashboard — client not built. Run: npm run build:client');
    });
    logger.warn('client build not found — serving a placeholder at /');
  }

  return app;
}
