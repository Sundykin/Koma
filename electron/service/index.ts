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
import { diagnosticsService, DiagnosticsService } from './diagnostics';
import { baseDB, settingsDB } from './storage';
import { syncBuiltinStyleReferences } from './styleReferences';
import { dropActivationChannelMarkers } from './settings/dropActivationChannelMarkers';

export const services = {
  project: projectService,
  linghui: linghuiService,
  ffmpeg: ffmpegService,
  plugin: pluginService,
  chat: chatService,
  diagnostics: diagnosticsService,
};

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function initServices(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 全局 settings.db 与项目无关，先行初始化
    settingsDB.init();
    // 激活体系已移除：把历史渠道上的托管标记摘掉，让它们变成普通渠道（幂等）
    try {
      const dropped = dropActivationChannelMarkers();
      if (dropped > 0) console.info(`[services] 已清理 ${dropped} 个渠道的激活托管标记`);
    } catch (err) {
      console.warn('[services] 清理激活托管标记失败（不阻塞启动）', err);
    }
    await services.project.init(path.join(app.getPath('home'), '.koma'));
    services.diagnostics.init(services.project.getStorageRoot());
    services.linghui.init(services.project.getStorageRoot());
    await services.ffmpeg.init(path.join(services.project.getStorageRoot(), 'cache', 'ffmpeg'));
    await services.plugin.init();
    // 内置风格参考图镜像到业务根，让 koma-local:// 协议可直读
    await syncBuiltinStyleReferences();
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
  settingsDB.close();
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
  DiagnosticsService,
  diagnosticsService,
  baseDB,
  settingsDB,
};
export default services;
