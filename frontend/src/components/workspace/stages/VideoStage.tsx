/**
 * Video 阶段 — 视频生成 + 预览
 * 功能：分镜→视频批量/单个生成、视频播放预览
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { App, Button, Spin, Modal } from 'antd';
import { Film, Play, RefreshCw, Loader2, Video } from 'lucide-react';
import { loadEpisodeShots, saveEpisodeShots } from '../../../store/projectStore';
import { shotRenderWorkflow, batchRenderShots } from '../../../workflow/shotRenderWorkflow';
import type { Shot, ShotVideo } from '../../../types';

interface Episode {
  id: string;
  number: number;
  title: string;
}

interface VideoStageProps {
  projectId: string;
  episode: Episode | null;
  projectConfig: {
    itvConfigId?: string;
    ttiConfigId?: string;
    ttsConfigId?: string;
    [key: string]: any;
  };
  onRefreshStatuses: () => void;
  onStageChange: (stage: string) => void;
  onEpisodeUpdate: (episodeId: string, updates: any) => void;
}

const VideoStage: React.FC<VideoStageProps> = ({
  projectId,
  episode,
  projectConfig,
  onRefreshStatuses,
  onStageChange,
}) => {
  const { message } = App.useApp();
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingShots, setGeneratingShots] = useState<Set<string>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<{ url: string; title: string } | null>(null);

  const loadShots = useCallback(async () => {
    if (!episode) return;
    setLoading(true);
    try {
      const data = await loadEpisodeShots(projectId, episode.id);
      setShots(data);
    } catch {
      message.error('加载分镜失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, episode?.id]);

  useEffect(() => {
    loadShots();
  }, [loadShots]);

  const shotsWithImage = useMemo(
    () => shots.filter(s => s.imagePath || s.imagePaths?.length),
    [shots],
  );
  const shotsWithVideo = useMemo(
    () => shots.filter(s => s.videoPath || s.videoPaths?.length || s.videos?.length),
    [shots],
  );

  const getVideoUrl = useCallback((shot: Shot): string | undefined => {
    if (shot.videos?.length) {
      const idx = shot.currentVideoIndex ?? shot.videos.length - 1;
      const video = shot.videos[idx];
      return video?.url || video?.path;
    }
    return shot.videoPath || shot.videoPaths?.[0];
  }, []);

  const saveAllShots = useCallback(async (updatedShots: Shot[]) => {
    if (!episode) return;
    await saveEpisodeShots(projectId, episode.id, updatedShots);
    setShots(updatedShots);
  }, [projectId, episode?.id]);

  const applyRenderResult = useCallback((
    currentShots: Shot[],
    shotId: string,
    version: any,
  ): Shot[] => {
    return currentShots.map(s => {
      if (s.id !== shotId) return s;
      const newVideo: ShotVideo = {
        path: version.videoPath || version.remoteVideoUrl || '',
        url: version.remoteVideoUrl,
        thumbnailPath: version.imagePath,
        prompt: version.prompt,
        seed: version.seed,
        model: version.model,
        createdAt: version.createdAt || Date.now(),
      };
      const existingVideos = s.videos || [];
      return {
        ...s,
        videos: [...existingVideos, newVideo],
        currentVideoIndex: existingVideos.length,
        videoPath: newVideo.path,
      };
    });
  }, []);

  const handleGenerateSingle = useCallback(async (shotId: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    setGeneratingShots(prev => new Set(prev).add(shotId));
    try {
      const result = await shotRenderWorkflow(
        {
          projectId,
          shot,
          projectConfigIds: {
            itvConfigId: projectConfig.itvConfigId,
            ttsConfigId: projectConfig.ttsConfigId,
          },
        },
        () => {},
      );

      if (result.success && result.version) {
        const updatedShots = applyRenderResult(shots, shotId, result.version);
        await saveAllShots(updatedShots);
        message.success('视频生成完成');
      } else {
        message.error(result.error || '视频生成失败');
        await loadShots();
      }
    } catch (err: any) {
      message.error(err.message || '视频生成失败');
    } finally {
      setGeneratingShots(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [shots, projectId, projectConfig, applyRenderResult, saveAllShots, loadShots]);

  const handleBatchGenerate = useCallback(async () => {
    const candidates = shots.filter(
      s => (s.imagePath || s.imagePaths?.length) && !(s.videoPath || s.videoPaths?.length || s.videos?.length),
    );
    if (candidates.length === 0) {
      message.info('没有可生成视频的分镜（需有图片且无视频）');
      return;
    }

    const candidateIds = new Set(candidates.map(s => s.id));
    setGeneratingShots(candidateIds);
    setBatchGenerating(true);

    try {
      const result = await batchRenderShots(
        {
          projectId,
          shots: candidates,
          projectConfigIds: {
            itvConfigId: projectConfig.itvConfigId,
            ttsConfigId: projectConfig.ttsConfigId,
          },
        },
        () => {},
      );

      let updatedShots = [...shots];
      for (const rr of result.results) {
        if (rr.success && rr.version) {
          updatedShots = applyRenderResult(updatedShots, rr.shotId, rr.version);
        }
      }
      await saveAllShots(updatedShots);
      message.success(`批量生成完成：${result.success} 成功，${result.failed} 失败`);
    } catch (err: any) {
      message.error(err.message || '批量生成失败');
      await loadShots();
    } finally {
      setGeneratingShots(new Set());
      setBatchGenerating(false);
    }
  }, [shots, projectId, projectConfig, applyRenderResult, saveAllShots, loadShots]);

  const handlePlayVideo = useCallback((shot: Shot, index: number) => {
    const url = getVideoUrl(shot);
    if (!url) return;
    setPreviewVideo({
      url: url.startsWith('http') ? url : `local-file://${url}`,
      title: `分镜 #${index + 1}`,
    });
  }, [getVideoUrl]);

  // --- Empty / loading states ---

  if (!episode) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <div className="text-center space-y-3">
          <Film className="w-12 h-12 mx-auto opacity-20" />
          <p>请先选择一个剧集</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin size="large" tip="加载分镜数据..."><div className="p-12" /></Spin>
      </div>
    );
  }

  if (shots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <div className="text-center space-y-4">
          <Film className="w-16 h-16 mx-auto opacity-10" />
          <p>需要先完成分镜生成</p>
          <Button type="link" onClick={() => onStageChange('storyboard')}>
            返回分镜阶段
          </Button>
        </div>
      </div>
    );
  }

  const pendingCount = shotsWithImage.length - shotsWithVideo.length;

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400">
            分镜: {shots.length} | 有图: {shotsWithImage.length} | 有视频: {shotsWithVideo.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Button
              type="primary"
              size="small"
              loading={batchGenerating}
              icon={<Video size={12} />}
              onClick={handleBatchGenerate}
            >
              批量生成视频 ({pendingCount})
            </Button>
          )}
          <Button
            size="small"
            icon={<RefreshCw size={12} />}
            onClick={loadShots}
          >
            刷新
          </Button>
          <Button
            type="primary"
            size="small"
            onClick={() => { onRefreshStatuses(); onStageChange('edit'); }}
            className="!bg-emerald-600 !border-emerald-600"
          >
            下一步：剪辑
          </Button>
        </div>
      </div>

      {/* 视频卡片网格 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {shots.map((shot, index) => {
            const hasImage = !!(shot.imagePath || shot.imagePaths?.length);
            const hasVideo = !!(shot.videoPath || shot.videoPaths?.length || shot.videos?.length);
            const isGenerating = generatingShots.has(shot.id);

            return (
              <div
                key={shot.id}
                className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden"
              >
                {/* 预览区域 */}
                <div
                  className="aspect-video bg-zinc-800 relative group cursor-pointer"
                  onClick={() => hasVideo && handlePlayVideo(shot, index)}
                >
                  {hasImage ? (
                    <img
                      src={`local-file://${shot.imagePath}`}
                      alt={`分镜 ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-zinc-600">
                      <Film size={24} />
                    </div>
                  )}

                  {/* 生成中遮罩 */}
                  {isGenerating && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 size={28} className="text-blue-400 animate-spin" />
                    </div>
                  )}

                  {/* 视频播放按钮 */}
                  {hasVideo && !isGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                      <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity shadow-lg">
                        <Play size={18} className="text-white ml-0.5" />
                      </div>
                    </div>
                  )}
                </div>

                {/* 信息区 */}
                <div className="p-2 space-y-1.5">
                  <div className="text-xs font-medium text-zinc-300 truncate">
                    #{index + 1} {shot.shotType} · {shot.duration}s
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {shot.scriptContent?.slice(0, 50)}
                  </div>

                  {/* 单个生成按钮 */}
                  {hasImage && !hasVideo && !isGenerating && (
                    <Button
                      size="small"
                      type="primary"
                      block
                      className="!text-xs !h-6 !bg-blue-600 !border-blue-600"
                      onClick={() => handleGenerateSingle(shot.id)}
                    >
                      生成视频
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 视频预览弹窗 */}
      <Modal
        open={!!previewVideo}
        title={previewVideo?.title}
        footer={null}
        onCancel={() => setPreviewVideo(null)}
        width={720}
        destroyOnClose
        centered
      >
        {previewVideo && (
          <video
            src={previewVideo.url}
            controls
            autoPlay
            className="w-full rounded"
            style={{ maxHeight: '70vh' }}
          />
        )}
      </Modal>
    </div>
  );
};

export default VideoStage;
