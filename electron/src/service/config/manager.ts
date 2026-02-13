/**
 * 配置管理器
 * 编排引导配置和模块注册
 */
import { storagePathLoader } from './bootstrap/storagePath';
import { configRegistry } from './registry';
import { providerConfigModule } from './modules/providerConfig';
import { pluginStateModule } from './modules/pluginState';
import { appSettingsModule } from './modules/appSettings';
import { recentProjectsModule } from './modules/recentProjects';
import { modelPresetsModule } from './modules/modelPresets';
import { customTemplatesModule } from './modules/customTemplates';
import { chatSessionsModule } from './modules/chatSessions';
import { providerInstancesModule } from '../provider/instance-store';

export class ConfigManager {
  private initialized = false;

  async init(customRoot?: string): Promise<void> {
    if (this.initialized) return;

    // 1. 加载存储路径
    const paths = await storagePathLoader.load(customRoot);
    console.log('[ConfigManager] Storage path:', paths.dataDir);

    // 2. 初始化配置注册中心
    await configRegistry.init(paths.dataDir);

    // 3. 注册内置模块
    configRegistry.register(providerConfigModule);
    configRegistry.register(pluginStateModule);
    configRegistry.register(providerInstancesModule);
    configRegistry.register(appSettingsModule);
    configRegistry.register(recentProjectsModule);
    configRegistry.register(modelPresetsModule);
    configRegistry.register(customTemplatesModule);
    configRegistry.register(chatSessionsModule);

    // 4. 预加载所有模块
    for (const moduleId of configRegistry.getRegisteredModules()) {
      await configRegistry.get(moduleId);
    }

    this.initialized = true;
    console.log('[ConfigManager] Initialization complete');
  }

  getStoragePathLoader() { return storagePathLoader; }
  getRegistry() { return configRegistry; }
  isInitialized() { return this.initialized; }
}

export const configManager = new ConfigManager();
