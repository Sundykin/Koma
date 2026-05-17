import React, { useMemo } from 'react';
import { Image as ImageIcon, ImagePlus, Sparkles, Wand2 } from 'lucide-react';
import type { LinghuiImageToolKey } from '../../../../types/linghui';
import { useLinghuiNodeInteractionApi } from '../state/LinghuiNodeRunsContext';
import {
  LinghuiNodeEmptyState,
  type LinghuiNodeEmptyStateAction,
} from './LinghuiNodeEmptyState';

/**
 * LibTV 图片节点 empty_generate 态：actions = [图生图, 图片高清]。
 * 中央 placeholder 使用 lucide ImageIcon 80px + 右下叠 ImagePlus accent 角标，复刻 LibTV
 * `Icons.ImagePlaceholder` 的 "灰色图片框 + 加号" 视觉。
 */
interface LinghuiImageNodeEmptyStateProps {
  nodeId: string;
}

export const LinghuiImageNodeEmptyState: React.FC<LinghuiImageNodeEmptyStateProps> = ({ nodeId }) => {
  const interactionApi = useLinghuiNodeInteractionApi();

  const actions = useMemo<LinghuiNodeEmptyStateAction[]>(() => {
    const fire = (tool: LinghuiImageToolKey) => () => interactionApi.openImageToolPanel(nodeId, tool);
    return [
      { key: 'repaint', label: '图生图', icon: <Wand2 size={14} />, onClick: fire('repaint') },
      { key: 'upscale', label: '图片高清', icon: <Sparkles size={14} />, onClick: fire('upscale') },
    ];
  }, [interactionApi, nodeId]);

  const icon = (
    <span className="linghuiImageNodeEmptyStateIconWrapper">
      <ImageIcon size={80} strokeWidth={1.2} aria-hidden="true" />
      <ImagePlus
        size={20}
        strokeWidth={1.6}
        className="linghuiImageNodeEmptyStateIconBadge"
        aria-hidden="true"
      />
    </span>
  );

  return <LinghuiNodeEmptyState icon={icon} actions={actions} />;
};
