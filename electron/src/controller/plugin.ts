/**
 * 插件管理 Controller
 */
import { IpcMainInvokeEvent, shell } from 'electron';
import { pluginService } from '../service/plugin';

export const pluginController = {
  /**
   * 验证插件包
   */
  async validate({ zipPath }: { zipPath: string }, event?: IpcMainInvokeEvent) {
    return pluginService.validate(zipPath);
  },

  /**
   * 安装插件
   */
  async install(
    { zipPath, manifest, stagingId }: { zipPath: string; manifest: any; stagingId?: string },
    event?: IpcMainInvokeEvent
  ) {
    // 如果是文件夹路径（开发模式）
    const isFolder = !zipPath.endsWith('.zip');
    if (isFolder) {
      return pluginService.installFromFolder(zipPath, manifest);
    }
    return pluginService.install(zipPath, manifest, stagingId);
  },

  /**
   * 卸载插件
   */
  async uninstall({ pluginPath }: { pluginPath: string }, event?: IpcMainInvokeEvent) {
    return pluginService.uninstall(pluginPath);
  },

  /**
   * 列出已安装插件
   */
  async list(_args: any, event?: IpcMainInvokeEvent) {
    return pluginService.listInstalled();
  },

  /**
   * 打开插件目录
   */
  async openFolder({ pluginPath }: { pluginPath: string }, event?: IpcMainInvokeEvent) {
    shell.openPath(pluginPath);
    return { success: true };
  },
};
