/**
 * 插件初始化器
 * 在应用启动时初始化所有已启用的 Provider 插件
 */
import { usePluginStore, waitForPluginStoreRehydration } from '../../store/pluginStore';
import { loadPluginComponent, loadProviderPlugin, isPluginLoaded } from './PluginLoader';
import { createPluginAPI } from './PluginAPI';
import { electronService } from '../electronService';
import type { InstalledPlugin } from '../../types/plugin';

// 已初始化的插件 ID 集合
const initializedPlugins = new Set<string>();

/**
 * 初始化单个插件（调用 onActivate）
 */
export async function initializePlugin(plugin: InstalledPlugin): Promise<boolean> {
  if (initializedPlugins.has(plugin.id)) {
    console.log(`[PluginInitializer] 插件 ${plugin.id} 已初始化，跳过`);
    return true;
  }

  try {
    console.log(`[PluginInitializer] 初始化插件: ${plugin.id}, category: ${plugin.category}`);

    // mcp / agent / provider 类型插件如果有 backend 入口，需要后端激活
    const needsBackendActivation =
      plugin.category === 'mcp' ||
      plugin.category === 'agent' ||
      (plugin.category === 'provider' && plugin.entry?.backend);

    if (needsBackendActivation) {
      const result = await electronService.ipc.invoke('plugin:activate', { manifest: plugin });
      if (!result?.success) {
        console.warn(`[PluginInitializer] 后端激活失败: ${plugin.id}`, result?.error);
        // provider 类型后端激活失败不阻止前端加载
        if (plugin.category !== 'provider') {
          return false;
        }
      } else {
        console.log(`[PluginInitializer] 插件 ${plugin.id} 后端激活成功`);
      }
    }

    // mcp / agent 只需后端激活
    if (plugin.category === 'mcp' || plugin.category === 'agent') {
      initializedPlugins.add(plugin.id);
      return true;
    }

    // global / provider / tool 类型由前端加载
    let exports;
    if (plugin.category === 'global') {
      exports = await loadPluginComponent(plugin);
    } else if (plugin.category === 'provider') {
      exports = await loadProviderPlugin(plugin);
    } else if (plugin.category === 'tool') {
      // tool 类型暂时走前端加载
      exports = await loadPluginComponent(plugin);
    } else {
      console.warn(`[PluginInitializer] 不支持的插件类型: ${plugin.category}`);
      return false;
    }

    if (!exports) {
      console.warn(`[PluginInitializer] 插件 ${plugin.id} 加载失败`);
      return false;
    }

    // 创建 API 实例并调用 onActivate
    if (exports.onActivate) {
      const api = createPluginAPI(plugin);
      await exports.onActivate(api);
      console.log(`[PluginInitializer] 插件 ${plugin.id} onActivate 执行成功`);
    }

    initializedPlugins.add(plugin.id);
    console.log(`[PluginInitializer] 插件 ${plugin.id} 初始化成功`);
    return true;
  } catch (err) {
    console.error(`[PluginInitializer] 插件 ${plugin.id} 初始化失败:`, err);
    return false;
  }
}

/**
 * 初始化所有已启用的插件
 * 启动时先和后端实际安装列表对账，清除已不存在的插件记录
 */
export async function initializeProviderPlugins(): Promise<{
  total: number;
  success: number;
  failed: string[];
}> {
  // 等待 pluginStore 数据恢复完成
  await waitForPluginStoreRehydration();
  console.log('[PluginInitializer] pluginStore 数据已恢复');

  // 和后端实际安装列表对账，清除 store 中已不存在的插件
  await reconcilePluginStore();

  const plugins = usePluginStore.getState().plugins;

  // 筛选已启用的插件（global 类型插件也可能注册 Provider）
  const enabledPlugins = plugins.filter(p => p.isEnabled);

  if (enabledPlugins.length === 0) {
    console.log('[PluginInitializer] 没有已启用的插件');
    return { total: 0, success: 0, failed: [] };
  }

  console.log(`[PluginInitializer] 开始初始化 ${enabledPlugins.length} 个插件`);

  // 按类型分组：不同类型间并行，同类型内串行（避免竞态）
  const groups = new Map<string, InstalledPlugin[]>();
  for (const plugin of enabledPlugins) {
    const cat = plugin.category || 'unknown';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(plugin);
  }

  const failed: string[] = [];
  let success = 0;

  const groupResults = await Promise.allSettled(
    Array.from(groups.entries()).map(async ([category, plugins]) => {
      console.log(`[PluginInitializer] 初始化 ${category} 类型插件 (${plugins.length} 个)`);
      for (const plugin of plugins) {
        const result = await initializePlugin(plugin);
        if (result) {
          success++;
        } else {
          failed.push(plugin.id);
        }
      }
    })
  );

  // 记录分组级别的错误
  groupResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`[PluginInitializer] 插件组初始化异常:`, result.reason);
    }
  });

  console.log(`[PluginInitializer] 初始化完成: ${success}/${enabledPlugins.length} 成功`);

  return {
    total: enabledPlugins.length,
    success,
    failed,
  };
}

/**
 * 对账：比较 store 中的插件列表与后端实际安装列表，移除已不存在的记录
 */
async function reconcilePluginStore(): Promise<void> {
  try {
    // 查询后端实际安装的插件
    const installedManifests = await electronService.ipc.invoke('plugin:list') as any[];
    const installedIds = new Set((installedManifests || []).map((m: any) => m.id));

    const store = usePluginStore.getState();
    const stalePlugins = store.plugins.filter(p => !installedIds.has(p.id));

    if (stalePlugins.length > 0) {
      console.warn(
        `[PluginInitializer] 发现 ${stalePlugins.length} 个已不存在的插件，清理:`,
        stalePlugins.map(p => p.id)
      );
      for (const p of stalePlugins) {
        store.unregisterPlugin(p.id);
      }
    }
  } catch (err) {
    // 对账失败不阻塞启动
    console.warn('[PluginInitializer] 插件对账失败，跳过:', err);
  }
}

/**
 * 检查插件是否已初始化
 */
export function isPluginInitialized(pluginId: string): boolean {
  return initializedPlugins.has(pluginId);
}

/**
 * 清除插件初始化状态（用于插件卸载时）
 */
export function clearPluginInitialized(pluginId: string): void {
  initializedPlugins.delete(pluginId);
}
