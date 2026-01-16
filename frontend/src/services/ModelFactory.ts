/**
 * 模型工厂 - 兼容旧接口，使用新 Provider 系统
 */
import { AppSettings, ScriptAnalysisResult } from '../types';
import { createLLMProvider, LLMProvider } from '../providers';

// 保持旧接口兼容性
export interface ILLMProvider {
  analyzeScript(scriptText: string): Promise<ScriptAnalysisResult>;
}

// 工厂类
export class ModelFactory {
  static createLLMProvider(settings: AppSettings): ILLMProvider {
    const provider = createLLMProvider(settings.llm);
    return {
      analyzeScript: (scriptText: string) => provider.analyzeScript(scriptText),
    };
  }

  // 新方法：获取完整 Provider
  static createFullLLMProvider(settings: AppSettings): LLMProvider {
    return createLLMProvider(settings.llm);
  }
}

