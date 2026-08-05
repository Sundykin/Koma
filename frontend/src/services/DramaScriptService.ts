/**
 * 剧情模式 · 剧本解析服务（Drama Script Parse Service）
 *
 * 剧情模式下，用户粘贴的是完整小说。本服务把小说解析成**结构化剧本**：
 * 逐行标注【旁白】或【台词·角色名】（可选【场景】），作为后续分镜拆解
 * （drama 分支）与配音（台词按角色选音色、旁白走项目级音色）的输入。
 *
 * 产物落到 episode.scriptText，复用现有剧本工作台即可编辑。
 *
 * 行格式（与 drama_script_parse 模板输出一一对应，见 dramaScript.ts）：
 *   [旁白] 旁白内容
 *   [台词·角色名] 台词内容
 *   [场景] 场景描述
 */
import type { CreationContext } from './CreationContext';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { runWithTask } from './taskRunner';

/**
 * 从小说原文生成结构化剧本（纯文本，一行一条标记行）。
 * 支持流式（onStream），与 TweetCopyService.generateTweetScript 同一交互形态。
 */
export async function generateDramaScript(
  ctx: CreationContext,
  script: string,
  onProgress?: (progress: number, step?: string) => void,
  onStream?: (delta: string, accumulated: string) => void,
): Promise<string> {
  if (!script || !script.trim()) {
    throw new Error('剧本内容为空，无法解析为剧情剧本');
  }

  const { result } = await runWithTask({
    projectId: ctx.projectId,
    category: 'script',
    subType: 'script-analysis',
    targetType: 'episode',
    targetId: ctx.episodeId,
    targetName: '剧情剧本解析',
    type: 'script-analysis',
    metadata: { kind: 'drama-script-parse', streaming: !!onStream },
    execute: async (taskCtx) => {
      const update = (percent: number, step?: string) => {
        onProgress?.(percent, step);
        taskCtx.progress(percent, step);
      };
      update(5, '加载剧情剧本解析模板...');
      const resolvedPrompt = await resolvePromptTemplate('drama_script_parse', { script });

      update(15, onStream ? '正在流式解析剧本...' : '调用 LLM 解析剧本...');
      // 结构化剧本通常与原文量级相当（只做标注不改写），进度按原文长度估算
      const estimatedTargetLen = Math.max(600, script.length);
      let lastReportedPercent = 15;
      const handleChunk = onStream
        ? (delta: string, accumulated: string) => {
            onStream(delta, accumulated);
            const approxPercent = Math.min(90, 15 + Math.floor((accumulated.length / estimatedTargetLen) * 75));
            if (approxPercent > lastReportedPercent + 4) {
              lastReportedPercent = approxPercent;
              update(approxPercent, '正在流式解析剧本...');
            }
          }
        : undefined;

      const response = await ctx.llmProvider.chat(
        [{ role: 'user', content: resolvedPrompt.prompt }],
        onStream ? { stream: true } : undefined,
        handleChunk,
      );

      update(95, '清洗输出...');
      const cleaned = sanitizeDramaScript(response);
      if (onStream && cleaned !== response.trim()) {
        onStream('', cleaned);
      }

      update(100, '剧情剧本解析完成');
      return cleaned;
    },
  });
  return result;
}

/** 去掉代码块包裹 / 前缀解释，保留标记行与正文 */
function sanitizeDramaScript(raw: string): string {
  let text = (raw || '').trim();
  text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
  text = text.replace(/^(以下是|这是|输出[:：])\s*[^\n]*\n+/i, '').trim();
  return text;
}
