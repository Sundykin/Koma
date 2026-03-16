/**
 * 分镜列表生成器
 * 从剧本文本自动生成分镜脚本
 */
import type { Shot, Character, Scene, AppSettings } from '../types';
import { getProjectLLMProvider } from '../providers';
import { getPromptTemplate, fillTemplate } from '../store/promptTemplates';
import { parseLLMJSON } from '../utils/llmJsonParser';

interface ShotListParams {
  settings: AppSettings;
  scriptText: string;
  characters?: Character[];
  scenes?: Scene[];
}

/**
 * 生成分镜列表
 * 使用 LLM 将剧本拆解为分镜
 */
export async function generateShotList(
  params: ShotListParams,
  onProgress: (progress: number, step?: string) => void
): Promise<Shot[]> {
  const { scriptText, characters: _characters, scenes: _scenes } = params;

  const provider = await getProjectLLMProvider();
  if (!provider) {
    throw new Error('未配置 LLM 模型');
  }

  // 加载 Prompt 模板
  const template = await getPromptTemplate('shot_breakdown');
  const prompt = fillTemplate(template.template, { script: scriptText });

  onProgress(10, '分析剧本结构...');

  const response = await provider.chat([
    {
      role: 'user',
      content: prompt,
    },
  ]);

  onProgress(70, '解析分镜数据...');

  const data = parseLLMJSON<any>(response);
  const shots: Shot[] = data.shots.map((s: any, idx: number) => ({
    id: `shot-${Date.now()}-${idx}`,
    scriptContent: s.scriptContent || '',
    shotType: s.shotType || 'medium',
    cameraMovement: s.cameraMovement || 'static',
    duration: s.duration || 3,
    description: s.description || '',
    characters: s.characters || [],
    dialogue: s.dialogue,
    emotion: s.emotion,
  }));

  onProgress(100, '分镜生成完成');

  return shots;
}

export default generateShotList;
