import type { FastifyInstance } from 'fastify';
import type { SettingsStore } from '../../map/settingsStore';
import { isValidCalibration, type MapSettings } from '../../../../shared/mapDefaults';

export function registerSettingsRoutes(app: FastifyInstance, store: SettingsStore): void {
  app.get('/api/settings', () => store.get());

  app.put('/api/settings', (req, reply) => {
    const body = req.body as Partial<MapSettings> | undefined;
    if (!body || !isValidCalibration(body.calibration)) {
      return reply.code(400).send({ error: 'invalid calibration' });
    }
    const settings: MapSettings = {
      calibration: body.calibration,
      defaultView: body.defaultView ?? null,
    };
    store.save(settings);
    return store.get();
  });
}
