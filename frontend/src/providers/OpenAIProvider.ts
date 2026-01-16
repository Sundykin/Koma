/**
 * OpenAI LLM Provider
 */
import type { ModelConfig, ScriptAnalysisResult } from '../types';
import type { LLMProvider } from './types';

export class OpenAIProvider implements LLMProvider {
  type = 'openai';
  config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://api.openai.com/v1'}/models`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: { role: string; content: string }[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(
      `${this.config.baseUrl || 'https://api.openai.com/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.modelName || 'gpt-4',
          messages,
        }),
      }
    );

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async analyzeScript(script: string): Promise<ScriptAnalysisResult> {
    const systemPrompt = `
      你是一位专业的电影导演和剧本分析 AI。
      请分析剧本并返回 JSON 格式的结果，包含以下字段：
      - characters: 角色列表，每个角色包含 id, name, age, role (protagonist/antagonist/supporting), description, appearance
      - scenes: 场景列表，每个场景包含 id, name, location, time (day/night/twilight), mood, description
      - props: 道具列表，每个道具包含 id, name, type, description
      - shots: 分镜列表，每个分镜包含 id, scriptContent, shotType (close-up/medium/wide/extreme-wide), cameraMovement (static/pan/zoom-in/tracking), duration, description, dialogue, emotion, characters (ID 数组)

      所有文本必须是简体中文。返回纯 JSON，不要任何解释。
    `;

    const result = await this.generateText(script, systemPrompt);
    try {
      return JSON.parse(result) as ScriptAnalysisResult;
    } catch {
      throw new Error('Failed to parse script analysis result');
    }
  }
}

export default OpenAIProvider;
