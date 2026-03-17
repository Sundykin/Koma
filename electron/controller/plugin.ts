/**
 * 插件管理 Controller
 */
import { IpcMainInvokeEvent, shell } from 'electron';
import { pluginService } from '../service/plugin';
import { pluginRuntime } from '../service/plugin/runtime';
import { pluginBridge } from '../service/plugin/bridge';
import { ensureServicesReady } from '../service';

const pluginController = {
  /**
   * 验证插件包
   */
  async validate({ zipPath }: { zipPath: string }, event?: IpcMainInvokeEvent) {
    await ensureServicesReady();
    return pluginService.validate(zipPath);
  },

  /**
   * 安装插件
   */
  async install(
    { zipPath, manifest, stagingId }: { zipPath: string; manifest: any; stagingId?: string },
    event?: IpcMainInvokeEvent
  ) {
    await ensureServicesReady();
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
    await ensureServicesReady();
    return pluginService.uninstall(pluginPath);
  },

  /**
   * 列出已安装插件
   */
  async list(_args: any, event?: IpcMainInvokeEvent) {
    await ensureServicesReady();
    return pluginService.listInstalled();
  },

  /**
   * 打开插件目录
   */
  async openFolder({ pluginPath }: { pluginPath: string }, event?: IpcMainInvokeEvent) {
    shell.openPath(pluginPath);
    return { success: true };
  },

  // ========== 运行时管理 ==========

  /**
   * 激活插件
   */
  async activate({ manifest }: { manifest: any }, event?: IpcMainInvokeEvent) {
    await ensureServicesReady();
    return pluginService.loadAndActivate(manifest);
  },

  /**
   * 停用插件
   */
  async deactivate({ pluginId }: { pluginId: string }, event?: IpcMainInvokeEvent) {
    await ensureServicesReady();
    return pluginService.deactivate(pluginId);
  },

  /**
   * 获取插件运行状态
   */
  async status({ pluginId }: { pluginId: string }, event?: IpcMainInvokeEvent) {
    await ensureServicesReady();
    return pluginService.getPluginStatus(pluginId);
  },

  /**
   * 列出活跃插件
   */
  async listActive(_args: any, event?: IpcMainInvokeEvent) {
    await ensureServicesReady();
    return pluginRuntime.listActivePlugins().map(p => ({
      id: p.manifest.id,
      name: p.manifest.name,
      category: p.manifest.category,
      status: p.status,
    }));
  },

  // ========== 工具和 Agent 查询 ==========

  /**
   * 列出插件系统注册的 MCP 工具
   */
  async listMCPTools(_args: any, event?: IpcMainInvokeEvent) {
    await ensureServicesReady();
    return pluginBridge.listMCPTools();
  },

  /**
   * 调用插件 MCP 工具
   */
  async callMCPTool({ name, args }: { name: string; args: unknown }, event?: IpcMainInvokeEvent) {
    await ensureServicesReady();
    return pluginBridge.callMCPTool(name, args);
  },

  /**
   * 列出可用 Worker Agent
   */
  async listAgents(_args: any, event?: IpcMainInvokeEvent) {
    await ensureServicesReady();
    return pluginBridge.listAgents().map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      capabilities: a.capabilities,
      pluginId: a.pluginId,
    }));
  },
};

export = pluginController;
