/**
 * LLM Provider 工厂和导出
 */
import type { ModelConfig } from '../../types';
import type { LLMProvider } from './types';
import { IPCLLMProvider, isLLMIPCAvailable } from './IPCLLMProvider';

export type { LLMProvider, ChatMessage } from './types';
export { IPCLLMProvider } from './IPCLLMProvider';

/**
 * 创建 LLM Provider
 * 所有 LLM 调用都必须走 Electron IPC → 主进程
 */
export function createLLMProvider(config: ModelConfig): LLMProvider {
  if (!isLLMIPCAvailable()) {
    throw new Error('[LLMProvider] Electron IPC is required — direct LLM access has been removed');
  }

  return new IPCLLMProvider(config);
}
