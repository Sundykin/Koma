/**
 * 分镜脚本摄影语言补全：把缺摄影语言的分镜脚本升级为专业剧本描述。
 *
 * 背景：旧模板拆解的分镜脚本可能没有景别/机位/光线（真实项目 24 镜全缺），
 * 而生图生视频的画面感依赖这些摄影语言。此服务用 LLM 把脚本改写为专业版本，
 * **保留剧情/台词/动作**，只补全摄影要素——旧数据无需整集重拆即可升级。
 *
 * 输出解析：LLM 返回改写后的完整一段脚本（含引号台词），用
 * parseShotScriptParagraph 解析成 ShotScriptLine[]（description 完整段，
 * 消费端 extractDialoguesFromDescription 提取台词）。
 */
import type { Shot, ShotScriptLine } from '../types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { parseShotScriptParagraph } from './dramaScript';
import { createLogger } from '../store/logger';

const logger = createLogger('ShotScriptUpgrade');

export interface ShotScriptUpgradeResult {
  success: boolean;
  scriptLines?: ShotScriptLine[];
  error?: string;
}

/** 把分镜脚本拼成 LLM 输入文本（description 完整段 + 声音行） */
export function shotScriptToText(shot: Pick<Shot, 'scriptLines'>): string {
  return (shot.scriptLines ?? [])
    .map(line => line.text?.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * 升级单个分镜的分镜脚本为专业版本（补摄影语言）。
 */
export interface UpgradeShotScriptOptions {
  /** 默认升级（补摄影语言）；'rewrite' 换拍法（重写画面表达） */
  mode?: 'upgrade' | 'rewrite';
}

export async function upgradeShotScript(
  projectId: string,
  episodeId: string,
  shot: Shot,
  llmSelection?: string,
  options?: UpgradeShotScriptOptions,
): Promise<ShotScriptUpgradeResult> {
  const currentText = shotScriptToText(shot).trim();
  if (!currentText) {
    return { success: false, error: '分镜脚本为空，无法升级' };
  }

  try {
    const { createCreationContext } = await import('./CreationContext');
    const ctx = await createCreationContext(projectId, episodeId, {
      llmConfigId: llmSelection,
    });
    const templateId = options?.mode === 'rewrite' ? 'shot_script_rewrite' : 'shot_script_upgrade';
    const resolved = await resolvePromptTemplate(templateId, {
      script: currentText,
    });
    const result = await ctx.llmProvider.chat([
      { role: 'user', content: resolved.prompt },
    ]);

    const upgraded = String(result || '').trim();
    // 剥离 LLM 可能的围栏/前后说明
    const cleaned = upgraded.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
    if (!cleaned) {
      return { success: false, error: '升级结果为空' };
    }

    const parsed = parseShotScriptParagraph(cleaned);
    if (parsed.length === 0) {
      return { success: false, error: '升级结果无法解析' };
    }

    // parseShotScriptParagraph 输出的是无 id 的结构，补齐 ShotScriptLine 的 id/characterId
    const scriptLines: ShotScriptLine[] = parsed.map((line, index) => ({
      id: `upgrade-${shot.id}-${index}`,
      text: line.text,
      role: line.role,
      ...(line.role === 'dialogue' && (line as { speaker?: string }).speaker
        ? { characterId: (line as { speaker?: string }).speaker }
        : {}),
    }));

    logger.info('分镜脚本升级完成', {
      shotId: shot.id,
      charsBefore: currentText.length,
      charsAfter: cleaned.length,
    });

    return { success: true, scriptLines };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('分镜脚本升级失败', { shotId: shot.id, error });
    return { success: false, error };
  }
}
