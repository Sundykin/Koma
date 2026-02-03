/**
 * ?? API ??
 * ???????????
 * ?????? Provider ???
 */
import type {
  PluginAPI,
  InstalledPlugin,
  HostInfo,
  ProjectFilter,
  PluginProject,
  PluginPromptTemplate,
  PromptOverride,
  PluginChannelConfig,
  ChannelTestResult,
  DialogOptions,
  ModalOptions,
  MenuItem,
} from '../../types/plugin';
import { validateOperation, validateStoragePath, createSandboxedFetch, hasScope } from './PluginSandbox';
import { electronService } from '../electronService';
import { message, Modal } from 'antd';
import {
  registerProvider,
  unregisterProvider,
  listProviders,
  type ProviderDefinition,
  type ChannelKind,
  type ProviderContext,
} from '../../providers/registry';
import { addChannelConfig, deleteChannelsByPlugin } from '../../store/settings/channelConfig';
import pkg from '../../../../package.json';

// ?????
const eventListeners = new Map<string, Map<string, Set<Function>>>();  

// ?????
const dynamicMenuItems = new Map<string, MenuItem[]>();

// ????? Provider ???????????
const pluginProviderTypes = new Map<string, string[]>();

/**
 * ??????? API ??
 */
export function createPluginAPI(plugin: InstalledPlugin): PluginAPI {  
  const pluginId = plugin.id;

  return {
    // ========== Core ==========
    core: {
      async getVersion() {
        return pkg.version;
      },

      async getHostInfo(): Promise<HostInfo> {
        return {
          appVersion: pkg.version,
          platform: process.platform as 'win32' | 'darwin' | 'linux',  
          electronVersion: process.versions.electron || 'unknown',     
        };
      },

      on(event, handler) {
        if (!eventListeners.has(pluginId)) {
          eventListeners.set(pluginId, new Map());
        }
        const pluginEvents = eventListeners.get(pluginId)!;
        if (!pluginEvents.has(event)) {
          pluginEvents.set(event, new Set());
        }
        pluginEvents.get(event)!.add(handler);
      },

      off(event, handler) {
        const pluginEvents = eventListeners.get(pluginId);
        if (pluginEvents?.has(event)) {
          pluginEvents.get(event)!.delete(handler);
        }
      },
    },

    // ========== Settings ==========
    settings: {
      async get(keys?: string[]) {
        const result = validateOperation(plugin, 'settings.get', 'settings:read');
        if (!result.allowed) {
          throw new Error(result.reason);
        }

        // ? globalStore ????
        const { useGlobalStore } = await import('../../store/globalStore');
        const state = useGlobalStore.getState();

        if (!keys || keys.length === 0) {
          // ??????????????
          return {
            theme: state.theme,
            language: state.language,
            // ... ???????
          };
        }

        // ???????
        const result2: Record<string, any> = {};
        for (const key of keys) {
          if (key in state && !isSensitiveKey(key)) {
            result2[key] = (state as any)[key];
          }
        }
        return result2;
      },

      async set(patch: Record<string, any>) {
        const result = validateOperation(plugin, 'settings.set', 'settings:write');
        if (!result.allowed) {
          throw new Error(result.reason);
        }

        // ??????
        const safePatch: Record<string, any> = {};
        for (const [key, value] of Object.entries(patch)) {
          if (!isSensitiveKey(key)) {
            safePatch[key] = value;
          }
        }

        const { useGlobalStore } = await import('../../store/globalStore');
        // ??????
        useGlobalStore.setState(safePatch);

        // ????
        emitPluginEvent('settingsChanged', safePatch);
      },
    },

    // ========== Projects ==========
    projects: {
      async list(filter?: ProjectFilter): Promise<PluginProject[]> {
        const result = validateOperation(plugin, 'projects.list', 'projects:read');
        if (!result.allowed) {
          throw new Error(result.reason);
        }

        const { listProjects } = await import('../../store/projectStore');
        const projects = await listProjects();

        return projects.map(p => ({
          id: p.id,
          name: p.name,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt || p.createdAt,
        }));
      },

      async get(projectId: string): Promise<PluginProject> {
        const result = validateOperation(plugin, 'projects.get', 'projects:read');
        if (!result.allowed) {
          throw new Error(result.reason);
        }

        const { loadProject } = await import('../../store/projectStore');
        const project = await loadProject(projectId);

        if (!project) {
          throw new Error(`?????: ${projectId}`);
        }

        return {
          id: project.id,
          name: project.name,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt || project.createdAt,
        };
      },

      async update(projectId: string, mutation: Partial<PluginProject>) {
        const result = validateOperation(plugin, 'projects.update', 'projects:write');
        if (!result.allowed) {
          throw new Error(result.reason);
        }

        const { updateProject } = await import('../../store/projectStore');
        await updateProject(projectId, mutation);

        emitPluginEvent('projectChanged', { projectId, mutation });    
      },
    },

    // ========== Prompts ==========
    prompts: {
      async getTemplate(id: string): Promise<PluginPromptTemplate> {   
        const { getPromptTemplate } = await import('../../store/promptTemplates');
        const template = await getPromptTemplate(id);

        return {
          id: template.id,
          name: template.name,
          template: template.template,
          variables: template.variables || [],
        };
      },

      async listTemplates(): Promise<PluginPromptTemplate[]> {
        const { getAllPromptTemplates } = await import('../../store/promptTemplates');
        const templates = await getAllPromptTemplates();

        return templates.map(t => ({
          id: t.id,
          name: t.name,
          template: t.template,
          variables: t.variables || [],
        }));
      },

      async override(payload: PromptOverride) {
        const result = validateOperation(plugin, 'prompts.override', 'prompts:override');
        if (!result.allowed) {
          throw new Error(result.reason);
        }

        const { overridePromptTemplate } = await import('../../store/promptTemplates');
        await overridePromptTemplate(payload.templateId, payload.newTemplate, {
          pluginId,
          priority: payload.priority,
        });
      },
    },

    // ========== Channels (????Provider ??) ==========
    channels: {
      /**
       * ?? Provider?? API?
       * ???????????? Provider ?
       */
      async registerProvider(def: ProviderDefinition<any>) {
        // ????
        const result = validateOperation(plugin, 'channels.registerProvider', 'network:external');
        if (!result.allowed) {
          throw new Error(result.reason);
        }

        console.log(`[PluginAPI] ?? ${pluginId} ?? Provider:`, def.type, 'kind:', def.kind, 'capabilities:', def.capabilities);

        // ?? pluginId ??
        def.pluginId = pluginId;

        // ??? Registry
        registerProvider(def);

        // ?? Provider ???????????
        if (!pluginProviderTypes.has(pluginId)) {
          pluginProviderTypes.set(pluginId, []);
        }
        pluginProviderTypes.get(pluginId)!.push(def.type);

        // ??????????????????
        const { getChannelConfigs } = await import('../../store/settings/channelConfig');
        const existingConfigs = await getChannelConfigs();
        console.log(`[PluginAPI] ????????:`, existingConfigs.length);
        const existingChannel = existingConfigs.find(
          c => c.providerType === def.type && c.pluginId === pluginId  
        );

        if (existingChannel) {
          console.log(`[PluginAPI] ????????????:`, def.type, existingChannel.id);
          // ????????????? capabilities ??????      
          const { updateChannelConfig } = await import('../../store/settings/channelConfig');
          await updateChannelConfig(existingChannel.id, {
            name: def.name,
            description: def.description,
            capabilities: def.capabilities || [def.kind],
            polling: def.polling,
            enabled: true,
          });
          // ?????? UI ??
          emitPluginEvent('providerRegistered', { pluginId, providerType: def.type });
          return;
        }

        // ????????????????
        console.log(`[PluginAPI] ???????:`, def.type, 'capabilities:', def.capabilities || [def.kind]);
        try {
          const newConfig = await addChannelConfig({
            name: def.name,
            description: def.description,
            providerType: def.type,
            providerConfig: def.defaultConfig || {},
            capabilities: def.capabilities || [def.kind],
            polling: def.polling,
            enabled: true,
            source: 'plugin',
            pluginId,
          });
          console.log(`[PluginAPI] ????????:`, newConfig.id);  
        } catch (err) {
          console.error(`[PluginAPI] ????????:`, err);
          // ????????? Provider
          unregisterProvider(def.kind, def.type);
          const types = pluginProviderTypes.get(pluginId);
          if (types) {
            const idx = types.indexOf(def.type);
            if (idx >= 0) types.splice(idx, 1);
          }
          throw err;
        }

        // ?????? UI ??
        emitPluginEvent('providerRegistered', { pluginId, providerType: def.type });
      },

      /**
       * ??? Provider
       */
      async unregisterProvider(type: string) {
        const def = listProviders().find(p => p.type === type);        
        if (def && def.pluginId === pluginId) {
          unregisterProvider(def.kind, type);

          // ??????
          const types = pluginProviderTypes.get(pluginId);
          if (types) {
            const idx = types.indexOf(type);
            if (idx >= 0) types.splice(idx, 1);
          }

          // ?????????
          const { deleteChannelByProviderType } = await import('../../store/settings/channelConfig');
          await deleteChannelByProviderType(type, pluginId);
        }
      },

      /**
       * ?? Provider ??
       * ?? UI ????????????? channelConfig.providerConfig
       * ????????????
       */
      async updateProviderConfig(type: string, config: Record<string, any>) {
        const result = validateOperation(plugin, 'channels.updateProviderConfig', 'network:external');
        if (!result.allowed) {
          throw new Error(result.reason);
        }

        const { getChannelConfigs, updateChannelConfig, addChannelConfig } = await import('../../store/settings/channelConfig');
        const configs = await getChannelConfigs();
        let channelConfig = configs.find(
          c => c.providerType === type && c.pluginId === pluginId      
        );

        if (!channelConfig) {
          // ????????
          console.log(`[PluginAPI] ????????????: ${type}`);
          const manifest = plugin.manifest;
          const capabilities = manifest.providerMeta?.capabilities || [];

          channelConfig = await addChannelConfig({
            name: manifest.name || type,
            description: manifest.description,
            providerType: type,
            providerConfig: config,
            capabilities: capabilities as any[],
            enabled: true,
            source: 'plugin',
            pluginId: pluginId,
          });
          console.log(`[PluginAPI] ???????: ${type}`, channelConfig);
          return;
        }

        // ?? providerConfig
        await updateChannelConfig(channelConfig.id, {
          providerConfig: config,
        });

        console.log(`[PluginAPI] ???????: ${type}`, config);    
      },

      /**
       * ?? Provider ??
       * ? channelConfig.providerConfig ????
       */
      async getProviderConfig(type: string): Promise<Record<string, any> | null> {
        const { getChannelConfigs } = await import('../../store/settings/channelConfig');
        const configs = await getChannelConfigs();
        const channelConfig = configs.find(
          c => c.providerType === type && c.pluginId === pluginId      
        );

        if (!channelConfig) {
          return null;
        }

        return channelConfig.providerConfig || {};
      },

      /**
       * ???? Provider
       */
      async listProviders(kind?: ChannelKind) {
        return listProviders(kind);
      },

      /**
       * ?? Provider????? kind?
       */
      async testProvider(kind: ChannelKind, type: string, config: Record<string, any>): Promise<ChannelTestResult> {
        const { createProviderInstance } = await import('../../providers/registry');
        const start = Date.now();

        try {
          const provider = createProviderInstance<{ testConnection?: () => Promise<boolean> }>(kind, type, config, {
            sandboxedFetch: createSandboxedFetch(plugin),
            pluginId,
          });

          if (typeof provider.testConnection === 'function') {
            const success = await provider.testConnection();
            return {
              success,
              latency: Date.now() - start,
              error: success ? undefined : '??????',
            };
          }

          return {
            success: true,
            latency: Date.now() - start,
          };
        } catch (err: any) {
          return {
            success: false,
            latency: Date.now() - start,
            error: err.message,
          };
        }
      },

      async test(channelId: string): Promise<ChannelTestResult> {      
        const { getChannelConfigs } = await import('../../store/settings/channelConfig');
        const configs = await getChannelConfigs();
        const config = configs.find(c => c.id === channelId);

        if (!config) {
          return { success: false, latency: 0, error: '?????' };  
        }

        // ? capabilities ?? kind
        const kind: ChannelKind = config.capabilities?.includes('tts') ? 'tts'
          : config.capabilities?.includes('itv') ? 'itv'
          : 'tti';

        return this.testProvider(kind, config.providerType, config.providerConfig);
      },


      async invoke(channelId: string, action: string, params: any): Promise<any> {
        const result = validateOperation(plugin, 'channels.invoke', 'network:external');
        if (!result.allowed) {
          throw new Error(result.reason);
        }

        // 获取渠道配置
        const { getChannelConfigs } = await import('../../store/settings/channelConfig');
        const configs = await getChannelConfigs();
        const channelConfig = configs.find(c => c.id === channelId);

        if (!channelConfig) {
          throw new Error(`渠道未找到: ${channelId}`);
        }

        if (!channelConfig.enabled) {
          throw new Error(`渠道已禁用: ${channelConfig.name}`);
        }

        // 从 capabilities 推断 kind
        const kind: ChannelKind = channelConfig.capabilities?.includes('tts') ? 'tts'
          : channelConfig.capabilities?.includes('itv') ? 'itv'
          : 'tti';

        // 创建 Provider 实例
        const { createProviderInstance } = await import('../../providers/registry');
        let provider: any;

        try {
          provider = createProviderInstance(kind, channelConfig.providerType, channelConfig.providerConfig, {
            sandboxedFetch: createSandboxedFetch(plugin),
            pluginId,
          });
        } catch (err: any) {
          throw new Error(`创建 Provider 失败: ${err.message}`);
        }

        // 验证 action 是否为有效方法
        if (typeof provider[action] !== 'function') {
          throw new Error(`Provider 不支持操作: ${action}`);
        }

        // 调用 Provider 方法
        try {
          // 根据 action 类型解析 params
          if (Array.isArray(params)) {
            return await provider[action](...params);
          } else if (params !== undefined && params !== null) {
            return await provider[action](params);
          } else {
            return await provider[action]();
          }
        } catch (err: any) {
          console.error(`[PluginAPI] 渠道调用失败 (${channelId}.${action}):`, err);
          throw new Error(`渠道调用失败: ${err.message}`);
        }
      },
    },

    // ========== Storage ==========
    storage: {
      async readFile(path: string): Promise<ArrayBuffer> {
        const validation = validateStoragePath(plugin, path);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        const data = await electronService.fs.readFile(validation.fullPath!);
        return new TextEncoder().encode(data).buffer;
      },

      async writeFile(path: string, data: ArrayBuffer) {
        const validation = validateStoragePath(plugin, path);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        // ??????
        const dir = validation.fullPath!.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
        const dirExists = await electronService.fs.exists(dir);        
        if (!dirExists) {
          await electronService.fs.mkdir(dir);
        }

        const text = new TextDecoder().decode(data);
        await electronService.fs.writeFile(validation.fullPath!, text);
      },

      async deleteFile(path: string) {
        const validation = validateStoragePath(plugin, path);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        await electronService.fs.remove(validation.fullPath!);
      },

      async listFiles(dir: string): Promise<string[]> {
        const validation = validateStoragePath(plugin, dir);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        // ????????
        const exists = await electronService.fs.exists(validation.fullPath!);
        if (!exists) {
          return [];
        }

        return electronService.fs.readdir(validation.fullPath!);       
      },

      async openDialog(options: DialogOptions): Promise<string[]> {    
        if (!hasScope(plugin, 'storage:limited')) {
          throw new Error('????????');
        }

        const result = await electronService.dialog.showOpenDialog({   
          title: options.title,
          properties: [
            options.multiple ? 'multiSelections' : undefined,
            options.directory ? 'openDirectory' : 'openFile',
          ].filter(Boolean) as any[],
          filters: options.filters,
        });

        return result.filePaths || [];
      },
    },

    // ========== UI ==========
    ui: {
      showMessage(type, content) {
        message[type](content);
      },

      async showModal(options: ModalOptions): Promise<boolean> {       
        return new Promise((resolve) => {
          Modal.confirm({
            title: options.title,
            content: options.content,
            okText: options.okText || '??',
            cancelText: options.cancelText || '??',
            width: options.width,
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
      },

      registerMenuItem(item: MenuItem) {
        if (!dynamicMenuItems.has(pluginId)) {
          dynamicMenuItems.set(pluginId, []);
        }
        dynamicMenuItems.get(pluginId)!.push(item);
      },

      removeMenuItem(key: string) {
        const items = dynamicMenuItems.get(pluginId);
        if (items) {
          const idx = items.findIndex(i => i.key === key);
          if (idx >= 0) {
            items.splice(idx, 1);
          }
        }
      },
    },
  };
}

// ========== ???? ==========

/**
 * ??????????
 */
function isSensitiveKey(key: string): boolean {
  const sensitivePatterns = [
    'apiKey', 'apiSecret', 'token', 'password', 'credential',
    'secret', 'private', 'auth',
  ];
  return sensitivePatterns.some(p => key.toLowerCase().includes(p.toLowerCase()));
}

/**
 * ??????
 */
export function emitPluginEvent(event: string, data: any): void {      
  for (const [pluginId, events] of eventListeners) {
    const handlers = events.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[PluginAPI] ????????? (${pluginId}):`, err);
        }
      }
    }
  }
}

/**
 * ??????????
 */
export function getPluginMenuItems(pluginId: string): MenuItem[] {     
  return dynamicMenuItems.get(pluginId) || [];
}

/**
 * ?????????
 * ???????????Provider ??
 */
export async function cleanupPluginResources(pluginId: string): Promise<void> {
  eventListeners.delete(pluginId);
  dynamicMenuItems.delete(pluginId);

  // ?? Provider ??
  const { unregisterProvidersByPlugin } = await import('../../providers/registry');
  unregisterProvidersByPlugin(pluginId);

  // ?????????
  await deleteChannelsByPlugin(pluginId);

  // ????
  pluginProviderTypes.delete(pluginId);

  console.log(`[PluginAPI] ????? ${pluginId} ?????`);        
}
