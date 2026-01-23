/**
 * Store 模块统一导出
 */
export * from './storageConfig';
export * from './globalStore';
export * from './projectStore';
export * from './resourceStore';
export * from './trackStore';

// 新的模块化 settings（逐步迁移用）
export * as settingsStore from './settings';

import storageConfig from './storageConfig';
import globalStore from './globalStore';
import projectStore from './projectStore';
import { useResourceStore, resourceStore } from './resourceStore';
import { useTrackStore, trackStore } from './trackStore';

export { storageConfig, globalStore, projectStore, useResourceStore, resourceStore, useTrackStore, trackStore };
