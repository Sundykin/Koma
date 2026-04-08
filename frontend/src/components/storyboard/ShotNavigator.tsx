import React from 'react';
import { Badge, Button, Checkbox, Empty, Tag, Tooltip } from 'antd';
import { PlusOutlined, VideoCameraOutlined, PictureOutlined, CheckCircleFilled } from '@ant-design/icons';
import type { Shot } from '../../types';
import { resolveStoryboardMediaUrl } from './storyboardMedia';

interface ShotNavigatorProps {
  shots: Shot[];
  activeShotId: string | null;
  selectedShotIds: string[];
  onActiveShotChange: (shotId: string) => void;
  onShotSelectionChange: (shotId: string, selected: boolean) => void;
  onAddShot: () => void;
}

function summarizeScript(script?: string): string {
  const normalized = (script || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '暂无文案';
  }
  return normalized.length > 48 ? `${normalized.slice(0, 48)}...` : normalized;
}

export const ShotNavigator: React.FC<ShotNavigatorProps> = ({
  shots,
  activeShotId,
  selectedShotIds,
  onActiveShotChange,
  onShotSelectionChange,
  onAddShot,
}) => {
  return (
    <div className="h-full min-h-0 border-r border-zinc-800 bg-zinc-950/90 flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Storyboard</div>
          <div className="text-sm font-medium text-zinc-100">{shots.length} 个分镜</div>
          {selectedShotIds.length > 0 && (
            <div className="mt-1 text-[11px] text-emerald-400">{selectedShotIds.length} 个已选中</div>
          )}
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={onAddShot}>
          添加
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {shots.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span className="text-zinc-500">还没有分镜</span>}
            />
          </div>
        ) : shots.map((shot, index) => {
          const images = shot.media?.images || [];
          const videos = shot.media?.videos || [];
          const currentImage = images[shot.media?.currentImageIndex || 0] || images[0];
          const currentVideo = videos[shot.media?.currentVideoIndex ?? (videos.length - 1)] || videos[videos.length - 1];
          const thumbUrl = resolveStoryboardMediaUrl(currentVideo || currentImage);
          const active = activeShotId === shot.id;
          const selected = selectedShotIds.includes(shot.id);

          return (
            <div
              key={shot.id}
              onClick={() => onActiveShotChange(shot.id)}
              className={`w-full rounded-2xl border text-left transition-all cursor-pointer ${
                active
                  ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.22)]'
                  : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-700 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-stretch gap-3 p-3">
                <div className="relative w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-800/80">
                  <div className="aspect-[9/16] w-full bg-zinc-900">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-zinc-600 text-xs">
                        无预览
                      </div>
                    )}
                  </div>
                  {shot.confirmed && (
                    <CheckCircleFilled className="absolute right-1.5 top-1.5 text-emerald-400" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-400">#{index + 1}</span>
                    <Tag className="m-0 border-zinc-700 bg-zinc-950 text-zinc-300">{shot.duration}s</Tag>
                    {selected && (
                      <Tag className="m-0 border-emerald-700 bg-emerald-950/50 text-emerald-300">已选</Tag>
                    )}
                    {shot.imageMode === 'grid' && (
                      <Tag className="m-0 border-sky-800 bg-sky-950/50 text-sky-300">九宫格</Tag>
                    )}
                    <Checkbox
                      checked={selected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onShotSelectionChange(shot.id, event.target.checked)}
                    />
                  </div>
                  <div className="mt-2 text-sm font-medium text-zinc-100">
                    {summarizeScript(shot.scriptContent)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                    <span>{shot.characters?.length || 0} 角色</span>
                    <span>{shot.scenes?.length || 0} 场景</span>
                    <span>{shot.props?.length || 0} 道具</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11px]">
                    <Tooltip title={`${images.length} 张图片`}>
                      <Badge count={images.length} size="small" offset={[0, 2]}>
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-950 text-zinc-300">
                          <PictureOutlined />
                        </span>
                      </Badge>
                    </Tooltip>
                    <Tooltip title={`${videos.length} 段视频`}>
                      <Badge count={videos.length} size="small" offset={[0, 2]}>
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-950 text-zinc-300">
                          <VideoCameraOutlined />
                        </span>
                      </Badge>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
