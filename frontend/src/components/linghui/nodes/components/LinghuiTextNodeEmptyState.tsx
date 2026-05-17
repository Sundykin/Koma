import React, { useMemo } from 'react';
import { FileText, Image as ImageIcon, Music, Video } from 'lucide-react';
import { useLinghuiNodeEditorApi } from '../state/LinghuiNodeRunsContext';
import {
  LinghuiNodeEmptyState,
  type LinghuiNodeEmptyStateAction,
} from './LinghuiNodeEmptyState';

/**
 * LibTV TextNode empty_generate 态（15gvxu:55643-55675）。
 * 4 actions：
 *   1. 自己编写内容 (TextIcon 14)    → eJ：切到 manual + 清空 content + 进入编辑
 *   2. 文生视频 (VideoAddS 14)       → eY：写示例文本 + 右侧派生 VideoNode + 自动连线
 *   3. 图片反推提示词 (ImageS 14)    → eV：左侧派生 ImageNode + 反向连线 + 反推 prompt
 *   4. 文字生音乐 (music 14)         → eW：写音乐 prompt + 右侧派生 AudioNode + 自动连线
 *
 * 中央 placeholder 使用 lucide FileText 80px，对齐 LibTV `J.Text2Icon size=90`。
 */
interface LinghuiTextNodeEmptyStateProps {
  nodeId: string;
}

export const LinghuiTextNodeEmptyState: React.FC<LinghuiTextNodeEmptyStateProps> = ({ nodeId }) => {
  const editorApi = useLinghuiNodeEditorApi();

  const actions = useMemo<LinghuiNodeEmptyStateAction[]>(() => {
    const fire = (action: 'edit' | 'video' | 'image-prompt' | 'music') => () => {
      editorApi.onApplyTextEmptyAction?.(nodeId, action);
    };
    return [
      { key: 'edit',          label: '自己编写内容',     icon: <FileText size={14} />,  onClick: fire('edit') },
      { key: 'video',         label: '文生视频',         icon: <Video size={14} />,     onClick: fire('video') },
      { key: 'image-prompt',  label: '图片反推提示词',   icon: <ImageIcon size={14} />, onClick: fire('image-prompt') },
      { key: 'music',         label: '文字生音乐',       icon: <Music size={14} />,     onClick: fire('music') },
    ];
  }, [editorApi, nodeId]);

  const icon = <FileText size={80} strokeWidth={1.2} aria-hidden="true" />;

  return <LinghuiNodeEmptyState icon={icon} actions={actions} />;
};
