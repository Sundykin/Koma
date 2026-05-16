import React from 'react';
import { Upload as UploadIcon } from 'lucide-react';
import { useLinghuiVideoNodeUpload } from '../state/useLinghuiVideoNodeUpload';

/**
 * 视频节点版本"上传"独立浮按钮，对齐 LinghuiImageNodeUploadFloat 的视觉与交互：
 * 圆角药丸 32px 高，节点正上方居中，点击触发选 mp4 → 写回节点 source。
 */
interface LinghuiVideoNodeUploadFloatProps {
  nodeId: string;
}

export const LinghuiVideoNodeUploadFloat: React.FC<LinghuiVideoNodeUploadFloatProps> = ({ nodeId }) => {
  const { trigger } = useLinghuiVideoNodeUpload(nodeId);

  return (
    <button
      type="button"
      className="linghuiImageNodeUploadFloat nodrag nopan"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        void trigger();
      }}
    >
      <UploadIcon size={14} strokeWidth={1.8} />
      <span>上传</span>
    </button>
  );
};
