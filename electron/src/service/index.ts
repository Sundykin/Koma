/**
 * 服务层索引
 */
import { projectService, ProjectService } from './project';
import { ffmpegService, FFmpegService } from './ffmpeg';
import { pluginService } from './plugin';
import { chatService, ChatService } from './chat';

export const services = {
  project: projectService,
  ffmpeg: ffmpegService,
  plugin: pluginService,
  chat: chatService,
};

export { ProjectService, projectService, FFmpegService, ffmpegService, pluginService, ChatService, chatService };
export default services;
