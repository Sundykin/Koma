/**
 * 服务层索引
 */
import { projectService, ProjectService } from './project';
import { ffmpegService, FFmpegService } from './ffmpeg';
import { pluginService } from './plugin';
import { chatService, ChatService } from './chat';
import { configManager, configRegistry } from './config';
import { providerManager } from './provider';
import { workflowOrchestrator } from './workflow';
import { persistenceService } from './persistence';

export const services = {
  project: projectService,
  ffmpeg: ffmpegService,
  plugin: pluginService,
  chat: chatService,
  config: configManager,
  provider: providerManager,
  workflow: workflowOrchestrator,
  persistence: persistenceService,
};

export { ProjectService, projectService, FFmpegService, ffmpegService, pluginService, ChatService, chatService, configManager, configRegistry, providerManager, workflowOrchestrator, persistenceService };
export default services;
