/**
 * AI 剧本生成器
 * 使用 LLM 生成完整剧本
 */
import type { AppSettings, Character, Scene } from '../types';
import { getProjectLLMProvider } from '../providers';
import { getPromptTemplate, fillTemplate } from '../store/promptTemplates';

interface ScriptGeneratorParams {
  settings: AppSettings;
  topic: string;
  genre: string;
  characters?: Character[];
  scenes?: Scene[];
  episodeCount?: number;
}

interface GeneratedScript {
  title: string;
  episodes: {
    number: number;
    title: string;
    content: string;
  }[];
}

interface ScriptFromIdeaParams {
  settings: AppSettings;
  idea: string;
  style: string;
  duration: string;
}

// 随机创意接口
interface RandomIdea {
  topic: string;
  style: string;
  keyElements: string[];
  logline: string;
}

/**
 * 生成随机创意
 */
export async function generateRandomIdea(
  onProgress?: (progress: number, step?: string) => void
): Promise<RandomIdea> {
  const provider = await getProjectLLMProvider();
  if (!provider) {
    throw new Error('未配置 LLM 模型');
  }

  onProgress?.(5, '加载 Prompt 模板...');
  const template = await getPromptTemplate('random_idea_generation');

  onProgress?.(20, '正在生成随机创意...');
  const response = await provider.chat([
    { role: 'user', content: template.template },
  ]);

  onProgress?.(80, '解析创意...');

  // 解析返回的 JSON
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                    response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('无法解析创意格式');
  }

  const jsonStr = jsonMatch[1] || jsonMatch[0];
  const idea: RandomIdea = JSON.parse(jsonStr);

  onProgress?.(100, '创意生成完成');
  return idea;
}

/**
 * 随机生成剧本（先生成创意再生成剧本）
 */
export async function generateRandomScript(
  duration: string = '3',
  onProgress?: (progress: number, step?: string) => void
): Promise<string> {
  // 第一步：生成随机创意
  onProgress?.(5, '正在生成随机创意...');
  const idea = await generateRandomIdea((p, s) => {
    onProgress?.(5 + p * 0.3, s);
  });

  // 第二步：基于创意生成剧本
  onProgress?.(40, '正在基于创意生成剧本...');
  const ideaText = `${idea.logline}\n关键元素: ${idea.keyElements.join(', ')}`;

  const script = await generateScriptFromIdea(
    {
      settings: {} as AppSettings,
      idea: ideaText,
      style: idea.style,
      duration,
    },
    (p, s) => {
      onProgress?.(40 + p * 0.6, s);
    }
  );

  onProgress?.(100, '剧本生成完成');
  return script;
}

/**
 * 从创意生成剧本（使用 Prompt 模板）
 */
export async function generateScriptFromIdea(
  params: ScriptFromIdeaParams,
  onProgress: (progress: number, step?: string) => void
): Promise<string> {
  const { idea, style, duration } = params;
  const provider = await getProjectLLMProvider();
  if (!provider) {
    throw new Error('未配置 LLM 模型');
  }

  onProgress(5, '加载 Prompt 模板...');
  const template = await getPromptTemplate('script_generation');

  const prompt = fillTemplate(template.template, {
    idea,
    style,
    duration,
  });

  onProgress(10, '正在生成剧本...');
  const response = await provider.chat([
    { role: 'user', content: prompt },
  ]);

  onProgress(100, '剧本生成完成');
  return response;
}

/**
 * 润色剧本（使用 Prompt 模板）
 */
export async function polishScript(
  settings: AppSettings,
  script: string,
  requirements: string = '使语言更加生动，对话更自然',
  onProgress: (progress: number, step?: string) => void
): Promise<string> {
  const provider = await getProjectLLMProvider();
  if (!provider) {
    throw new Error('未配置 LLM 模型');
  }

  onProgress(5, '加载 Prompt 模板...');
  const template = await getPromptTemplate('script_polish');

  const prompt = fillTemplate(template.template, {
    script,
    requirements,
  });

  onProgress(10, '正在润色剧本...');
  const response = await provider.chat([
    { role: 'user', content: prompt },
  ]);

  onProgress(100, '润色完成');
  return response;
}

/**
 * 生成完整剧本
 */
export async function generateScript(
  params: ScriptGeneratorParams,
  onProgress: (progress: number, step?: string) => void
): Promise<GeneratedScript> {
  const { topic, genre, characters, scenes, episodeCount = 1 } = params;

  const provider = await getProjectLLMProvider();
  if (!provider) {
    throw new Error('未配置 LLM 模型');
  }

  // 构建角色描述
  const characterDesc = characters?.length
    ? characters.map((c) => `- ${c.name}: ${c.description}`).join('\n')
    : '（由AI自动创建角色）';

  // 构建场景描述
  const sceneDesc = scenes?.length
    ? scenes.map((s) => `- ${s.name}: ${s.description}`).join('\n')
    : '（由AI自动创建场景）';

  const prompt = `你是一位专业编剧。请根据以下信息创作一个短剧剧本：

主题/故事线索：${topic}
类型/题材：${genre}
集数：${episodeCount}

角色设定：
${characterDesc}

场景设定：
${sceneDesc}

要求：
1. 每集剧本必须包含场景描述、角色对话和动作指示
2. 使用标准剧本格式：
   - 场景标题格式：# 场景名 - 时间
   - 角色名单独一行
   - 台词用引号包裹
   - 动作/情绪用圆括号标注
3. 每集约500-800字
4. 故事要有起承转合，情节紧凑

请以JSON格式返回：
{
  "title": "剧本标题",
  "episodes": [
    {
      "number": 1,
      "title": "第一集标题",
      "content": "剧本内容..."
    }
  ]
}`;

  onProgress(10, '正在构思剧本...');

  const response = await provider.chat([
    {
      role: 'user',
      content: prompt,
    },
  ]);

  onProgress(80, '解析剧本结构...');

  // 解析返回的 JSON
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('无法解析剧本格式');
  }

  const script: GeneratedScript = JSON.parse(jsonMatch[0]);
  onProgress(100, '剧本生成完成');

  return script;
}

export default {
  generateScript,
  generateScriptFromIdea,
  generateRandomIdea,
  generateRandomScript,
  polishScript,
};
