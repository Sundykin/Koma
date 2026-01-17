/**
 * Gemini LLM Provider
 */
import { GoogleGenAI, Type, Schema } from '@google/genai';
import type { ModelConfig, ScriptAnalysisResult } from '../../types';
import type { LLMProvider, ChatMessage } from './types';

// 剧本分析 Schema
const analysisSchema: Schema = {
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

export class GeminiProvider implements LLMProvider {
  type = 'gemini';
  config: ModelConfig;
  private ai: GoogleGenAI | null = null;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0;
  }

  private getAI(): GoogleGenAI {
    if (!this.ai) {
      this.ai = new GoogleGenAI({ apiKey: this.config.apiKey });
    }
    return this.ai;
  }

  async testConnection(): Promise<boolean> {
    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: this.config.modelName || 'gemini-2.0-flash',
        contents: 'Hello',
        config: { maxOutputTokens: 10 },
      });
      return !!response.text;
    } catch {
      return false;
    }
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const ai = this.getAI();
    const response = await ai.models.generateContent({
      model: this.config.modelName || 'gemini-2.0-flash',
      contents: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
    });
    return response.text || '';
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const ai = this.getAI();
    // 将 messages 转换为 Gemini 格式
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    // 提取 system prompt
    const systemMessage = messages.find(m => m.role === 'system');
    const systemInstruction = systemMessage?.content;

    const response = await ai.models.generateContent({
      model: this.config.modelName || 'gemini-2.0-flash',
      contents: contents.filter(c => c.role !== 'system'),
      config: systemInstruction ? { systemInstruction } : undefined,
    });
    return response.text || '';
  }
}

export default GeminiProvider;
