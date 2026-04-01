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

  // 规范化 openai-compatible → openai
  const normalizedProvider = config.provider === 'openai-compatible' ? 'openai' : config.provider;

  // 非 Electron fallback（开发/测试用）— 生产环境禁止直连，防止 API key 暴露
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    throw new Error('[LLMProvider] Production environment must use IPC — direct API key access is not allowed');
  }
  switch (normalizedProvider) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'claude':
      return new ClaudeProvider(config);
    default:
      throw new Error(`未知的 LLM 服务商: ${config.provider}`);
  }
}
