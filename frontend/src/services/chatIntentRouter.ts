/**
 * 对话意图路由
 *
 * 用一次结构化 LLM 调用判断用户输入意图：聊天 / 文生图 / 图生图 / 图生视频。
 * 走前端 chatIPC.llm.query → Electron 主进程 → LangChain，复用当前选定的 chat 模型。
 *
 * 调用失败或返回非法 JSON 时回退到关键字匹配 (detectChatMediaMode)。
 */
import { z } from 'zod';
import { chatIPC } from '../chat/ipc';
import type { LLMQueryRequest } from '../chat/ipc';
import type { LLMModelConfig } from '../types';
import { detectChatMediaMode, type ChatMediaMode } from '../components/chat/chatMediaGeneration';
import { createLogger } from '../store/logger';

const logger = createLogger('ChatIntentRouter');

const IntentSchema = z.object({
  mode: z.enum(['chat', 'text-to-image', 'image-to-image', 'image-to-video']),
});

const SYSTEM_PROMPT = `你是一个意图分类器，根据用户消息判断它属于以下哪一类，并仅返回 JSON：

- "chat"：普通对话、提问、闲聊、写作、分析、写代码等不涉及生成图片或视频的请求
- "text-to-image"：用户要求生成图片，且没有提供任何参考图
- "image-to-image"：用户要求基于参考图生成新图（垫图、改图、重绘、参考生图），需要参考图存在
- "image-to-video"：用户要求把参考图转成视频（图生视频、动起来），需要参考图存在

只输出严格的 JSON 对象，形如 {"mode": "chat"} —— 不要输出解释、代码块或任何额外字符。`;

function buildUserPrompt(text: string, hasImageInput: boolean): string {
  const lines = [
    `用户消息：${text || '(空)'}`,
    `是否提供了参考图：${hasImageInput ? '是' : '否'}`,
    '请返回意图 JSON。',
  ];
  return lines.join('\n');
}

export async function classifyChatIntent(params: {
  text: string;
  hasImageInput: boolean;
  llmConfig: Pick<LLMModelConfig, 'profileId' | 'provider' | 'modelName' | 'apiKey' | 'baseUrl'>;
}): Promise<ChatMediaMode> {
  const { text, hasImageInput, llmConfig } = params;

  const fallback = (): ChatMediaMode => detectChatMediaMode(text, hasImageInput ? [{ id: '', file: new File([], ''), type: 'image' } as any] : []);

  if (!chatIPC.llm.isAvailable()) {
    return fallback();
  }

  const request: LLMQueryRequest = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(text, hasImageInput) },
    ],
    config: {
      profileId: llmConfig.profileId,
      modelProvider: llmConfig.provider,
      modelName: llmConfig.modelName,
      apiKey: llmConfig.apiKey,
      baseUrl: llmConfig.baseUrl,
      temperature: 0,
      maxTokens: 32,
    },
    options: {
      source: 'chat-intent-router',
      taskKind: 'structured',
      responseFormat: 'json_object',
      timeoutMs: 8000,
    },
  };

  try {
    const response = await chatIPC.llm.query(request);
    if (response.error || !response.content) {
      logger.warn('意图路由 LLM 调用失败，回退关键字', response.error);
      return fallback();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      const match = response.content.match(/\{[\s\S]*\}/);
      if (!match) {
        logger.warn('意图路由响应非 JSON，回退关键字', { content: response.content });
        return fallback();
      }
      parsed = JSON.parse(match[0]);
    }

    const validated = IntentSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn('意图路由 JSON 不符合 schema，回退关键字', validated.error);
      return fallback();
    }

    // 一致性校验：选 image-to-image / image-to-video 但没有参考图，纠正回 text-to-image / chat
    const { mode } = validated.data;
    if ((mode === 'image-to-image' || mode === 'image-to-video') && !hasImageInput) {
      return mode === 'image-to-video' ? 'chat' : 'text-to-image';
    }
    return mode;
  } catch (err) {
    logger.warn('意图路由抛错，回退关键字', err);
    return fallback();
  }
}
