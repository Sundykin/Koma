/**
 * 控制器索引
 * ee-core 会自动扫描 controller/ 目录注册 IPC handle
 * 此文件仅用于内部引用（如 lifecycle 中需要调用 controller 方法）
 */
import AppController from './app';
import WindowController from './window';
import DialogController from './dialog';
import FsController from './fs';
import ProjectController from './project';
import FFmpegController from './ffmpeg';
import PluginController from './plugin';
import ChatController from './chat';
import ConfigController from './config';
import WorkflowController from './workflow';
import PersistenceController from './persistence';

export const controllers = {
  app: new AppController(),
  window: new WindowController(),
  dialog: new DialogController(),
  fs: new FsController(),
  project: new ProjectController(),
  ffmpeg: new FFmpegController(),
  plugin: new PluginController(),
  chat: new ChatController(),
  config: new ConfigController(),
  workflow: new WorkflowController(),
  persistence: new PersistenceController(),
};

export type Controllers = typeof controllers;

export {
  AppController,
  WindowController,
  DialogController,
  FsController,
  ProjectController,
  FFmpegController,
  PluginController,
  ChatController,
  ConfigController,
  WorkflowController,
  PersistenceController,
};

export default controllers;
