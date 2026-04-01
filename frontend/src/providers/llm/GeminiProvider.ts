/**
 * Gemini LLM Provider
 */
import { GoogleGenAI, Type, Schema } from '@google/genai';
import type { ModelConfig } from '../../types';
import type { LLMProvider, ChatMessage, LLMCallOptions } from './types';
import { createLogger } from '../../store/logger';

// 剧本分析 Schema
const _analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    characters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          age: { type: Type.STRING },
          role: {
            type: Type.STRING,
            enum: ['protagonist', 'antagonist', 'supporting'],
          },
          description: { type: Type.STRING },
          appearance: { type: Type.STRING },
        },
        required: ['id', 'name', 'role', 'description', 'appearance'],
      },
    },
    scenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          location: { type: Type.STRING },
          time: { type: Type.STRING, enum: ['day', 'night', 'twilight'] },
          mood: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ['id', 'name', 'location', 'mood'],
      },
    },
    props: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          type: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ['id', 'name', 'type', 'description'],
      },
    },
    shots: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          scriptContent: { type: Type.STRING },
          shotType: {
            type: Type.STRING,
            enum: ['close-up', 'medium', 'wide', 'extreme-wide'],
          },
          cameraMovement: {
            type: Type.STRING,
            enum: ['static', 'pan', 'zoom-in', 'tracking'],
          },
          duration: { type: Type.NUMBER },
          description: { type: Type.STRING },
          dialogue: { type: Type.STRING },
          emotion: { type: Type.STRING },
          characters: { type: Type.ARRAY, items: { type: Type.STRING } },
          props: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['id', 'scriptContent', 'shotType', 'description'],
      },
    },
  },
  required: ['characters', 'scenes', 'props', 'shots'],
};

const logger = createLogger('GeminiProvider');

export class GeminiProvider implements LLMProvider {
  type = 'gemini';
  config: ModelConfig;
  private ai: GoogleGenAI | null = null;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) {
      throw new Error('模型名称未配置');
    }
    return value;
  }

  validate(): boolean {
    return Boolean(this.config.apiKey && this.config.apiKey.length > 0 && String(this.config.modelName || '').trim());
  }

  private getAI(): GoogleGenAI {
    if (!this.ai) {
      this.ai = new GoogleGenAI({ apiKey: this.config.apiKey });
    }
    return this.ai;
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: this.getModelName(),
        contents: 'Hello',
        config: { maxOutputTokens: 10 },
      });
      return !!response.text;
    } catch {
      return false;
    }
  }

  async generateText(prompt: string, systemPrompt?: string, options?: LLMCallOptions): Promise<string> {
    const ai = this.getAI();
    const modelName = this.getModelName();
    logger.info('发起 Gemini generateText 请求', {
      traceId: options?.traceId,
      model: modelName,
      source: options?.source,
      operation: options?.operation,
      transport: 'direct',
    });
    const response = await ai.models.generateContent({
      model: modelName,
      contents: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
    });
    logger.info('Gemini generateText 完成', {
      traceId: options?.traceId,
      contentLength: response.text?.length || 0,
      transport: 'direct',
    });
    return response.text || '';
  }

  async chat(messages: ChatMessage[], options?: LLMCallOptions): Promise<string> {
    const ai = this.getAI();
    const modelName = this.getModelName();
    // 将 messages 转换为 Gemini 格式
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    // 提取 system prompt
    const systemMessage = messages.find(m => m.role === 'system');
    const systemInstruction = systemMessage?.content;

    logger.info('发起 Gemini chat 请求', {
      traceId: options?.traceId,
      model: modelName,
      messageCount: messages.length,
      source: options?.source,
      operation: options?.operation,
      transport: 'direct',
    });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents.filter(c => c.role !== 'system'),
      config: systemInstruction ? { systemInstruction } : undefined,
    });
    logger.info('Gemini chat 完成', {
      traceId: options?.traceId,
      contentLength: response.text?.length || 0,
      transport: 'direct',
    });
    return response.text || '';
  }
}

export default GeminiProvider;
