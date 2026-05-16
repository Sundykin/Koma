import React, { useMemo } from 'react';
import { Disc3, Video } from 'lucide-react';
import { useLinghuiNodeMutation } from '../state/LinghuiNodeRunsContext';
import {
  LinghuiNodeEmptyState,
  type LinghuiNodeEmptyStateAction,
} from './LinghuiNodeEmptyState';

/**
 * LibTV 音频节点 empty_generate 态（chunk `15gvxu-nayl4w.js`）：
 *   icon: AudioDisc (66px)
 *   actions: [{ icon: VideoCameraIcon, label: "音频生视频", onClick: eH }]
 *
 * 灵绘对齐：点击"音频生视频" → 设置 videoCapability 为音频驱动视频。
 */
interface LinghuiAudioNodeEmptyStateProps {
  nodeId: string;
}

export const LinghuiAudioNodeEmptyState: React.FC<LinghuiAudioNodeEmptyStateProps> = ({ nodeId }) => {
  const { updateNodeData } = useLinghuiNodeMutation();

  const actions = useMemo<LinghuiNodeEmptyStateAction[]>(() => {
    const setAudioToVideo = () => {
      updateNodeData(nodeId, (previous) => ({
        ...previous,
        properties: {
          ...previous.properties,
          videoCapability: 'video.text-to-video',
        },
      }));
    };
    return [
      {
        key: 'audio-to-video',
        label: '音频生视频',
        icon: <Video size={14} />,
        onClick: setAudioToVideo,
      },
    ];
  }, [nodeId, updateNodeData]);

  const icon = (
    <Disc3 size={66} strokeWidth={1.0} />
  );

  return <LinghuiNodeEmptyState icon={icon} actions={actions} />;
};
