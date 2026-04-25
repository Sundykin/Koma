/**
 * Anthropic Provider（Claude 系列）
 */
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LLMProvider, CreateChatModelOptions } from './types';

export class AnthropicProvider implements LLMProvider {
  createChatModel(options: CreateChatModelOptions): BaseChatModel {
    const {
      modelName,
      apiKey,
      temperature = 0.7,
      maxTokens,
    } = options;

    return new ChatAnthropic({
      model: modelName || 'claude-sonnet-4-20250514',
      apiKey,
      temperature,
      maxTokens,
    });
  }
}
