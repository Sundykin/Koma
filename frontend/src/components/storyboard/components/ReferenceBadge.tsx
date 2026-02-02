/**
 * 参考图徽章组件
 * 显示参考图数量，点击弹出管理 Popover
 */
import React from 'react';
import { Badge, Popover } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import { electronService } from '../../../services/electronService';

interface ReferenceBadgeProps {
  images: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onAdd: (path: string) => void;
  onDelete: (index: number) => void;
}

export const ReferenceBadge: React.FC<ReferenceBadgeProps> = ({
  images,
  selectedIndex,
  onSelect,
  onAdd,
  onDelete,
}) => {
  const count = images.length;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAdd(URL.createObjectURL(file));
    }
    e.target.value = '';
  };

  const content = (
    <div className="w-[320px]">
      <div className="text-xs text-zinc-400 mb-2">参考图用于 ControlNet 控制生成</div>
      {images.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {images.map((img, idx) => (
            <div
              key={idx}
              className={`relative h-16 aspect-square rounded overflow-hidden cursor-pointer border-2 ${
                idx === selectedIndex ? 'border-blue-500' : 'border-zinc-700 hover:border-zinc-500'
              }`}
              onClick={() => onSelect(idx)}
            >
              <img
                src={electronService.fs.toLocalUrl(img)}
                className="w-full h-full object-cover"
                alt=""
              />
              <button
                className="absolute top-0 right-0 w-5 h-5 bg-red-500/80 text-white text-xs rounded-bl hover:bg-red-500 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(idx);
                }}
              >
                ×
              </button>
            </div>
          ))}
          <label className="h-16 aspect-square border border-dashed border-zinc-600 rounded flex items-center justify-center cursor-pointer hover:border-zinc-500 transition-colors">
            <PictureOutlined className="text-zinc-500" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>
      ) : (
        <label className="w-full h-20 border border-dashed border-zinc-600 rounded flex flex-col items-center justify-center cursor-pointer hover:border-zinc-500 transition-colors gap-1">
          <PictureOutlined className="text-zinc-500 text-lg" />
          <span className="text-zinc-500 text-xs">点击添加参考图</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      title={<span className="text-sm">参考图管理</span>}
      overlayClassName="reference-badge-popover"
    >
      <div className="absolute top-2 right-2 z-10 cursor-pointer group">
        <Badge count={count} size="small" offset={[-2, 2]} color={count > 0 ? '#3b82f6' : undefined}>
          <div
            className={`h-6 px-2 rounded flex items-center gap-1.5 text-xs border transition-colors ${
              count > 0
                ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                : 'bg-zinc-800/80 border-zinc-700 text-zinc-500 group-hover:text-zinc-300'
            }`}
          >
            <PictureOutlined />
            {count > 0 ? '参考图' : '添加参考'}
          </div>
        </Badge>
      </div>
    </Popover>
  );
};
