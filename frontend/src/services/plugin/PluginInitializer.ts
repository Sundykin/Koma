/**
 * 插件初始化器
 * 在应用启动时初始化所有已启用的 Provider 插件
 */
import { usePluginStore, waitForPluginStoreRehydration } from '../../store/pluginStore';
import { loadPluginComponent, loadProviderPlugin, isPluginLoaded } from './PluginLoader';
import { createPluginAPI } from './PluginAPI';
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

    // 根据插件类型选择加载函数
    let exports;
    if (plugin.category === 'global') {
      exports = await loadPluginComponent(plugin);
    } else if (plugin.category === 'provider') {
      exports = await loadProviderPlugin(plugin);
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
 * 初始化所有已启用的 Provider 插件
 * 在应用启动时调用，确保渠道配置在设置页面可用
 */
export async function initializeProviderPlugins(): Promise<{
  total: number;
  success: number;
  failed: string[];
}> {
  // 等待 pluginStore 数据恢复完成
  await waitForPluginStoreRehydration();
  console.log('[PluginInitializer] pluginStore 数据已恢复');

  const plugins = usePluginStore.getState().plugins;

  // 筛选已启用的插件（global 类型插件也可能注册 Provider）
  const enabledPlugins = plugins.filter(p => p.isEnabled);

  if (enabledPlugins.length === 0) {
    console.log('[PluginInitializer] 没有已启用的插件');
    return { total: 0, success: 0, failed: [] };
  }

  console.log(`[PluginInitializer] 开始初始化 ${enabledPlugins.length} 个插件`);

  // 串行初始化插件，避免竞态条件
  const failed: string[] = [];
  let success = 0;

  for (const plugin of enabledPlugins) {
    const result = await initializePlugin(plugin);
    if (result) {
      success++;
    } else {
      failed.push(plugin.id);
    }
  }

  console.log(`[PluginInitializer] 初始化完成: ${success}/${enabledPlugins.length} 成功`);

  return {
    total: enabledPlugins.length,
    success,
    failed,
  };
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
