/**
 * AI 自动剧集服务
 * 支持将完整剧本智能拆分为多个剧集
 */
import type { LLMModelConfig } from '../types';
import { createLLMProvider } from '../providers';
import { parseLLMJSON } from '../utils/llmJsonParser';

export interface SplitOptions {
  targetEpisodeCount?: number;
  maxEpisodeDuration?: number;
  splitStrategy: 'auto' | 'scene' | 'chapter';
}

export interface SplitPoint {
  position: number;
  marker: string;
  reason: string;
}

export interface SplitAnalysis {
  suggestedCount: number;
  splitPoints: SplitPoint[];
  reasoning: string;
}

export interface SplitResult {
  title: string;
  scriptText: string;
  summary: string;
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// 上下文管理器
class ContextManager {
  private messages: Message[] = [];
  private maxTokens: number;
  private threshold: number;
  private keepRecentTurns: number;

  constructor(options: {
    maxTokens?: number;
    threshold?: number;
    keepRecentTurns?: number;
  } = {}) {
    this.maxTokens = options.maxTokens || 100000;
    this.threshold = options.threshold || 0.8;
    this.keepRecentTurns = options.keepRecentTurns || 3;
  }

  // 估算 token 数量（简单估算：4字符 ≈ 1 token）
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  get contextSize(): number {
    return this.messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
  }

  addMessage(message: Message): void {
    this.messages.push(message);
  }

  // 检查是否需要压缩
  needsCompression(): boolean {
    return this.contextSize > this.maxTokens * this.threshold;
  }

  // 压缩上下文
  async compress(provider: ReturnType<typeof createLLMProvider>): Promise<void> {
    if (this.messages.length <= this.keepRecentTurns * 2 + 1) {
      return; // 消息太少，不需要压缩
    }

    // 保留系统消息
    const systemMessage = this.messages.find(m => m.role === 'system');
    // 保留最近的对话
    const recentMessages = this.messages.slice(-this.keepRecentTurns * 2);
    // 需要压缩的历史消息
    const historyToCompress = this.messages.slice(
      systemMessage ? 1 : 0,
      -this.keepRecentTurns * 2
    );

    if (historyToCompress.length === 0) return;

    // 生成摘要
    const historyText = historyToCompress
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n');

    const summaryPrompt = `请将以下对话历史压缩为简洁的摘要，保留关键信息：\n\n${historyText}\n\n摘要：`;

    try {
      const summary = await provider.generateText(summaryPrompt, '你是一个文本压缩助手');

      // 重建消息列表
      this.messages = [
        ...(systemMessage ? [systemMessage] : []),
        { role: 'assistant' as const, content: `[历史摘要] ${summary}` },
        ...recentMessages,
      ];
    } catch {
      // 压缩失败时直接截断
      this.messages = [
        ...(systemMessage ? [systemMessage] : []),
        ...recentMessages,
      ];
    }
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }
}

export class EpisodeSplitService {
  private provider: ReturnType<typeof createLLMProvider>;
  private contextManager: ContextManager;
  private aborted = false;

  constructor(llmConfig: LLMModelConfig) {
    this.provider = createLLMProvider({
      provider: llmConfig.provider === 'openai-compatible' ? 'openai' : llmConfig.provider as any,
      apiKey: llmConfig.apiKey,
      baseUrl: llmConfig.baseUrl,
      modelName: llmConfig.modelName,
    });
    this.contextManager = new ContextManager();
  }

  abort(): void {
    this.aborted = true;
  }

  // 安全解析 JSON（委托给 parseLLMJSON 工具函数）
  private safeParseJSON<T>(text: string): T {
    return parseLLMJSON<T>(text);
  }

  // 分析剧本，返回建议的剧集方案
  async analyzeScript(script: string, options: SplitOptions): Promise<SplitAnalysis> {
    this.aborted = false;
    this.contextManager.clear();

    const systemPrompt = `��是一个专业的影视编剧，擅长分析剧本结构和规划剧集。
分析时请考虑：
1. 故事弧线的完整性
2. 情节的自然过渡点
3. 每集的戏剧张力
4. 角色发展的节奏`;

    this.contextManager.addMessage({ role: 'system', content: systemPrompt });

    const userPrompt = `请分析以下剧本的结构，建议如何剧集。

剧本内容：
${script.slice(0, 30000)}${script.length > 30000 ? '\n...(剧本过长已截断)' : ''}

要求：
${options.targetEpisodeCount ? `- 目标分成 ${options.targetEpisodeCount} 集` : '- 根据剧情自动判断合适的集数'}
- 剧集策略: ${options.splitStrategy === 'scene' ? '按场景分割' : options.splitStrategy === 'chapter' ? '按章节分割' : '智能分析'}

请以 JSON 格式输出分析结果：
{
  "suggestedCount": 数字,
  "splitPoints": [
    { "position": 大约的字符位置, "marker": "分割标记文本", "reason": "分割理由" }
  ],
  "reasoning": "整体分析说明"
}`;

    this.contextManager.addMessage({ role: 'user', content: userPrompt });

    const response = await this.provider.generateText(
      this.contextManager.getMessages().map(m => m.content).join('\n\n'),
      systemPrompt
    );

    this.contextManager.addMessage({ role: 'assistant', content: response });

    try {
      return this.safeParseJSON<SplitAnalysis>(response);
    } catch {
      // 解析失败时返回默认值
      return {
        suggestedCount: options.targetEpisodeCount || 3,
        splitPoints: [],
        reasoning: response,
      };
    }
  }

  // 执行剧集
  async splitScript(script: string, suggestedCount: number): Promise<SplitResult[]> {
    if (this.aborted) return [];

    // 检查是否需要压缩上下文
    if (this.contextManager.needsCompression()) {
      await this.contextManager.compress(this.provider);
    }

    const splitPrompt = `基于之前的分析，现在请将剧本实际分割成 ${suggestedCount} 集。

要求：
1. 每集标题要能体现该集主要内容
2. 保持剧本原文完整性，不要改写或缩减
3. 分割点选在情节自然过渡处
4. 每集提供简短摘要

请以 JSON 格式输出：
{
  "episodes": [
    { "title": "第X集标题", "scriptText": "该集完整剧本内容", "summary": "本集摘要" }
  ]
}

剧本：
${script}`;

    this.contextManager.addMessage({ role: 'user', content: splitPrompt });

    const response = await this.provider.generateText(
      this.contextManager.getMessages().map(m => m.content).join('\n\n'),
      '你是一个专业的影视编剧'
    );

    if (this.aborted) return [];

    try {
      const parsed = this.safeParseJSON<{ episodes: SplitResult[] }>(response);
      return parsed.episodes;
    } catch {
      // 如果解析失败，尝试简单分割
      const avgLength = Math.ceil(script.length / suggestedCount);
      const episodes: SplitResult[] = [];

      for (let i = 0; i < suggestedCount; i++) {
        const start = i * avgLength;
        const end = Math.min((i + 1) * avgLength, script.length);
        episodes.push({
          title: `第 ${i + 1} 集`,
          scriptText: script.slice(start, end),
          summary: '自动分割',
        });
      }

      return episodes;
    }
  }
}

export default EpisodeSplitService;
