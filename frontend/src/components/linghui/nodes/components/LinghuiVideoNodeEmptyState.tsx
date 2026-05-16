import React, { useMemo } from 'react';
import { Layers, Sparkles, Video as VideoIcon } from 'lucide-react';
import type { LinghuiVideoCapability } from '../../../../types/linghui';
import { useLinghuiNodeMutation } from '../state/LinghuiNodeRunsContext';
import {
  LinghuiNodeEmptyState,
  type LinghuiNodeEmptyStateAction,
} from './LinghuiNodeEmptyState';

/**
 * LibTV 视频节点 empty_generate 态（chunk `15gvxu-nayl4w.js`）：
 *   actions: [
 *     { icon: layers,   label: "首尾帧生成视频", onClick: ij },
 *     { icon: sparkles, label: "首帧生成视频",   onClick: iG },
 *   ]
 *
 * 灵绘对齐：通过 updateNodeData 切 videoCapability，与 LibTV 同源行为一致。
 *   - 首尾帧生成视频 → videoCapability = 'video.start-end-to-video'
 *   - 首帧生成视频   → videoCapability = 'video.image-to-video'
 */
interface LinghuiVideoNodeEmptyStateProps {
  nodeId: string;
}

export const LinghuiVideoNodeEmptyState: React.FC<LinghuiVideoNodeEmptyStateProps> = ({ nodeId }) => {
  const { updateNodeData } = useLinghuiNodeMutation();

  const actions = useMemo<LinghuiNodeEmptyStateAction[]>(() => {
    const setCapability = (capability: LinghuiVideoCapability) => () => {
      updateNodeData(nodeId, (previous) => ({
        ...previous,
        properties: {
          ...previous.properties,
          videoCapability: capability,
        },
      }));
    };
    return [
      {
        key: 'start-end',
        label: '首尾帧生成视频',
        icon: <Layers size={14} />,
        onClick: setCapability('video.start-end-to-video'),
      },
      {
        key: 'first-frame',
        label: '首帧生成视频',
        icon: <Sparkles size={14} />,
        onClick: setCapability('video.image-to-video'),
      },
    ];
  }, [nodeId, updateNodeData]);

  const icon = (
    <span className="linghuiImageNodeEmptyStateIconWrapper">
      <VideoIcon size={80} strokeWidth={1.2} aria-hidden="true" />
    </span>
  );

  return <LinghuiNodeEmptyState icon={icon} actions={actions} />;
};
