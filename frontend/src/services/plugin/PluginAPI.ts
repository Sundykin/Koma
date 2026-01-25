/**
 * 插件 API 实现
 * 为插件提供系统能力访问
 * 重构版：支持 Provider 类注入
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

// 事件监听器
const eventListeners = new Map<string, Map<string, Set<Function>>>();

// 动态菜单项
const dynamicMenuItems = new Map<string, MenuItem[]>();

// 插件注册的 Provider 类型（用于卸载时清理）
const pluginProviderTypes = new Map<string, string[]>();

/**
 * 创建插件专用的 API 实例
 */
export function createPluginAPI(plugin: InstalledPlugin): PluginAPI {
  const pluginId = plugin.id;

  return {
    // ========== Core ==========
    core: {
      async getVersion() {
        return '1.0.0'; // TODO: 从 package.json 读取
      },

      async getHostInfo(): Promise<HostInfo> {
        return {
          appVersion: '1.0.0',
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

        // 从 globalStore 读取设置
        const { useGlobalStore } = await import('../../store/globalStore');
        const state = useGlobalStore.getState();

        if (!keys || keys.length === 0) {
          // 返回所有设置（排除敏感信息）
          return {
            theme: state.theme,
            language: state.language,
            // ... 其他非敏感设置
          };
        }

        // 返回指定的设置
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

        // 过滤敏感字段
        const safePatch: Record<string, any> = {};
        for (const [key, value] of Object.entries(patch)) {
          if (!isSensitiveKey(key)) {
            safePatch[key] = value;
          }
        }

        const { useGlobalStore } = await import('../../store/globalStore');
        // 应用设置变更
        useGlobalStore.setState(safePatch);

        // 触发事件
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
          throw new Error(`项目不存在: ${projectId}`);
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

    // ========== Channels (重构版：Provider 注入) ==========
    channels: {
      /**
       * 注册 Provider（新 API）
       * 插件通过此方法注册自定义 Provider 类
       */
      async registerProvider(def: ProviderDefinition<any>) {
        // 验证权限
        const result = validateOperation(plugin, 'channels.registerProvider', 'network:external');
        if (!result.allowed) {
          throw new Error(result.reason);
        }

        console.log(`[PluginAPI] 插件 ${pluginId} 注册 Provider:`, def.type, 'kind:', def.kind, 'capabilities:', def.capabilities);

        // 添加 pluginId 标识
        def.pluginId = pluginId;

        // 注册到 Registry
        registerProvider(def);

        // 记录 Provider 类型（卸载时清理）
        if (!pluginProviderTypes.has(pluginId)) {
          pluginProviderTypes.set(pluginId, []);
        }
        pluginProviderTypes.get(pluginId)!.push(def.type);

        // 检查是否已存在渠道配置（避免重复创建）
        const { getChannelConfigs } = await import('../../store/settings/channelConfig');
        const existingConfigs = await getChannelConfigs();
        console.log(`[PluginAPI] 现有渠道配置数量:`, existingConfigs.length);
        const existingChannel = existingConfigs.find(
          c => c.providerType === def.type && c.pluginId === pluginId
        );

        if (existingChannel) {
          console.log(`[PluginAPI] 渠道配置已存在，更新属性:`, def.type, existingChannel.id);
          // 更新已存在配置的属性（确保 capabilities 等字段正确）
          const { updateChannelConfig } = await import('../../store/settings/channelConfig');
          await updateChannelConfig(existingChannel.id, {
            name: def.name,
            description: def.description,
            capabilities: def.capabilities || [def.kind],
            polling: def.polling,
            enabled: true,
          });
          // 触发事件通知 UI 刷新
          emitPluginEvent('providerRegistered', { pluginId, providerType: def.type });
          return;
        }

        // 创建对应的渠道配置（失败时回滚）
        console.log(`[PluginAPI] 创建新渠道配置:`, def.type, 'capabilities:', def.capabilities || [def.kind]);
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
          console.log(`[PluginAPI] 渠道配置创建成功:`, newConfig.id);
        } catch (err) {
          console.error(`[PluginAPI] 渠道配置创建失败:`, err);
          // 回滚：移除已注册的 Provider
          unregisterProvider(def.kind, def.type);
          const types = pluginProviderTypes.get(pluginId);
          if (types) {
            const idx = types.indexOf(def.type);
            if (idx >= 0) types.splice(idx, 1);
          }
          throw err;
        }

        // 触发事件通知 UI 刷新
        emitPluginEvent('providerRegistered', { pluginId, providerType: def.type });
      },

      /**
       * 反注册 Provider
       */
      async unregisterProvider(type: string) {
        const def = listProviders().find(p => p.type === type);
        if (def && def.pluginId === pluginId) {
          unregisterProvider(def.kind, type);

          // 从记录中移除
          const types = pluginProviderTypes.get(pluginId);
          if (types) {
            const idx = types.indexOf(type);
            if (idx >= 0) types.splice(idx, 1);
          }

          // 清理对应的渠道配置
          const { deleteChannelByProviderType } = await import('../../store/settings/channelConfig');
          await deleteChannelByProviderType(type, pluginId);
        }
      },

      /**
       * 列出所有 Provider
       */
      async listProviders(kind?: ChannelKind) {
        return listProviders(kind);
      },

      /**
       * 测试 Provider
       */
      async testProvider(type: string, config: Record<string, any>): Promise<ChannelTestResult> {
        const { createProviderInstance } = await import('../../providers/registry');
        const start = Date.now();

        try {
          const provider = createProviderInstance<{ testConnection?: () => Promise<boolean> }>(type, config, {
            sandboxedFetch: createSandboxedFetch(plugin),
            pluginId,
          });

          if (typeof provider.testConnection === 'function') {
            const success = await provider.testConnection();
            return {
              success,
              latency: Date.now() - start,
              error: success ? undefined : '连接测试失败',
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

      // ========== 兼容旧 API（已废弃） ==========

      /**
       * @deprecated 使用 registerProvider 代替
       */
      async register(config: PluginChannelConfig) {
        console.warn('[PluginAPI] channels.register 已废弃，请使用 channels.registerProvider');
        // 不再支持旧 API
        throw new Error('channels.register 已废弃，请使用 channels.registerProvider');
      },

      async test(channelId: string): Promise<ChannelTestResult> {
        const { getChannelConfigs } = await import('../../store/settings/channelConfig');
        const configs = await getChannelConfigs();
        const config = configs.find(c => c.id === channelId);

        if (!config) {
          return { success: false, latency: 0, error: '渠道不存在' };
        }

        return this.testProvider(config.providerType, config.providerConfig);
      },


      async invoke(channelId: string, action: string, params: any) {
        // TODO: 实现渠道调用
        throw new Error('Not implemented');
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

        // 确保目录存在
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

        // 检查目录是否存在
        const exists = await electronService.fs.exists(validation.fullPath!);
        if (!exists) {
          return [];
        }

        return electronService.fs.readdir(validation.fullPath!);
      },

      async openDialog(options: DialogOptions): Promise<string[]> {
        if (!hasScope(plugin, 'storage:limited')) {
          throw new Error('插件没有存储权限');
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
            okText: options.okText || '确定',
            cancelText: options.cancelText || '取消',
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

// ========== 辅助函数 ==========

/**
 * 检查是否是敏感配置项
 */
function isSensitiveKey(key: string): boolean {
  const sensitivePatterns = [
    'apiKey', 'apiSecret', 'token', 'password', 'credential',
    'secret', 'private', 'auth',
  ];
  return sensitivePatterns.some(p => key.toLowerCase().includes(p.toLowerCase()));
}

/**
 * 触发插件事件
 */
export function emitPluginEvent(event: string, data: any): void {
  for (const [pluginId, events] of eventListeners) {
    const handlers = events.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[PluginAPI] 事件处理器执行失败 (${pluginId}):`, err);
        }
      }
    }
  }
}

/**
 * 获取插件注册的菜单项
 */
export function getPluginMenuItems(pluginId: string): MenuItem[] {
  return dynamicMenuItems.get(pluginId) || [];
}

/**
 * 清理插件的所有资源
 * 包括事件监听、菜单项、Provider 注册
 */
export async function cleanupPluginResources(pluginId: string): Promise<void> {
  eventListeners.delete(pluginId);
  dynamicMenuItems.delete(pluginId);

  // 清理 Provider 注册
  const { unregisterProvidersByPlugin } = await import('../../providers/registry');
  unregisterProvidersByPlugin(pluginId);

  // 清理插件的渠道配置
  await deleteChannelsByPlugin(pluginId);

  // 清理记录
  pluginProviderTypes.delete(pluginId);

  console.log(`[PluginAPI] 已清理插件 ${pluginId} 的所有资源`);
}
