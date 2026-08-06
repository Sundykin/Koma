/**
 * 灵绘视频节点类型（从 types/linghui.ts 拆出）
 */
import type { LinghuiScriptDerivedProperties } from './imageNodes';
import type { VideoGenerationCapability } from '../media';

// --- 视频节点 ---

export type LinghuiVideoCapability = VideoGenerationCapability;

/**
 * 视频节点模式：对齐 LibTV 节点分流。
 * - 'import'  → 视频参考节点：只回放上传的视频，不暴露 prompt / 模型 / 生成按钮。
 * - 'generate' → 视频生成器节点：走 itvSelection + capability + prompt 链路。
 * 缺省（旧节点）仍按"有 source 就当 pass-through"兼容。
 */
export type LinghuiVideoNodeMode = 'import' | 'generate';

/**
 * LibTV VideoNode 6 状态机派生视图（chunk 15gvxu:191642-191652）：
 *   generating / generating_with_content / failed / resource / pending / empty_generate
 * - generating(_with_content)：taskInfo.loading；有 poster/snapshot 时走 _with_content
 * - failed：taskInfo 失败
 * - resource：有 url[0]（已有视频）
 * - pending：generate 模式、无 url、但已有上游连入，等待上游产出
 * - empty_generate：默认（无 url + 无上游 + 非 import）
 *
 * 灵绘合并 generating 与 generating_with_content 为单一 generating（已有 poster 走 poster
 * 不闪屏的逻辑由组件内部处理）。
 */
export type LinghuiVideoNodeViewState =
  | 'generating'
  | 'failed'
  | 'resource'
  | 'pending'
  | 'empty_generate';

export interface LinghuiVideoNodeProperties extends LinghuiScriptDerivedProperties {
  prompt: string;
  itvSelection: string;
  source: string;
  posterSource: string;
  videoCapability: LinghuiVideoCapability;
  aspectRatio: string;
  resolution: string;
  duration: number;
  /** 'import' 时视频节点是纯参考素材；'generate'（默认）才暴露 prompt + 生成按钮。 */
  mode?: LinghuiVideoNodeMode;
}

