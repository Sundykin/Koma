/**
 * 服务层索引
 */
import { projectService, ProjectService } from './project';
import { ffmpegService, FFmpegService } from './ffmpeg';
import { pluginService } from './plugin';

export const services = {
  project: projectService,
  ffmpeg: ffmpegService,
  plugin: pluginService,
};

export { ProjectService, projectService, FFmpegService, ffmpegService, pluginService };
export default services;
