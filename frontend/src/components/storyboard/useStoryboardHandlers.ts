import { useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { message } from 'antd';
import type { Shot, Character, Scene, Prop, AppSettings, ShotVideo } from '../../types';
import { generateShotImage, batchGenerateShotImages } from '../../services/ShotGenerationService';
import { shotRenderWorkflow, batchRenderShots } from '../../workflow/shotRenderWorkflow';
import { generateShotPrompt, batchGenerateShotPrompts } from '../../services/ShotPromptService';
import { useShotAssetSync } from '../../hooks/useShotAssetSync';

interface UseStoryboardHandlersProps {
  projectId: string;
  episodeId?: string;
  shots: Shot[];
  setShots: React.Dispatch<React.SetStateAction<Shot[]>>; 
  saveAllShots: (shots: Shot[]) => Promise<void>;
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  settings: AppSettings;
  ttiConfigId?: string;
  llmConfigId?: string;
  loadData: () => void;
}

// 合并两个分镜
function mergeShots(target: Shot, source: Shot): Shot {
  return {
    ...target,
    scriptContent: [target.scriptContent, source.scriptContent].filter(Boolean).join('\n'),
    description: [target.description, source.description].filter(Boolean).join('\n\n'),
    duration: target.duration + source.duration,
    characters: [...new Set([...target.characters, ...source.characters])],
    dialogue: [target.dialogue, source.dialogue].filter(Boolean).join('\n'),
    props: [...new Set([...(target.props || []), ...(source.props || [])])],
    imagePaths: [...(target.imagePaths || []), ...(source.imagePaths || [])],
    videos: [...(target.videos || []), ...(source.videos || [])],
  };
}

export const useStoryboardHandlers = ({ 
  projectId,
  episodeId,
  shots,
  setShots,
  saveAllShots,
  characters,
  scenes,
  props,
  settings,
  ttiConfigId,
  llmConfigId,
  loadData
}: UseStoryboardHandlersProps) => {
  const [generatingShots, setGeneratingShots] = useState<Set<string>>(new Set());
  const [renderingShots, setRenderingShots] = useState<Set<string>>(new Set());
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStep, setRenderStep] = useState('');
  const [generatingImagePrompts, setGeneratingImagePrompts] = useState<Set<string>>(new Set());
  const [generatingVideoPrompts, setGeneratingVideoPrompts] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; step: string } | undefined>(undefined);

  // 资产同步 Hook
  const assets = useMemo(() => ({ characters, scenes, props }), [characters, scenes, props]);
  const { syncFromPrompt, handleAssetChange } = useShotAssetSync(assets);

  const handleToggleConfirm = useCallback(async (shot: Shot) => {
    const updatedShots = shots.map(s => 
      s.id === shot.id ? { ...s, confirmed: !s.confirmed } : s
    );
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  const handleDeleteShot = useCallback(async (shotId: string) => {
    const updatedShots = shots.filter(s => s.id !== shotId);
    await saveAllShots(updatedShots);
    message.success('分镜已删除');
  }, [shots, saveAllShots]);

  // 批量删除
  const handleBatchDelete = useCallback(async (shotIds: string[]) => {
    const updatedShots = shots.filter(s => !shotIds.includes(s.id));
    await saveAllShots(updatedShots);
    message.success(`已删除 ${shotIds.length} 个分镜`);
  }, [shots, saveAllShots]);

  // 批量确认/取消确认
  const handleBatchConfirm = useCallback(async (shotIds: string[], confirm: boolean) => {
    const updatedShots = shots.map(s => 
      shotIds.includes(s.id) ? { ...s, confirmed: confirm } : s
    );
    await saveAllShots(updatedShots);
    message.success(confirm ? `已确认 ${shotIds.length} 个分镜` : `已取消确认 ${shotIds.length} 个分镜`);
  }, [shots, saveAllShots]);

  const handleGenerateShotImage = useCallback(async (shotId: string) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    setGeneratingShots(prev => new Set(prev).add(shotId));
    try {
      await generateShotImage(projectId, episodeId, shotId, characters, scenes, ttiConfigId);
      message.info('分镜图片生成任务已启动');
    } catch (err: any) {
      message.error(err.message || '启动生成失败');
      setGeneratingShots(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, characters, scenes, ttiConfigId]);

  // 渲染视频
  const handleRenderShotVideo = useCallback(async (shotId: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    setRenderingShots(prev => new Set(prev).add(shotId));
    setRenderProgress(0);
    setRenderStep('准备渲染...');
    try {
      const result = await shotRenderWorkflow(
        {
          projectId,
          shot,
          projectConfigIds: {
            ttiConfigId,
            itvConfigId: settings.itvConfigs?.find(c => c.isDefault)?.id,
            ttsConfigId: settings.ttsConfigs?.find(c => c.isDefault)?.id,
          },
        },
        (progress, step) => {
          setRenderProgress(progress);
          setRenderStep(step || '');
        }
      );
      if (result.success && result.version) {
        // 更新 shot 的 videos 字段
        const newVideo: ShotVideo = {
          path: result.version.videoPath || result.version.remoteVideoUrl || '',
          thumbnailPath: result.version.imagePath,
          prompt: result.version.prompt,
          seed: result.version.seed,
          model: result.version.model,
          createdAt: result.version.createdAt || Date.now(),
        };
        const existingVideos = shot.videos || [];
        const updatedShots = shots.map(s => 
          s.id === shotId ? { 
            ...s,
            videos: [...existingVideos, newVideo],
            currentVideoIndex: existingVideos.length,
            // 同时更新图片（如果有）
            ...(result.version.imagePath ? { 
              imagePaths: [...(s.imagePaths || []), result.version.imagePath],
              currentImageIndex: (s.imagePaths || []).length,
              imagePath: result.version.imagePath,
            } : {}),
          } : s
        );
        await saveAllShots(updatedShots);
        message.success('分镜渲染完成');
      } else {
        message.error(result.error || '渲染失败');
        loadData();
      }
    } catch (err: any) {
      message.error(err.message || '渲染失败');
    } finally {
      setRenderingShots(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
      setRenderProgress(0);
      setRenderStep('');
    }
  }, [projectId, shots, ttiConfigId, settings.itvConfigs, settings.ttsConfigs, saveAllShots, loadData]);

  // 剧本内容变更
  const handleScriptChange = useCallback((shotId: string, scriptContent: string) => {
    const updatedShots = shots.map(s => 
      s.id === shotId ? { ...s, scriptContent } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 文生图提示词变更 - 同时同步资产选择
  const handleImagePromptChange = useCallback((shotId: string, imagePrompt: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    // 解析提示词中的 @mentions，同步到资产选择
    const syncState = syncFromPrompt(imagePrompt);

    const updatedShots = shots.map(s => 
      s.id === shotId ? {
        ...s,
        imagePrompt,
        characters: syncState.selectedCharacters,
        scenes: syncState.selectedScenes,
        props: syncState.selectedProps,
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, syncFromPrompt]);

  // 图生视频提示词变更 - 同时同步资产选择
  const handleVideoPromptChange = useCallback((shotId: string, videoPrompt: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    // 解析提示词中的 @mentions，同步到资产选择
    const syncState = syncFromPrompt(videoPrompt);

    const updatedShots = shots.map(s => 
      s.id === shotId ? {
        ...s,
        videoPrompt,
        characters: syncState.selectedCharacters,
        scenes: syncState.selectedScenes,
        props: syncState.selectedProps,
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, syncFromPrompt]);

  // 角色变更 - 同时更新提示词中的 @mentions
  const handleCharactersChange = useCallback((shotId: string, characterIds: string[]) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    // 更新图像提示词中的角色 mentions
    const newImagePrompt = handleAssetChange('character', characterIds, shot.imagePrompt || '', assets);
    // 更新视频提示词中的角色 mentions
    const newVideoPrompt = handleAssetChange('character', characterIds, shot.videoPrompt || '', assets);

    const updatedShots = shots.map(s => 
      s.id === shotId ? {
        ...s,
        characters: characterIds,
        imagePrompt: newImagePrompt,
        videoPrompt: newVideoPrompt,
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, handleAssetChange, assets]);

  // 场景变更 - 同时更新提示词中的 @mentions
  const handleScenesChange = useCallback((shotId: string, sceneIds: string[]) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    const newImagePrompt = handleAssetChange('scene', sceneIds, shot.imagePrompt || '', assets);
    const newVideoPrompt = handleAssetChange('scene', sceneIds, shot.videoPrompt || '', assets);

    const updatedShots = shots.map(s => 
      s.id === shotId ? {
        ...s,
        scenes: sceneIds,
        imagePrompt: newImagePrompt,
        videoPrompt: newVideoPrompt,
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, handleAssetChange, assets]);

  // 参考图变更
  const handleReferenceImagesChange = useCallback((shotId: string, referenceImages: string[], selectedReferenceIndex: number) => {
    const updatedShots = shots.map(s => 
      s.id === shotId ? { ...s, referenceImages, selectedReferenceIndex } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 道具变更 - 同时更新提示词中的 @mentions
  const handlePropsChange = useCallback((shotId: string, propIds: string[]) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    const newImagePrompt = handleAssetChange('prop', propIds, shot.imagePrompt || '', assets);
    const newVideoPrompt = handleAssetChange('prop', propIds, shot.videoPrompt || '', assets);

    const updatedShots = shots.map(s => 
      s.id === shotId ? {
        ...s,
        props: propIds,
        imagePrompt: newImagePrompt,
        videoPrompt: newVideoPrompt,
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, handleAssetChange, assets]);

  // 多图片变更
  const handleImagesChange = useCallback((shotId: string, imagePaths: string[], currentImageIndex: number) => {
    const updatedShots = shots.map(s => 
      s.id === shotId ? {
        ...s,
        imagePaths,
        currentImageIndex,
        imagePath: imagePaths[currentImageIndex] || undefined,
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 多视频变更
  const handleVideosChange = useCallback((shotId: string, videos: ShotVideo[], currentVideoIndex: number) => {
    const updatedShots = shots.map(s => 
      s.id === shotId ? { ...s, videos, currentVideoIndex } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 向上合并
  const handleMergeUp = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index <= 0) return;
    const target = shots[index - 1];
    const source = shots[index];
    const merged = mergeShots(target, source);
    const updatedShots = shots.filter((_, i) => i !== index).map((s, i) => 
      i === index - 1 ? merged : s
    );
    await saveAllShots(updatedShots);
    message.success('分镜已向上合并');
  }, [shots, saveAllShots]);

  // 向下合并
  const handleMergeDown = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0 || index >= shots.length - 1) return;
    const target = shots[index];
    const source = shots[index + 1];
    const merged = mergeShots(target, source);
    const updatedShots = shots.filter((_, i) => i !== index + 1).map((s, i) => 
      i === index ? merged : s
    );
    await saveAllShots(updatedShots);
    message.success('分镜已向下合并');
  }, [shots, saveAllShots]);

  // 上移
  const handleMoveUp = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index <= 0) return;
    const updatedShots = [...shots];
    [updatedShots[index - 1], updatedShots[index]] = [updatedShots[index], updatedShots[index - 1]];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 下移
  const handleMoveDown = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0 || index >= shots.length - 1) return;
    const updatedShots = [...shots];
    [updatedShots[index], updatedShots[index + 1]] = [updatedShots[index + 1], updatedShots[index]];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 生成图片提示词（首次生成）
  const handleGenerateImagePrompt = useCallback(async (shotId: string) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    setGeneratingImagePrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(
        projectId,
        episodeId,
        shot,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        llmConfigId,
        { image: true, video: false }  // 只生成图片提示词
      );
      if (result.success) {
        setShots(prev => prev.map(s => s.id === shotId ? {
          ...s,
          imagePrompt: result.imagePrompt,
        } : s));
        message.success('图片提示词生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGeneratingImagePrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 生成视频提示词（首次生成）
  const handleGenerateVideoPrompt = useCallback(async (shotId: string) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    setGeneratingVideoPrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(
        projectId,
        episodeId,
        shot,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        llmConfigId,
        { image: false, video: true }  // 只生成视频提示词
      );
      if (result.success) {
        setShots(prev => prev.map(s => s.id === shotId ? {
          ...s,
          videoPrompt: result.videoPrompt,
        } : s));
        message.success('视频提示词生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGeneratingVideoPrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 优化图片提示词（强制重新生成）
  const handleOptimizeImagePrompt = useCallback(async (shotId: string, _currentPrompt: string) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    setGeneratingImagePrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(
        projectId,
        episodeId,
        shot,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        llmConfigId,
        { image: true, video: false },
        { force: true }  // 强制重新生成
      );
      if (result.success) {
        setShots(prev => prev.map(s => s.id === shotId ? {
          ...s,
          imagePrompt: result.imagePrompt,
        } : s));
        message.success('图片提示词优化完成');
      } else {
        message.error(result.error || '优化失败');
      }
    } catch (err: any) {
      message.error(err.message || '优化失败');
    } finally {
      setGeneratingImagePrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 优化视频提示词（强制重新生成）
  const handleOptimizeVideoPrompt = useCallback(async (shotId: string, _currentPrompt: string) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    setGeneratingVideoPrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(
        projectId,
        episodeId,
        shot,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        llmConfigId,
        { image: false, video: true },
        { force: true }  // 强制重新生成
      );
      if (result.success) {
        setShots(prev => prev.map(s => s.id === shotId ? {
          ...s,
          videoPrompt: result.videoPrompt,
        } : s));
        message.success('视频提示词优化完成');
      } else {
        message.error(result.error || '优化失败');
      }
    } catch (err: any) {
      message.error(err.message || '优化失败');
    } finally {
      setGeneratingVideoPrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 批量生成提示词（跳过已有提示词的）
  const handleBatchGeneratePrompts = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    // 如果指定了 shotIds，则只处理这些分镜中缺少提示词的
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithoutPrompt = baseShots.filter(s => !s.imagePrompt?.trim() || !s.videoPrompt?.trim());
    if (shotsWithoutPrompt.length === 0) {
      message.info('所选分镜都已有提示词');
      return;
    }
    const shotIds = shotsWithoutPrompt.map(s => s.id);
    setGeneratingImagePrompts(new Set(shotIds));
    setGeneratingVideoPrompts(new Set(shotIds));
    setBatchProgress({ current: 0, total: shotsWithoutPrompt.length, step: '准备生成...' });
    try {
      const results = await batchGenerateShotPrompts(
        projectId,
        episodeId,
        shotsWithoutPrompt,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        (current, total, result) => {
          setBatchProgress({ current, total, step: `生成中 ${current}/${total}` });
          if (result.success) {
            setShots(prev => prev.map(s => s.id === result.shotId ? {
              ...s,
              imagePrompt: result.imagePrompt,
              videoPrompt: result.videoPrompt,
            } : s));
          }
        },
        llmConfigId
      );
      const successCount = results.filter(r => r.success).length;
      message.success(`提示词生成完成: ${successCount}/${results.length} 成功`);
    } catch (err: any) {
      message.error(err.message || '批量生成失败');
    } finally {
      setGeneratingImagePrompts(new Set());
      setGeneratingVideoPrompts(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 批量重新生成提示词（强制重新生成已有提示词的）
  const handleBatchReGeneratePrompts = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithPrompt = baseShots.filter(s => s.imagePrompt?.trim() || s.videoPrompt?.trim());
    if (shotsWithPrompt.length === 0) {
      message.info('所选分镜都没有提示词');
      return;
    }
    const shotIds = shotsWithPrompt.map(s => s.id);
    setGeneratingImagePrompts(new Set(shotIds));
    setGeneratingVideoPrompts(new Set(shotIds));
    setBatchProgress({ current: 0, total: shotsWithPrompt.length, step: '准备重新生成...' });
    try {
      const results = await batchGenerateShotPrompts(
        projectId,
        episodeId,
        shotsWithPrompt,
        settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        (current, total, result) => {
          setBatchProgress({ current, total, step: `重新生成中 ${current}/${total}` });
          if (result.success) {
            setShots(prev => prev.map(s => s.id === result.shotId ? {
              ...s,
              imagePrompt: result.imagePrompt,
              videoPrompt: result.videoPrompt,
            } : s));
          }
        },
        llmConfigId
      );
      const successCount = results.filter(r => r.success).length;
      message.success(`提示词重新生成完成: ${successCount}/${results.length} 成功`);
    } catch (err: any) {
      message.error(err.message || '批量重新生成失败');
    } finally {
      setGeneratingImagePrompts(new Set());
      setGeneratingVideoPrompts(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // 创建新分镜
  const createNewShot = useCallback((): Shot => ({
    id: uuidv4(),
    scriptContent: '',
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 3,
    description: '',
    characters: [],
    dialogue: '',
    emotion: '',
  }), []);

  // 在末尾添加分镜
  const handleAddShot = useCallback(async () => {
    const newShot = createNewShot();
    const updatedShots = [...shots, newShot];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots, createNewShot]);

  // 在指定位置上方插入
  const handleInsertAbove = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0) return;
    const newShot = createNewShot();
    const updatedShots = [...shots.slice(0, index), newShot, ...shots.slice(index)];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots, createNewShot]);

  // 在指定位置下方插入
  const handleInsertBelow = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0) return;
    const newShot = createNewShot();
    const updatedShots = [...shots.slice(0, index + 1), newShot, ...shots.slice(index + 1)];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots, createNewShot]);

  // 批量生成图片（跳过已有图片的）
  const handleBatchGenerate = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithoutImage = baseShots.filter(s => !s.imagePath && !(s.imagePaths?.length));
    if (shotsWithoutImage.length === 0) {
      message.info('所选分镜都已有图片');
      return;
    }
    const shotIds = shotsWithoutImage.map(s => s.id);
    setGeneratingShots(new Set(shotIds));
    try {
      await batchGenerateShotImages(projectId, episodeId, shotIds, characters, scenes, ttiConfigId);
      message.info(`已启动 ${shotIds.length} 个分镜的图片生成任务`);
    } catch (err: any) {
      message.error(err.message || '批量生成启动失败');
      setGeneratingShots(new Set());
    }
  }, [projectId, episodeId, shots, characters, scenes, ttiConfigId]);

  // 批量重新生成图片（强制重新生成已有图片的）
  const handleBatchReGenerateImages = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithImage = baseShots.filter(s => s.imagePath || (s.imagePaths?.length));
    if (shotsWithImage.length === 0) {
      message.info('所选分镜都没有图片');
      return;
    }
    const shotIds = shotsWithImage.map(s => s.id);
    setGeneratingShots(new Set(shotIds));
    try {
      await batchGenerateShotImages(projectId, episodeId, shotIds, characters, scenes, ttiConfigId);
      message.info(`已启动 ${shotIds.length} 个分镜的图片重新生成任务`);
    } catch (err: any) {
      message.error(err.message || '批量重新生成启动失败');
      setGeneratingShots(new Set());
    }
  }, [projectId, episodeId, shots, characters, scenes, ttiConfigId]);

  // 批量渲染视频（已确认的）
  const handleBatchRenderVideos = useCallback(async (targetShotIds?: string[]) => {
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const confirmedToRender = baseShots.filter(s => s.confirmed);
    if (confirmedToRender.length === 0) {
      message.warning('请先确认要渲染的分镜');
      return;
    }
    const shotIds = confirmedToRender.map(s => s.id);
    setRenderingShots(new Set(shotIds));
    setRenderProgress(0);
    setRenderStep('准备批量渲染...');
    try {
      const result = await batchRenderShots(
        {
          projectId,
          shots: confirmedToRender,
          projectConfigIds: {
            ttiConfigId,
            itvConfigId: settings.itvConfigs?.find(c => c.isDefault)?.id,
            ttsConfigId: settings.ttsConfigs?.find(c => c.isDefault)?.id,
          },
        },
        (overall, current) => {
          setRenderProgress(overall);
          setRenderStep(`${current.step || ''} (${current.shotId})`);
        }
      );
      // 更新所有成功渲染的 shot 的 videos 字段
      const updatedShots = shots.map(s => {
        const renderResult = result.results.find(r => r.shotId === s.id && r.success && r.version);
        if (renderResult && renderResult.version) {
          const newVideo: ShotVideo = {
            path: renderResult.version.videoPath || renderResult.version.remoteVideoUrl || '',
            thumbnailPath: renderResult.version.imagePath,
            prompt: renderResult.version.prompt,
            seed: renderResult.version.seed,
            model: renderResult.version.model,
            createdAt: renderResult.version.createdAt || Date.now(),
          };
          const existingVideos = s.videos || [];
          return {
            ...s,
            videos: [...existingVideos, newVideo],
            currentVideoIndex: existingVideos.length,
            ...(renderResult.version.imagePath ? {
              imagePaths: [...(s.imagePaths || []), renderResult.version.imagePath],
              currentImageIndex: (s.imagePaths || []).length,
              imagePath: renderResult.version.imagePath,
            } : {}),
          };
        }
        return s;
      });
      await saveAllShots(updatedShots);
      message.success(`批量渲染完成: ${result.success} 成功, ${result.failed} 失败`);
    } catch (err: any) {
      message.error(err.message || '批量渲染失败');
    } finally {
      setRenderingShots(new Set());
      setRenderProgress(0);
      setRenderStep('');
    }
  }, [projectId, shots, ttiConfigId, settings.itvConfigs, settings.ttsConfigs, saveAllShots]);

  // 批量重新生成视频（已有视频的）
  const handleBatchReGenerateVideos = useCallback(async (targetShotIds?: string[]) => {
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithVideo = baseShots.filter(s => (s.videos?.length || 0) > 0);
    if (shotsWithVideo.length === 0) {
      message.info('所选分镜都没有视频');
      return;
    }
    const shotIds = shotsWithVideo.map(s => s.id);
    setRenderingShots(new Set(shotIds));
    setRenderProgress(0);
    setRenderStep('准备批量重新渲染...');
    try {
      const result = await batchRenderShots(
        {
          projectId,
          shots: shotsWithVideo,
          projectConfigIds: {
            ttiConfigId,
            itvConfigId: settings.itvConfigs?.find(c => c.isDefault)?.id,
            ttsConfigId: settings.ttsConfigs?.find(c => c.isDefault)?.id,
          },
        },
        (overall, current) => {
          setRenderProgress(overall);
          setRenderStep(`${current.step || ''} (${current.shotId})`);
        }
      );
      // 更新所有成功渲染的 shot 的 videos 字段
      const updatedShots = shots.map(s => {
        const renderResult = result.results.find(r => r.shotId === s.id && r.success && r.version);
        if (renderResult && renderResult.version) {
          const newVideo: ShotVideo = {
            path: renderResult.version.videoPath || renderResult.version.remoteVideoUrl || '',
            thumbnailPath: renderResult.version.imagePath,
            prompt: renderResult.version.prompt,
            seed: renderResult.version.seed,
            model: renderResult.version.model,
            createdAt: renderResult.version.createdAt || Date.now(),
          };
          const existingVideos = s.videos || [];
          return {
            ...s,
            videos: [...existingVideos, newVideo],
            currentVideoIndex: existingVideos.length,
            ...(renderResult.version.imagePath ? {
              imagePaths: [...(s.imagePaths || []), renderResult.version.imagePath],
              currentImageIndex: (s.imagePaths || []).length,
              imagePath: renderResult.version.imagePath,
            } : {}),
          };
        }
        return s;
      });
      await saveAllShots(updatedShots);
      message.success(`批量重新渲染完成: ${result.success} 成功, ${result.failed} 失败`);
    } catch (err: any) {
      message.error(err.message || '批量重新渲染失败');
    } finally {
      setRenderingShots(new Set());
      setRenderProgress(0);
      setRenderStep('');
    }
  }, [projectId, shots, ttiConfigId, settings.itvConfigs, settings.ttsConfigs, saveAllShots]);

  return {
    generatingShots,
    renderingShots,
    renderProgress,
    renderStep,
    generatingImagePrompts,
    generatingVideoPrompts,
    batchProgress,
    handleToggleConfirm,
    handleDeleteShot,
    handleBatchDelete,
    handleBatchConfirm,
    handleGenerateShotImage,
    handleRenderShotVideo,
    handleScriptChange,
    handleImagePromptChange,
    handleVideoPromptChange,
    handleCharactersChange,
    handleScenesChange,
    handleReferenceImagesChange,
    handlePropsChange,
    handleImagesChange,
    handleVideosChange,
    handleMergeUp,
    handleMergeDown,
    handleMoveUp,
    handleMoveDown,
    handleGenerateImagePrompt,
    handleGenerateVideoPrompt,
    handleOptimizeImagePrompt,
    handleOptimizeVideoPrompt,
    handleBatchGeneratePrompts,
    handleBatchReGeneratePrompts,
    handleAddShot,
    handleInsertAbove,
    handleInsertBelow,
    handleBatchGenerate,
    handleBatchReGenerateImages,
    handleBatchRenderVideos,
    handleBatchReGenerateVideos
  };
};
