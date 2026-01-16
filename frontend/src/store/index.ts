/**
 * Store 模块统一导出
 */
export * from './storageConfig';
export * from './globalStore';
export * from './projectStore';

import storageConfig from './storageConfig';
import globalStore from './globalStore';
import projectStore from './projectStore';

export { storageConfig, globalStore, projectStore };
