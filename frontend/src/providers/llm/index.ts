/**
 * LLM Provider 工厂和导出
 */
import type { ModelConfig } from '../../types';
import type { LLMProvider } from './types';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { IPCLLMProvider, isLLMIPCAvailable } from './IPCLLMProvider';

export type { LLMProvider, ChatMessage } from './types';
export { GeminiProvider } from './GeminiProvider';
export { OpenAIProvider } from './OpenAIProvider';
export { ClaudeProvider } from './ClaudeProvider';
export { IPCLLMProvider } from './IPCLLMProvider';

/**
 * 创建 LLM Provider
 * Electron 环境下走 IPC（主进程 LangChain），非 Electron 环境走直连（开发/测试）
 */
export function createLLMProvider(config: ModelConfig): LLMProvider {
  // Electron 环境：所有 LLM 调用走 IPC → 主进程
  if (isLLMIPCAvailable()) {
    return new IPCLLMProvider(config);
  }

  // 非 Electron fallback（开发/测试用）
  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'openai':
    case 'openai-compatible':
      return new OpenAIProvider(config);
    case 'claude':
      return new ClaudeProvider(config);
    default:
      throw new Error(`未知的 LLM 服务商: ${config.provider}`);
  }
}
