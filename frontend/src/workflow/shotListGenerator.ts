/**
 * 分镜列表生成器
 * 从剧本文本自动生成分镜脚本
 */
import type { Shot, Character, Scene, AppSettings, ScriptAnalysisResult } from '../types';
import { createLLMProvider } from '../providers';
import { getPromptTemplate, fillTemplate } from '../store/promptTemplates';

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
  const { settings, scriptText, characters, scenes } = params;

  const provider = createLLMProvider(settings.llm, settings.customChannels || []);

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

  // 解析返回的 JSON
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('无法解析分镜格式');
  }

  const data = JSON.parse(jsonMatch[0]);
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
