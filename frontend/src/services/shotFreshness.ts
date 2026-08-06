/**
 * 分镜脚本 → 提示词的新鲜度追踪。
 *
 * 问题：用户编辑分镜脚本后，此前生成的图片/视频提示词静默滞后——
 * 要么忘了重新生成提示词直接出图（画面与剧本不符），要么凭记忆核对。
 * 成熟管线工具（ComfyUI 把节点标 stale、构建系统追踪 dirty）都会显式标记。
 *
 * 做法：生成提示词成功时把当时的脚本指纹（FNV-1a 哈希）写到
 * shot.promptScriptHash；渲染时对比当前指纹，不一致即提示"脚本已改"。
 */
import type { ShotScriptLine } from '../types/scene-character';

/** FNV-1a 32 位：够用的内容指纹（非加密用途） */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** 计算脚本行列表的内容指纹（角色/文本/说话人都参与） */
export function computeShotScriptHash(scriptLines: ShotScriptLine[] | undefined): string {
  const normalized = (scriptLines ?? [])
    .map(line => `${line.role ?? 'narration'}|${line.characterId ?? ''}|${String(line.text ?? '').trim()}`)
    .join('\n');
  return fnv1a(normalized);
}

/**
 * 提示词是否滞后于当前脚本。
 * 仅当"有提示词 + 有生成时的指纹 + 与当前指纹不同"才判滞后；
 * 从未生成过提示词（无指纹）不算滞后——那是"还没生成"，由别的入口引导。
 */
export function isShotPromptStale(shot: {
  imagePrompt?: string;
  videoPrompt?: string;
  promptScriptHash?: string;
  scriptLines?: ShotScriptLine[];
}): boolean {
  const hasPrompt = Boolean(shot.imagePrompt?.trim() || shot.videoPrompt?.trim());
  if (!hasPrompt || !shot.promptScriptHash) return false;
  return computeShotScriptHash(shot.scriptLines) !== shot.promptScriptHash;
}
