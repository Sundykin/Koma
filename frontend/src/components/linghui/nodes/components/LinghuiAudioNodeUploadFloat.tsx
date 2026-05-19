import React from 'react';
import { Upload as UploadIcon } from 'lucide-react';
import { useLinghuiAudioNodeUpload } from '../state/useLinghuiAudioNodeUpload';

interface LinghuiAudioNodeUploadFloatProps {
  nodeId: string;
}

export const LinghuiAudioNodeUploadFloat: React.FC<LinghuiAudioNodeUploadFloatProps> = ({ nodeId }) => {
  const { trigger } = useLinghuiAudioNodeUpload(nodeId);

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
