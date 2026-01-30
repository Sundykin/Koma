/**
 * Hooks 模块导出
 */
export { useChat } from './useChatIPC';
export type { UseChatOptions, UseChatReturn } from './useChatIPC';

// 保留旧版本导出（兼容）
export { useChat as useChatLegacy } from './useChat';
export type { UseChatOptions as UseChatOptionsLegacy, UseChatReturn as UseChatReturnLegacy } from './useChat';
