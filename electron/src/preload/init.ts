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
import { sqlitedbService } from '../service/database/sqlitedb';
import { novelPromotionDbService } from '../service/database/novelPromotionDb';
import { instanceStore } from '../service/provider/instance-store';
import { registerTaskHandlers } from '../ipc/taskHandlers';
import { registerNovelPromotionHandlers } from '../ipc/novelPromotionHandlers';
import { shotRenderTaskQueue } from '../queue/taskQueue';

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
  registerTaskHandlers();
  registerNovelPromotionHandlers();

  // Initialize all services in parallel
  const initTasks: Array<{ name: string; run: () => Promise<unknown> }> = [
    {
      name: 'database',
      run: async () => {
        sqlitedbService.init();
        novelPromotionDbService.init();
        await instanceStore.init(sqlitedbService.getDb());
      },
    },
    { name: 'project', run: () => services.project.init(rootPath || null) },
    { name: 'ffmpeg', run: () => services.ffmpeg.init() },
    { name: 'task-queue', run: () => shotRenderTaskQueue.init() },
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
