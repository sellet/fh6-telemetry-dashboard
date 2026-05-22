import fs from 'node:fs';
import type { Logger } from '../logger';
import {
  DEFAULT_MAP_SETTINGS,
  isValidCalibration,
  type MapSettings,
} from '../../../shared/mapDefaults';

/** Persists user-editable settings (map calibration) to settings.json. */
export class SettingsStore {
  private settings: MapSettings;

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {
    this.settings = this.load();
  }

  private load(): MapSettings {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<MapSettings>;
      if (isValidCalibration(parsed.calibration)) {
        return {
          calibration: parsed.calibration,
          defaultView: parsed.defaultView ?? null,
        };
      }
    } catch {
      // missing or invalid — fall back to defaults
    }
    return structuredClone(DEFAULT_MAP_SETTINGS);
  }

  get(): MapSettings {
    return this.settings;
  }

  save(settings: MapSettings): void {
    this.settings = settings;
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2));
      this.logger.info('map settings updated');
    } catch (err) {
      this.logger.error({ err }, 'failed to persist settings');
      throw err;
    }
  }
}
