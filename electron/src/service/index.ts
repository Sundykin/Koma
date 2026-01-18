/**
 * 服务层索引
 */
import { projectService, ProjectService } from './project';
import { ffmpegService, FFmpegService } from './ffmpeg';

export const services = {
  project: projectService,
  ffmpeg: ffmpegService,
};

export { ProjectService, projectService, FFmpegService, ffmpegService };
export default services;
