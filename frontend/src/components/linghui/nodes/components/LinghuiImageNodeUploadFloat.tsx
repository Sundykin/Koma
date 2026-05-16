import React from 'react';
import { Upload as UploadIcon } from 'lucide-react';
import { useLinghuiImageNodeUpload } from '../state/useLinghuiImageNodeUpload';

/**
 * LibTV 截图 2 节点正上方独立"上传"浮按钮 1:1 复刻：
 *   - 圆角药丸，黑色毛玻璃背景，居中悬浮在节点上方
 *   - icon 上箭头 + "上传" 文字
 *   - 仅在节点无可用图片（未生成态 / 空导入态）时显示
 *   - 触发 useLinghuiImageNodeUpload trigger，复用 ImageNodeEditor "替换图片" 同一条上传链路
 *
 * LibTV 内部走 requestFileUpload({accept, onFile})，最终就是隐藏 input[type=file]；
 * 灵绘走 electronService.openFileDialog（Electron 原生对话框），UI 等价。
 */
interface LinghuiImageNodeUploadFloatProps {
  nodeId: string;
}

export const LinghuiImageNodeUploadFloat: React.FC<LinghuiImageNodeUploadFloatProps> = ({ nodeId }) => {
  const { trigger } = useLinghuiImageNodeUpload(nodeId);

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
