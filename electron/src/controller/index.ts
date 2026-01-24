/**
 * 控制器索引
 */
import { AppController } from './app';
import { WindowController } from './window';
import { DialogController } from './dialog';
import { FsController } from './fs';
import { ProjectController } from './project';
import { FFmpegController } from './ffmpeg';
import { pluginController } from './plugin';

export const controllers = {
  app: new AppController(),
  window: new WindowController(),
  dialog: new DialogController(),
  fs: new FsController(),
  project: new ProjectController(),
  ffmpeg: new FFmpegController(),
  plugin: pluginController,
};

export type Controllers = typeof controllers;

export { AppController, WindowController, DialogController, FsController, ProjectController, FFmpegController, pluginController };
export default controllers;
