/**
 * 插件 API 实现
 * 为插件提供系统能力访问
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

// 事件监听器
const eventListeners = new Map<string, Map<string, Set<Function>>>();

// 动态菜单项
const dynamicMenuItems = new Map<string, MenuItem[]>();

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

    // ========== Channels ==========
    channels: {
      async register(config: PluginChannelConfig) {
        // Provider 插件注册渠道
        console.log(`[PluginAPI] 插件 ${pluginId} 注册渠道:`, config);
        // TODO: 实现渠道注册逻辑
      },

      async test(channelId: string): Promise<ChannelTestResult> {
        // TODO: 实现渠道测试
        return { success: true, latency: 100 };
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

        const text = new TextDecoder().decode(data);
        await electronService.fs.writeFile(validation.fullPath!, text);
      },

      async deleteFile(path: string) {
        const validation = validateStoragePath(plugin, path);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        await electronService.fs.deleteFile(validation.fullPath!);
      },

      async listFiles(dir: string): Promise<string[]> {
        const validation = validateStoragePath(plugin, dir);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        return electronService.fs.readDir(validation.fullPath!);
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
 */
export function cleanupPluginResources(pluginId: string): void {
  eventListeners.delete(pluginId);
  dynamicMenuItems.delete(pluginId);
}
