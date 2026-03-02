/**
 * 插件管理 Controller
 */
import { IpcMainInvokeEvent, shell } from 'electron';
import { pluginService } from '../service/plugin';
import { pluginRuntime } from '../service/plugin/runtime';
import { pluginBridge } from '../service/plugin/bridge';

class PluginController {
  async validate({ zipPath }: { zipPath: string }, _event?: IpcMainInvokeEvent) {
    return pluginService.validate(zipPath);
  }

  async install(
    { zipPath, manifest, stagingId }: { zipPath: string; manifest: any; stagingId?: string },
    _event?: IpcMainInvokeEvent
  ) {
    const isFolder = !zipPath.endsWith('.zip');
    if (isFolder) {
      return pluginService.installFromFolder(zipPath, manifest);
    }
    return pluginService.install(zipPath, manifest, stagingId);
  }

  async uninstall({ pluginPath }: { pluginPath: string }, _event?: IpcMainInvokeEvent) {
    return pluginService.uninstall(pluginPath);
  }

  async list(_args: any, _event?: IpcMainInvokeEvent) {
    return pluginService.listInstalled();
  }

  async openFolder({ pluginPath }: { pluginPath: string }, _event?: IpcMainInvokeEvent) {
    shell.openPath(pluginPath);
    return { success: true };
  }

  async activate({ manifest }: { manifest: any }, _event?: IpcMainInvokeEvent) {
    return pluginService.loadAndActivate(manifest);
  }

  async deactivate({ pluginId }: { pluginId: string }, _event?: IpcMainInvokeEvent) {
    return pluginService.deactivate(pluginId);
  }

  async status({ pluginId }: { pluginId: string }, _event?: IpcMainInvokeEvent) {
    return pluginService.getPluginStatus(pluginId);
  }

  async listRuntimeStates(_args: any, _event?: IpcMainInvokeEvent) {
    return pluginService.listRuntimeStates();
  }

  async getRuntimeState({ pluginId }: { pluginId: string }, _event?: IpcMainInvokeEvent) {
    return pluginService.getRuntimeState(pluginId);
  }

  async listActive(_args: any, _event?: IpcMainInvokeEvent) {
    return pluginRuntime.listActivePlugins().map(p => ({
      id: p.manifest.id,
      name: p.manifest.name,
      category: p.manifest.category,
      status: p.status,
    }));
  }

  async listProviderStatus(
    { kind }: { kind?: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting' },
    _event?: IpcMainInvokeEvent
  ) {
    return pluginBridge.listProviderStatus(kind);
  }

  async testProvider(
    {
      kind,
      type,
      config,
    }: {
      kind: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting';
      type: string;
      config: Record<string, unknown>;
    },
    _event?: IpcMainInvokeEvent
  ) {
    return pluginBridge.testProvider(kind, type, config);
  }

  async listMCPTools(_args: any, _event?: IpcMainInvokeEvent) {
    return pluginBridge.listMCPTools();
  }

  async callMCPTool({ name, args }: { name: string; args: unknown }, _event?: IpcMainInvokeEvent) {
    return pluginBridge.callMCPTool(name, args);
  }

  async listAgents(_args: any, _event?: IpcMainInvokeEvent) {
    return pluginBridge.listAgents().map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      capabilities: a.capabilities,
      pluginId: a.pluginId,
    }));
  }
}

PluginController.toString = () => '[class PluginController]';

export default PluginController;
