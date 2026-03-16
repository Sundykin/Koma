/**
 * 控制器索引
 */
import { AppController } from './app';
import { WindowController } from './window';
import { DialogController } from './dialog';
import { FsController } from './fs';
import { NetController } from './net';
import { ProjectController } from './project';
import { FFmpegController } from './ffmpeg';
import { pluginController } from './plugin';
import { chatController, ChatController } from './chat';

export const controllers = {
  app: new AppController(),
  window: new WindowController(),
  dialog: new DialogController(),
  fs: new FsController(),
  net: new NetController(),
  project: new ProjectController(),
  ffmpeg: new FFmpegController(),
  plugin: pluginController,
  chat: chatController,
};

export type Controllers = typeof controllers;

export { AppController, WindowController, DialogController, FsController, NetController, ProjectController, FFmpegController, pluginController, ChatController, chatController };
export default controllers;
