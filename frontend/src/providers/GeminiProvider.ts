/**
 * Gemini LLM Provider
 */
import { GoogleGenAI, Type, Schema } from '@google/genai';
import type { ModelConfig, ScriptAnalysisResult } from '../types';
import type { LLMProvider } from './types';

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

  async analyzeScript(script: string): Promise<ScriptAnalysisResult> {
    const ai = this.getAI();

    const prompt = `
      你是一位专业的电影导演和剧本分析 AI。
      请分析以下短剧剧本片段。
      1. 提取所有角色，并生成详细的视觉外貌描述（appearance），用于后续 AI 绘图。
      2. 提取所有场景（包含地点、氛围）。
      3. 提取剧本中出现的重要道具（Props），如：武器、信物、车辆、特殊物品等。
      4. 将剧本拆解为独立的分镜镜头（Storyboard）。

      对于每个镜头，建议最佳的拍摄角度（shotType）、运镜方式（cameraMovement）以及用于视频生成模型的视觉描述（description）。
      同时提取台词（dialogue）和情绪（emotion）。

      请注意：
      - 所有返回的文本内容（如名称、描述）必须是简体中文。
      - description 字段应为一段详细的画面描述，适合作为视频生成模型的 Prompt。

      剧本内容:
      ${script}
    `;

    const response = await ai.models.generateContent({
      model: this.config.modelName || 'gemini-2.0-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: analysisSchema,
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as ScriptAnalysisResult;
    }
    throw new Error('No response from Gemini');
  }
}

export default GeminiProvider;
