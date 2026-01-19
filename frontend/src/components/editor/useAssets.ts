/**
 * 素材聚合 Hook
 * 从 shots, characters, scenes, props 聚合素材
 */
import { useState, useEffect, useCallback } from 'react';
import type { AssetItem } from '../../types/editor';
import type { Shot, Character, Scene, Prop } from '../../types';
import { loadEpisodeShots, loadCharacters, loadScenes, loadProps } from '../../store/projectStore';

interface UseAssetsOptions {
  projectId: string;
  episodeId: string;
}

interface UseAssetsReturn {
  assets: AssetItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addUploadedAsset: (asset: AssetItem) => void;
}

// 默认视频时长（秒）
const DEFAULT_VIDEO_DURATION = 5;
// 默认图片时长（秒）
const DEFAULT_IMAGE_DURATION = 3;

export function useAssets({ projectId, episodeId }: UseAssetsOptions): UseAssetsReturn {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [uploadedAssets, setUploadedAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAssets = useCallback(async () => {
    if (!projectId || !episodeId) {
      setAssets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 并行加载各类数据
      const [shots, characters, scenes, props] = await Promise.all([
        loadEpisodeShots(projectId, episodeId),
        loadCharacters(projectId),
        loadScenes(projectId),
        loadProps(projectId),
      ]);

      const aggregated: AssetItem[] = [];

      // 1. 从分镜提取素材
      shots.forEach((shot: Shot) => {
        // 获取当前视频（从 videos 数组）
        const currentVideo = shot.videos?.[shot.currentVideoIndex ?? 0];
        const videoPath = currentVideo?.path;

        // 视频
        if (videoPath) {
          aggregated.push({
            id: `shot-video-${shot.id}`,
            name: shot.description || `分镜 ${shot.id.slice(0, 6)}`,
            type: 'video',
            src: videoPath,
            thumbnailSrc: shot.imagePath || videoPath,
            duration: shot.duration || DEFAULT_VIDEO_DURATION,
            source: 'shot',
            metadata: { shotId: shot.id },
          });
        }
        // 图片（如果没有视频）
        else if (shot.imagePath) {
          aggregated.push({
            id: `shot-image-${shot.id}`,
            name: shot.description || `分镜 ${shot.id.slice(0, 6)}`,
            type: 'image',
            src: shot.imagePath,
            thumbnailSrc: shot.imagePath,
            duration: DEFAULT_IMAGE_DURATION,
            source: 'shot',
            metadata: { shotId: shot.id },
          });
        }
      });

      // 2. 从角色提取素材
      characters.forEach((char: Character) => {
        // 角色预览视频
        if (char.previewVideoPath) {
          aggregated.push({
            id: `char-video-${char.id}`,
            name: `${char.name} - 预览`,
            type: 'video',
            src: char.previewVideoPath,
            thumbnailSrc: char.costumePhotoPath || char.previewVideoPath,
            duration: DEFAULT_VIDEO_DURATION,
            source: 'character',
            metadata: { characterId: char.id },
          });
        }
        // 角色服装照
        if (char.costumePhotoPath) {
          aggregated.push({
            id: `char-image-${char.id}`,
            name: `${char.name} - 服装`,
            type: 'image',
            src: char.costumePhotoPath,
            thumbnailSrc: char.costumePhotoPath,
            duration: DEFAULT_IMAGE_DURATION,
            source: 'character',
            metadata: { characterId: char.id },
          });
        }
      });

      // 3. 从场景提取素材
      scenes.forEach((scene: Scene) => {
        if (scene.imagePath) {
          aggregated.push({
            id: `scene-image-${scene.id}`,
            name: scene.name,
            type: 'image',
            src: scene.imagePath,
            thumbnailSrc: scene.imagePath,
            duration: DEFAULT_IMAGE_DURATION,
            source: 'scene',
            metadata: { sceneId: scene.id },
          });
        }
      });

      // 4. 从道具提取素材
      props.forEach((prop: Prop) => {
        if (prop.imagePath) {
          aggregated.push({
            id: `prop-image-${prop.id}`,
            name: prop.name,
            type: 'image',
            src: prop.imagePath,
            thumbnailSrc: prop.imagePath,
            duration: DEFAULT_IMAGE_DURATION,
            source: 'prop',
            metadata: { propId: prop.id },
          });
        }
      });

      // 合并上传的素材
      setAssets([...aggregated, ...uploadedAssets]);
    } catch (err) {
      console.error('[useAssets] Failed to load assets:', err);
      setError(err instanceof Error ? err.message : '加载素材失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, episodeId, uploadedAssets]);

  // 初始加载
  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // 添加上传的素材
  const addUploadedAsset = useCallback((asset: AssetItem) => {
    setUploadedAssets(prev => [...prev, asset]);
  }, []);

  return {
    assets,
    loading,
    error,
    refresh: loadAssets,
    addUploadedAsset,
  };
}
