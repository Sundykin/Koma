/**
 * 服务层索引
 */
import path from 'path';
import { app } from 'electron';
import { projectService, ProjectService } from './project';
import { ffmpegService, FFmpegService } from './ffmpeg';
import { pluginService } from './plugin';
import { chatService, ChatService } from './chat';
import { linghuiService, LinghuiService } from './linghui';
import { baseDB } from './storage';

export const services = {
  project: projectService,
  linghui: linghuiService,
  ffmpeg: ffmpegService,
  plugin: pluginService,
  chat: chatService,
};

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function initServices(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await services.project.init(path.join(app.getPath('home'), '.koma'));
    services.linghui.init(services.project.getStorageRoot());
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

export function closeServices(): void {
  baseDB.close();
}

export {
  ProjectService,
  projectService,
  LinghuiService,
  linghuiService,
  FFmpegService,
  ffmpegService,
  pluginService,
  ChatService,
  chatService,
  baseDB,
};
export default services;
