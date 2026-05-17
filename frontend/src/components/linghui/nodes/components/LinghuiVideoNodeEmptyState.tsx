import React, { useMemo } from 'react';
import { Layers, Sparkles, Video as VideoIcon } from 'lucide-react';
import { useLinghuiNodeEditorApi } from '../state/LinghuiNodeRunsContext';
import {
  LinghuiNodeEmptyState,
  type LinghuiNodeEmptyStateAction,
} from './LinghuiNodeEmptyState';

/**
 * LibTV VideoNode empty_generate 态（chunk 15gvxu:193481-193500）。
 * 2 actions：
 *   1. 首尾帧生成视频 (layers 14)   → ij/iO：左侧并列派生 TWO ImageNode（首帧+尾帧）+ 2 条 image→video 边
 *   2. 首帧生成视频   (sparkles 14) → iG/iU：左侧派生 1 个 ImageNode + 1 条 image→video 边
 *
 * 派生由 useLinghuiCanvasDocumentOps.applyVideoEmptyAction 实现（与 TextNode EmptyState 同模式）。
 * 详见 docs/libtv-video-node-deep-dive.md §3。
 */
interface LinghuiVideoNodeEmptyStateProps {
  nodeId: string;
}

export const LinghuiVideoNodeEmptyState: React.FC<LinghuiVideoNodeEmptyStateProps> = ({ nodeId }) => {
  const editorApi = useLinghuiNodeEditorApi();

  const actions = useMemo<LinghuiNodeEmptyStateAction[]>(() => {
    const fire = (action: 'first-frame' | 'first-last-frame') => () => {
      editorApi.onApplyVideoEmptyAction?.(nodeId, action);
    };
    return [
      {
        key: 'first-last-frame',
        label: '首尾帧生成视频',
        icon: <Layers size={14} />,
        onClick: fire('first-last-frame'),
      },
      {
        key: 'first-frame',
        label: '首帧生成视频',
        icon: <Sparkles size={14} />,
        onClick: fire('first-frame'),
      },
    ];
  }, [editorApi, nodeId]);

  // LibTV PlayIcon size=64；灵绘用 VideoIcon 80 保持与图片/文本节点同视觉密度。
  const icon = (
    <span className="linghuiImageNodeEmptyStateIconWrapper">
      <VideoIcon size={80} strokeWidth={1.2} aria-hidden="true" />
    </span>
  );

  return <LinghuiNodeEmptyState icon={icon} actions={actions} />;
};
