/**
 * Preload module - service initialization entry point.
 * This runs in the main process during ee-core startup,
 * before the window is created.
 */
import { logger } from 'ee-core/log';
import { services } from '../service';
import { configManager } from '../service/config';
import { controllers } from '../controller';
import config from '../config';
import * as path from 'path';
import { app } from 'electron';
import { registerLocalProtocol } from '../bootstrap/protocol';
import { createRendererSubscriptionRegistry, registerIpcRoutes } from '../ipc/router';

async function preload(): Promise<void> {
  logger.info('[preload] initializing services...');

  // Initialize config manager first
  const storageRoot = config.storage?.defaultRoot;
  const rootPath = storageRoot ? path.join(app.getPath('home'), storageRoot) : undefined;
  await configManager.init(rootPath);

  // Register local protocol after app is ready
  registerLocalProtocol();

  // Initialize IPC router
  const registry = createRendererSubscriptionRegistry();
  registerIpcRoutes(registry);

  // Initialize all services in parallel
  const initTasks: Array<{ name: string; run: () => Promise<unknown> }> = [
    { name: 'project', run: () => services.project.init(rootPath || null) },
    { name: 'ffmpeg', run: () => services.ffmpeg.init() },
    { name: 'plugin', run: () => services.plugin.init() },
    { name: 'chat', run: () => Promise.resolve(controllers.chat.init()) },
  ];

  await Promise.all(
    initTasks.map(async ({ name, run }) => {
      try {
        await run();
        logger.info(`[preload] ${name} service initialized`);
      } catch (error) {
        logger.error(`[preload] ${name} service init failed:`, error);
        throw new Error(`[preload] ${name} init failed`);
      }
    })
  );

  logger.info('[preload] all services initialized');
}

export { preload };
