import React, { useMemo } from 'react';
import { Empty, Tag } from 'antd';
import { PictureOutlined, VideoCameraOutlined } from '@ant-design/icons';
import type { Shot } from '../../types';
import { StagePlayer } from '../video/StagePlayer';
import { resolveStoryboardMediaUrl } from './storyboardMedia';

interface CurrentShotStageProps {
  shot: Shot | null;
  shotIndex: number;
  onImageSelect?: (index: number) => void;
  onVideoSelect?: (index: number) => void;
  onReferenceSelect?: (index: number) => void;
  isGeneratingImage?: boolean;
  isGeneratingVideo?: boolean;
}

function renderCandidateLabel(kind: 'image' | 'video', index: number): string {
  return kind === 'video' ? `视频 ${index + 1}` : `图片 ${index + 1}`;
}

export const CurrentShotStage: React.FC<CurrentShotStageProps> = ({
  shot,
  shotIndex,
  onImageSelect,
  onVideoSelect,
  onReferenceSelect,
  isGeneratingImage,
  isGeneratingVideo,
}) => {
  const images = shot?.media?.images || [];
  const videos = shot?.media?.videos || [];
  const references = shot?.media?.references || [];

  const currentVideoIndex = shot ? (shot.media?.currentVideoIndex ?? (videos.length - 1)) : 0;
  const currentImageIndex = shot ? (shot.media?.currentImageIndex || 0) : 0;
  const currentReferenceIndex = shot ? (shot.media?.selectedReferenceIndex || 0) : 0;

  const currentVideo = videos[currentVideoIndex] || videos[videos.length - 1];
  const currentImage = images[currentImageIndex] || images[0];
  const currentVideoUrl = useMemo(() => resolveStoryboardMediaUrl(currentVideo), [currentVideo]);
  const currentVideoPoster = useMemo(() => resolveStoryboardMediaUrl(currentImage), [currentImage]);
  const currentImageUrl = useMemo(() => resolveStoryboardMediaUrl(currentImage), [currentImage]);

  return (
    <div className="h-full min-h-0 bg-zinc-950 flex flex-col">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Stage</div>
          <div className="mt-1 flex items-center gap-2 text-zinc-100">
            <span className="text-lg font-semibold">#{shotIndex + 1}</span>
            {shot?.confirmed && <Tag color="green" className="m-0">已确认</Tag>}
            {shot?.imageMode === 'grid' && <Tag color="blue" className="m-0">九宫格模式</Tag>}
          </div>
          <div className="mt-2 text-sm text-zinc-400">
            {shot?.scriptContent?.trim() || '当前分镜暂无文案'}
          </div>
        </div>
        <div className="text-xs text-zinc-500 text-right">
          <div>{videos.length} 段视频</div>
          <div>{images.length} 张图片</div>
          <div>{references.length} 张参考图</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        {!shot ? (
          <div className="h-full flex items-center justify-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span className="text-zinc-500">选择一个分镜开始创作</span>}
            />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-4">
              <div className="aspect-[16/9] min-h-[420px] w-full overflow-hidden rounded-2xl bg-black">
                {currentVideoUrl ? (
                  <StagePlayer
                    source={currentVideoUrl}
                    poster={currentVideoPoster}
                    className="h-full w-full"
                  />
                ) : currentImageUrl ? (
                  <img
                    src={currentImageUrl}
                    alt={`分镜 ${shotIndex + 1}`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-zinc-500">
                    {isGeneratingVideo ? (
                      <>
                        <VideoCameraOutlined className="text-4xl" />
                        <span>正在生成视频...</span>
                      </>
                    ) : isGeneratingImage ? (
                      <>
                        <PictureOutlined className="text-4xl" />
                        <span>正在生成图片...</span>
                      </>
                    ) : (
                      <>
                        <PictureOutlined className="text-4xl" />
                        <span>当前分镜还没有生成结果</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {videos.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">视频候选</div>
                <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
                  {videos.map((video, index) => {
                    const thumb = resolveStoryboardMediaUrl(video);
                    const active = index === currentVideoIndex;
                    return (
                      <button
                        key={`${video.localPath || video.remoteUrl || index}`}
                        type="button"
                        onClick={() => onVideoSelect?.(index)}
                        className={`rounded-2xl border p-2 text-left transition ${
                          active
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-700'
                        }`}
                      >
                        <div className="aspect-video overflow-hidden rounded-xl bg-black">
                          {thumb ? (
                            <img src={thumb} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-zinc-600">
                              <VideoCameraOutlined />
                            </div>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-zinc-300">{renderCandidateLabel('video', index)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {images.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">图片候选</div>
                <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
                  {images.map((image, index) => {
                    const active = index === currentImageIndex;
                    const imageUrl = resolveStoryboardMediaUrl(image);
                    return (
                      <button
                        key={`${image.localPath || image.remoteUrl || index}`}
                        type="button"
                        onClick={() => onImageSelect?.(index)}
                        className={`rounded-2xl border p-2 text-left transition ${
                          active
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-700'
                        }`}
                      >
                        <div className="aspect-[16/9] overflow-hidden rounded-xl bg-zinc-950">
                          {imageUrl ? (
                            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-zinc-600">
                              <PictureOutlined />
                            </div>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-zinc-300">{renderCandidateLabel('image', index)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {references.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">参考素材</div>
                <div className="grid grid-cols-4 gap-3 xl:grid-cols-6">
                  {references.map((reference, index) => {
                    const active = index === currentReferenceIndex;
                    const referenceUrl = resolveStoryboardMediaUrl(reference);
                    return (
                      <button
                        key={`${reference.localPath || reference.remoteUrl || index}`}
                        type="button"
                        onClick={() => onReferenceSelect?.(index)}
                        className={`rounded-2xl border p-2 transition ${
                          active
                            ? 'border-sky-500 bg-sky-500/10'
                            : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'
                        }`}
                      >
                        <div className="aspect-square overflow-hidden rounded-xl bg-zinc-950">
                          {referenceUrl ? (
                            <img src={referenceUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-zinc-600">
                              <PictureOutlined />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
