import React, { useMemo } from 'react';
import { Disc3, Video } from 'lucide-react';
import { useLinghuiNodeEditorApi } from '../state/LinghuiNodeRunsContext';
import {
  LinghuiNodeEmptyState,
  type LinghuiNodeEmptyStateAction,
} from './LinghuiNodeEmptyState';

/**
 * LibTV 音频节点 empty_generate 态（chunk 15gvxu:8921-8936 eH）：
 *   icon: AudioDisc 66
 *   actions: [{ icon: VideoCameraIcon 14, label: "音频生视频", onClick: eH }]
 *
 * 灵绘对齐：点击"音频生视频" → 调 applyAudioEmptyAction 派生 video + image 子图（与 LibTV 一致）。
 * 详见 docs/libtv-video-node-deep-dive.md（同模板）+ useLinghuiCanvasDocumentOps.applyAudioEmptyAction。
 */
interface LinghuiAudioNodeEmptyStateProps {
  nodeId: string;
}

export const LinghuiAudioNodeEmptyState: React.FC<LinghuiAudioNodeEmptyStateProps> = ({ nodeId }) => {
  const editorApi = useLinghuiNodeEditorApi();

  const actions = useMemo<LinghuiNodeEmptyStateAction[]>(() => [
    {
      key: 'audio-to-video',
      label: '音频生视频',
      icon: <Video size={14} />,
      onClick: () => editorApi.onApplyAudioEmptyAction?.(nodeId, 'audio-to-video'),
    },
  ], [editorApi, nodeId]);

  const icon = <Disc3 size={66} strokeWidth={1.0} />;

  return <LinghuiNodeEmptyState icon={icon} actions={actions} />;
};
