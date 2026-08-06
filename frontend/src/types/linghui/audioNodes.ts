/**
 * 灵绘音频节点（从 types/linghui.ts 拆出）
 */
import type { LinghuiRunStatus } from './core';
import type { LinghuiNodeResult } from './graph';
import { getLinghuiResultPrimaryMedia } from './graph';

// --- 音频节点 ---

/**
 * 音频节点模式：与视频节点对齐。
 * - 'import'  → 音频参考节点：只承载上传的音频文件，不暴露 prompt / 模型 / 生成按钮。
 * - 'generate' → 音频生成器节点：走 ttsSelection + voiceId + prompt 链路。
 */
export type LinghuiAudioNodeMode = 'import' | 'generate';

export interface LinghuiAudioNodeProperties {
  source: string;
  prompt: string;
  ttsSelection: string;
  voiceId: string;
  /** 'import' 时音频节点是纯参考素材；缺省（旧节点）按 generate 处理。 */
  mode?: LinghuiAudioNodeMode;
}

/**
 * LibTV AudioNode 5 状态机派生视图（chunk 15gvxu:8505-8513）：
 *   generating / failed / resource / pending / empty_generate
 * 与 Text/Image/Video 节点完全同模板。
 */
export type LinghuiAudioNodeViewState =
  | 'generating'
  | 'failed'
  | 'resource'
  | 'pending'
  | 'empty_generate';

/**
 * 对齐 LibTV AudioNode 状态机（chunk 15gvxu:8505-8513）。
 * - 优先级 generating > failed > resource > pending > empty_generate
 * - resource：import 模式 / 有 source / 有 result 主音频
 * - pending：generate + 无音频 + 有上游
 */
export function resolveLinghuiAudioNodeViewState(args: {
  properties: LinghuiAudioNodeProperties;
  result?: LinghuiNodeResult;
  runStatus?: LinghuiRunStatus;
  hasIncomingEdge: boolean;
}): LinghuiAudioNodeViewState {
  const { properties, result, runStatus, hasIncomingEdge } = args;
  if (runStatus === 'running') return 'generating';
  if (runStatus === 'failed') return 'failed';
  const sourceLen = String(properties.source ?? '').trim().length;
  const primary = getLinghuiResultPrimaryMedia(result);
  const resultSourceLen = String(primary?.source ?? '').trim().length;
  if (properties.mode === 'import' || sourceLen > 0 || resultSourceLen > 0) return 'resource';
  if (hasIncomingEdge) return 'pending';
  return 'empty_generate';
}

