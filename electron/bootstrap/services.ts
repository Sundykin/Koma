import path from 'path';
import { app } from 'electron';
import { services } from '../src/service';

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function initServices(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await services.project.init(path.join(app.getPath('home'), '.koma'));
    await services.ffmpeg.init();
    await services.plugin.init();
    initialized = true;
  })();

  return initPromise;
}

export async function ensureServicesReady(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    await initServices();
    return;
  }
  await initPromise;
}
