/**
 * 控制器索引
 */
import { AppController } from './app';
import { WindowController } from './window';
import { DialogController } from './dialog';
import { FsController } from './fs';
import { ProjectController } from './project';

export const controllers = {
  app: new AppController(),
  window: new WindowController(),
  dialog: new DialogController(),
  fs: new FsController(),
  project: new ProjectController(),
};

export type Controllers = typeof controllers;

export { AppController, WindowController, DialogController, FsController, ProjectController };
export default controllers;
