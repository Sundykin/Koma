/**
 * 配置管理系统统一导出
 */
export * from './types';
export { ConfigRegistry, configRegistry } from './registry';
export { ConfigManager, configManager } from './manager';
export { storagePathLoader } from './bootstrap/storagePath';
export type { StoragePaths } from './bootstrap/storagePath';
export type { ProviderConfigData } from './modules/providerConfig';
export type { PluginStateConfig } from './modules/pluginState';
