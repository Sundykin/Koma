/**
 * Storyboard 状态管理 Hook
 * 从 Storyboard.tsx 拆分出的状态和业务逻辑
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Shot, Character, Scene, Prop, AppSettings, ShotVideo, EpisodeAnalysis } from '../../types';
import { loadEpisodeShots, saveEpisodeShots, loadCharacters, loadScenes, loadProps, loadEpisodeAnalysis } from '../../store/projectStore';
import { generateShotImage, batchGenerateShotImages } from '../../services/ShotGenerationService';
import { shotRenderWorkflow, batchRenderShots } from '../../workflow/shotRenderWorkflow';
import { startShotAnalysis, type PresetAssets } from '../../services/ShotAnalysisService';
import { generateShotPrompt, batchGenerateShotPrompts } from '../../services/ShotPromptService';
import { TaskManager } from '../../services/TaskManager';
import type { MentionItem } from '../../editor';
import { useShotAssetSync } from '../../hooks/useShotAssetSync';
import { toUserMessage } from '../../utils/errorMessages';
import { App } from 'antd';

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

interface UseStoryboardStateProps {
  projectId: string;
  episodeId?: string;
  episodeName?: string;
  script?: string;
  llmConfigId?: string;
  ttiConfigId?: string;
  settings: AppSettings;
  mentionItems?: MentionItem[];
}

export function useStoryboardState({
  projectId, episodeId, episodeName, script,
  llmConfigId, ttiConfigId, settings, mentionItems = [],
}: UseStoryboardStateProps) {
  const { message } = App.useApp();

  const [shots, setShots] = useState<Shot[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingShots, setGeneratingShots] = useState<Set<string>>(new Set());
  const [generatingImagePrompts, setGeneratingImagePrompts] = useState<Set<string>>(new Set());
  const [generatingVideoPrompts, setGeneratingVideoPrompts] = useState<Set<string>>(new Set());
  const [renderingShots, setRenderingShots] = useState<Set<string>>(new Set());
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStep, setRenderStep] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; step?: string } | undefined>();
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetAssets, setPresetAssets] = useState<PresetAssets | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Shot>>({});
  const [activeShotId, setActiveShotId] = useState<string | null>(null);

  const activeShot = useMemo(() => shots.find(s => s.id === activeShotId) || null, [shots, activeShotId]);

  // 资产同步 Hook
  const assets = useMemo(() => ({ characters, scenes, props }), [characters, scenes, props]);
  const { syncFromPrompt, handleAssetChange } = useShotAssetSync(assets);

  // mentionItems
  const actualMentionItems: MentionItem[] = useMemo(() => {
    if (mentionItems.length > 0) return mentionItems;
    const items: MentionItem[] = [];
    characters.forEach(char => {
      items.push({ id: char.id, type: 'char' as const, name: char.name, description: char.description, previewImage: char.costumePhotoPath });
    });
    scenes.forEach(scene => {
      items.push({ id: scene.id, type: 'scene' as const, name: scene.name, description: scene.description, previewImage: scene.imagePath });
    });
    props.forEach(prop => {
      items.push({ id: prop.id, type: 'prop' as const, name: prop.name, description: prop.description, previewImage: prop.imagePath });
    });
    return items;
  }, [mentionItems, characters, scenes, props]);

  // 加载数据
  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const loadedShots = episodeId ? await loadEpisodeShots(projectId, episodeId) : [];
      const [loadedCharacters, loadedScenes, loadedProps, episodeAnalysis] = await Promise.all([
        loadCharacters(projectId), loadScenes(projectId), loadProps(projectId),
        episodeId ? loadEpisodeAnalysis(projectId, episodeId) : Promise.resolve(null),
      ]);
      let filteredCharacters = loadedCharacters;
      let filteredScenes = loadedScenes;
      let filteredProps = loadedProps;
      if (episodeAnalysis) {
        const charRefs = new Set(episodeAnalysis.characterRefs);
        const sceneRefs = new Set(episodeAnalysis.sceneRefs);
        const propRefs = new Set(episodeAnalysis.propRefs);
        filteredCharacters = loadedCharacters.filter(c => charRefs.has(c.id));
        filteredScenes = loadedScenes.filter(s => sceneRefs.has(s.id));
        filteredProps = loadedProps.filter(p => propRefs.has(p.id));
      }
      setShots(loadedShots);
      setCharacters(filteredCharacters);
      setScenes(filteredScenes);
      setProps(filteredProps);
    } catch (err) {
      console.error('[Storyboard] 加载失败:', err);
      message.error('加载分镜数据失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, episodeId]);

  useEffect(() => { loadData(); }, [loadData]);

  // 监听任务完成
  useEffect(() => {
    const unsubscribe = TaskManager.addListener(async (task) => {
      if (task.projectId !== projectId) return;
      if (task.type === 'shot-generation') {
        if (task.status === 'completed') {
          message.success('分镜图片生成完成');
          setGeneratingShots(prev => { const next = new Set(prev); next.delete(task.targetId!); return next; });
          if (task.targetId && episodeId) {
            try {
              const latestShots = await loadEpisodeShots(projectId, episodeId);
              const updatedShot = latestShots.find(s => s.id === task.targetId);
              if (updatedShot) setShots(prev => prev.map(s => s.id === task.targetId ? updatedShot : s));
            } catch (err) { console.error('[Storyboard] 更新 shot 失败:', err); }
          }
        } else if (task.status === 'failed') {
          message.error(`分镜图片生成失败: ${toUserMessage(task.error)}`);
          setGeneratingShots(prev => { const next = new Set(prev); next.delete(task.targetId!); return next; });
        }
      }
      if (task.type === 'shot-analysis') {
        if (task.status === 'completed') {
          message.success(`AI 分镜生成完成，共 ${task.result?.shotsCount || 0} 个分镜`);
          setIsAnalyzing(false); loadData();
        } else if (task.status === 'failed') {
          message.error(`AI 分镜生成失败: ${toUserMessage(task.error)}`);
          setIsAnalyzing(false);
        }
      }
    });
    return () => unsubscribe();
  }, [projectId, episodeId, loadData]);

  // 保存
  const saveAllShots = useCallback(async (updatedShots: Shot[]) => {
    if (!episodeId) { message.warning('未选择剧集，无法保存分镜'); return; }
    try { await saveEpisodeShots(projectId, episodeId, updatedShots); setShots(updatedShots); }
    catch { message.error('保存失败'); }
  }, [projectId, episodeId]);

  // ============ Shot CRUD ============
  const handleToggleConfirm = useCallback(async (shot: Shot) => {
    await saveAllShots(shots.map(s => s.id === shot.id ? { ...s, confirmed: !s.confirmed } : s));
  }, [shots, saveAllShots]);

  const handleDeleteShot = useCallback(async (shotId: string) => {
    await saveAllShots(shots.filter(s => s.id !== shotId)); message.success('分镜已删除');
  }, [shots, saveAllShots]);

  const handleBatchDelete = useCallback(async (shotIds: string[]) => {
    await saveAllShots(shots.filter(s => !shotIds.includes(s.id))); message.success(`已删除 ${shotIds.length} 个分镜`);
  }, [shots, saveAllShots]);

  const handleBatchConfirm = useCallback(async (shotIds: string[], confirm: boolean) => {
    await saveAllShots(shots.map(s => shotIds.includes(s.id) ? { ...s, confirmed: confirm } : s));
    message.success(confirm ? `已确认 ${shotIds.length} 个分镜` : `已取消确认 ${shotIds.length} 个分镜`);
  }, [shots, saveAllShots]);

  // ============ 图片生成 ============
  const handleGenerateShotImage = useCallback(async (shotId: string) => {
    if (!episodeId) { message.warning('未选择剧集'); return; }
    setGeneratingShots(prev => new Set(prev).add(shotId));
    try {
      await generateShotImage(projectId, episodeId, shotId, characters, scenes, ttiConfigId);
      message.info('分镜图片生成任务已启动');
    } catch (err: any) {
      message.error(err.message || '启动生成失败');
      setGeneratingShots(prev => { const next = new Set(prev); next.delete(shotId); return next; });
    }
  }, [projectId, episodeId, characters, scenes, ttiConfigId]);

  // ============ 视频渲染 ============
  const handleRenderShotVideo = useCallback(async (shotId: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    setRenderingShots(prev => new Set(prev).add(shotId));
    setRenderProgress(0); setRenderStep('准备渲染...');
    try {
      const result = await shotRenderWorkflow(
        { projectId, shot, projectConfigIds: { ttiConfigId, itvConfigId: settings.itvConfigs?.find(c => c.isDefault)?.id, ttsConfigId: settings.ttsConfigs?.find(c => c.isDefault)?.id } },
        (progress, step) => { setRenderProgress(progress); setRenderStep(step || ''); }
      );
      if (result.success && result.version) {
        const newVideo: ShotVideo = { path: result.version.videoPath || result.version.remoteVideoUrl || '', thumbnailPath: result.version.imagePath, prompt: result.version.prompt, seed: result.version.seed, model: result.version.model, createdAt: result.version.createdAt || Date.now() };
        const existingVideos = shot.videos || [];
        const updatedShots = shots.map(s => s.id === shotId ? { ...s, videos: [...existingVideos, newVideo], currentVideoIndex: existingVideos.length, ...(result.version!.imagePath ? { imagePaths: [...(s.imagePaths || []), result.version!.imagePath!], currentImageIndex: (s.imagePaths || []).length, imagePath: result.version!.imagePath } : {}) } : s);
        await saveAllShots(updatedShots); message.success('分镜渲染完成');
      } else { message.error(toUserMessage(result.error) || '渲染失败'); loadData(); }
    } catch (err: any) { message.error(toUserMessage(err)); }
    finally {
      setRenderingShots(prev => { const next = new Set(prev); next.delete(shotId); return next; });
      setRenderProgress(0); setRenderStep('');
    }
  }, [projectId, shots, ttiConfigId, settings.itvConfigs, settings.ttsConfigs, saveAllShots, loadData]);

  // ============ 字段变更 ============
  const handleScriptChange = useCallback((shotId: string, scriptContent: string) => {
    saveAllShots(shots.map(s => s.id === shotId ? { ...s, scriptContent } : s));
  }, [shots, saveAllShots]);

  const handleImagePromptChange = useCallback((shotId: string, imagePrompt: string) => {
    const shot = shots.find(s => s.id === shotId); if (!shot) return;
    const syncState = syncFromPrompt(imagePrompt);
    saveAllShots(shots.map(s => s.id === shotId ? { ...s, imagePrompt, characters: syncState.selectedCharacters, scenes: syncState.selectedScenes, props: syncState.selectedProps } : s));
  }, [shots, saveAllShots, syncFromPrompt]);

  const handleVideoPromptChange = useCallback((shotId: string, videoPrompt: string) => {
    const shot = shots.find(s => s.id === shotId); if (!shot) return;
    const syncState = syncFromPrompt(videoPrompt);
    saveAllShots(shots.map(s => s.id === shotId ? { ...s, videoPrompt, characters: syncState.selectedCharacters, scenes: syncState.selectedScenes, props: syncState.selectedProps } : s));
  }, [shots, saveAllShots, syncFromPrompt]);

  const handleCharactersChange = useCallback((shotId: string, characterIds: string[]) => {
    const shot = shots.find(s => s.id === shotId); if (!shot) return;
    const newImagePrompt = handleAssetChange('character', characterIds, shot.imagePrompt || '', assets);
    const newVideoPrompt = handleAssetChange('character', characterIds, shot.videoPrompt || '', assets);
    saveAllShots(shots.map(s => s.id === shotId ? { ...s, characters: characterIds, imagePrompt: newImagePrompt, videoPrompt: newVideoPrompt } : s));
  }, [shots, saveAllShots, handleAssetChange, assets]);

  const handleScenesChange = useCallback((shotId: string, sceneIds: string[]) => {
    const shot = shots.find(s => s.id === shotId); if (!shot) return;
    const newImagePrompt = handleAssetChange('scene', sceneIds, shot.imagePrompt || '', assets);
    const newVideoPrompt = handleAssetChange('scene', sceneIds, shot.videoPrompt || '', assets);
    saveAllShots(shots.map(s => s.id === shotId ? { ...s, scenes: sceneIds, imagePrompt: newImagePrompt, videoPrompt: newVideoPrompt } : s));
  }, [shots, saveAllShots, handleAssetChange, assets]);

  const handleReferenceImagesChange = useCallback((shotId: string, referenceImages: string[], selectedReferenceIndex: number) => {
    saveAllShots(shots.map(s => s.id === shotId ? { ...s, referenceImages, selectedReferenceIndex } : s));
  }, [shots, saveAllShots]);

  const handlePropsChange = useCallback((shotId: string, propIds: string[]) => {
    const shot = shots.find(s => s.id === shotId); if (!shot) return;
    const newImagePrompt = handleAssetChange('prop', propIds, shot.imagePrompt || '', assets);
    const newVideoPrompt = handleAssetChange('prop', propIds, shot.videoPrompt || '', assets);
    saveAllShots(shots.map(s => s.id === shotId ? { ...s, props: propIds, imagePrompt: newImagePrompt, videoPrompt: newVideoPrompt } : s));
  }, [shots, saveAllShots, handleAssetChange, assets]);

  const handleImagesChange = useCallback((shotId: string, imagePaths: string[], currentImageIndex: number) => {
    saveAllShots(shots.map(s => s.id === shotId ? { ...s, imagePaths, currentImageIndex, imagePath: imagePaths[currentImageIndex] || undefined } : s));
  }, [shots, saveAllShots]);

  const handleVideosChange = useCallback((shotId: string, videos: ShotVideo[], currentVideoIndex: number) => {
    saveAllShots(shots.map(s => s.id === shotId ? { ...s, videos, currentVideoIndex } : s));
  }, [shots, saveAllShots]);

  // ============ 排序/合并 ============
  const handleMergeUp = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId); if (index <= 0) return;
    const merged = mergeShots(shots[index - 1], shots[index]);
    await saveAllShots(shots.filter((_, i) => i !== index).map((s, i) => i === index - 1 ? merged : s));
    message.success('分镜已向上合并');
  }, [shots, saveAllShots]);

  const handleMergeDown = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId); if (index < 0 || index >= shots.length - 1) return;
    const merged = mergeShots(shots[index], shots[index + 1]);
    await saveAllShots(shots.filter((_, i) => i !== index + 1).map((s, i) => i === index ? merged : s));
    message.success('分镜已向下合并');
  }, [shots, saveAllShots]);

  const handleMoveUp = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId); if (index <= 0) return;
    const updated = [...shots]; [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    await saveAllShots(updated);
  }, [shots, saveAllShots]);

  const handleMoveDown = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId); if (index < 0 || index >= shots.length - 1) return;
    const updated = [...shots]; [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    await saveAllShots(updated);
  }, [shots, saveAllShots]);

  // ============ 提示词生成 ============
  const handleGenerateImagePrompt = useCallback(async (shotId: string) => {
    if (!episodeId) { message.warning('未选择剧集'); return; }
    const shot = shots.find(s => s.id === shotId); if (!shot) return;
    setGeneratingImagePrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(projectId, episodeId, shot, settings.stylePrompts?.find(p => p.isDefault)?.prompt || '', llmConfigId, { image: true, video: false });
      if (result.success) { setShots(prev => prev.map(s => s.id === shotId ? { ...s, imagePrompt: result.imagePrompt } : s)); message.success('图片提示词生成完成'); }
      else message.error(result.error || '生成失败');
    } catch (err: any) { message.error(err.message || '生成失败'); }
    finally { setGeneratingImagePrompts(prev => { const next = new Set(prev); next.delete(shotId); return next; }); }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  const handleGenerateVideoPrompt = useCallback(async (shotId: string) => {
    if (!episodeId) { message.warning('未选择剧集'); return; }
    const shot = shots.find(s => s.id === shotId); if (!shot) return;
    setGeneratingVideoPrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(projectId, episodeId, shot, settings.stylePrompts?.find(p => p.isDefault)?.prompt || '', llmConfigId, { image: false, video: true });
      if (result.success) { setShots(prev => prev.map(s => s.id === shotId ? { ...s, videoPrompt: result.videoPrompt } : s)); message.success('视频提示词生成完成'); }
      else message.error(result.error || '生成失败');
    } catch (err: any) { message.error(err.message || '生成失败'); }
    finally { setGeneratingVideoPrompts(prev => { const next = new Set(prev); next.delete(shotId); return next; }); }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  const handleOptimizeImagePrompt = useCallback(async (shotId: string, _currentPrompt: string) => {
    if (!episodeId) { message.warning('未选择剧集'); return; }
    const shot = shots.find(s => s.id === shotId); if (!shot) return;
    setGeneratingImagePrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(projectId, episodeId, shot, settings.stylePrompts?.find(p => p.isDefault)?.prompt || '', llmConfigId, { image: true, video: false }, { force: true });
      if (result.success) { setShots(prev => prev.map(s => s.id === shotId ? { ...s, imagePrompt: result.imagePrompt } : s)); message.success('图片提示词优化完成'); }
      else message.error(result.error || '优化失败');
    } catch (err: any) { message.error(err.message || '优化失败'); }
    finally { setGeneratingImagePrompts(prev => { const next = new Set(prev); next.delete(shotId); return next; }); }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  const handleOptimizeVideoPrompt = useCallback(async (shotId: string, _currentPrompt: string) => {
    if (!episodeId) { message.warning('未选择剧集'); return; }
    const shot = shots.find(s => s.id === shotId); if (!shot) return;
    setGeneratingVideoPrompts(prev => new Set(prev).add(shotId));
    try {
      const result = await generateShotPrompt(projectId, episodeId, shot, settings.stylePrompts?.find(p => p.isDefault)?.prompt || '', llmConfigId, { image: false, video: true }, { force: true });
      if (result.success) { setShots(prev => prev.map(s => s.id === shotId ? { ...s, videoPrompt: result.videoPrompt } : s)); message.success('视频提示词优化完成'); }
      else message.error(result.error || '优化失败');
    } catch (err: any) { message.error(err.message || '优化失败'); }
    finally { setGeneratingVideoPrompts(prev => { const next = new Set(prev); next.delete(shotId); return next; }); }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  // ============ 批量操作 ============
  const handleBatchGeneratePrompts = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) { message.warning('未选择剧集'); return; }
    const baseShots = targetShotIds ? shots.filter(s => targetShotIds.includes(s.id)) : shots;
    const shotsWithoutPrompt = baseShots.filter(s => !s.imagePrompt?.trim() || !s.videoPrompt?.trim());
    if (shotsWithoutPrompt.length === 0) { message.info('所选分镜都已有提示词'); return; }
    const shotIds = shotsWithoutPrompt.map(s => s.id);
    setGeneratingImagePrompts(new Set(shotIds)); setGeneratingVideoPrompts(new Set(shotIds));
    setBatchProgress({ current: 0, total: shotsWithoutPrompt.length, step: '准备生成...' });
    try {
      const results = await batchGenerateShotPrompts(projectId, episodeId, shotsWithoutPrompt, settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        (current, total, result) => { setBatchProgress({ current, total, step: `生成中 ${current}/${total}` }); if (result.success) setShots(prev => prev.map(s => s.id === result.shotId ? { ...s, imagePrompt: result.imagePrompt, videoPrompt: result.videoPrompt } : s)); },
        llmConfigId);
      message.success(`提示词生成完成: ${results.filter(r => r.success).length}/${results.length} 成功`);
    } catch (err: any) { message.error(err.message || '批量生成失败'); }
    finally { setGeneratingImagePrompts(new Set()); setGeneratingVideoPrompts(new Set()); setBatchProgress(undefined); }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  const handleBatchReGeneratePrompts = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) { message.warning('未选择剧集'); return; }
    const baseShots = targetShotIds ? shots.filter(s => targetShotIds.includes(s.id)) : shots;
    const shotsWithPrompt = baseShots.filter(s => s.imagePrompt?.trim() || s.videoPrompt?.trim());
    if (shotsWithPrompt.length === 0) { message.info('所选分镜都没有提示词'); return; }
    const shotIds = shotsWithPrompt.map(s => s.id);
    setGeneratingImagePrompts(new Set(shotIds)); setGeneratingVideoPrompts(new Set(shotIds));
    setBatchProgress({ current: 0, total: shotsWithPrompt.length, step: '准备重新生成...' });
    try {
      const results = await batchGenerateShotPrompts(projectId, episodeId, shotsWithPrompt, settings.stylePrompts?.find(p => p.isDefault)?.prompt || '',
        (current, total, result) => { setBatchProgress({ current, total, step: `重新生成中 ${current}/${total}` }); if (result.success) setShots(prev => prev.map(s => s.id === result.shotId ? { ...s, imagePrompt: result.imagePrompt, videoPrompt: result.videoPrompt } : s)); },
        llmConfigId);
      message.success(`提示词重新生成完成: ${results.filter(r => r.success).length}/${results.length} 成功`);
    } catch (err: any) { message.error(err.message || '批量重新生成失败'); }
    finally { setGeneratingImagePrompts(new Set()); setGeneratingVideoPrompts(new Set()); setBatchProgress(undefined); }
  }, [projectId, episodeId, shots, llmConfigId, settings.stylePrompts]);

  const handleBatchGenerate = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) { message.warning('未选择剧集'); return; }
    const baseShots = targetShotIds ? shots.filter(s => targetShotIds.includes(s.id)) : shots;
    const shotsWithoutImage = baseShots.filter(s => !s.imagePath && !(s.imagePaths?.length));
    if (shotsWithoutImage.length === 0) { message.info('所选分镜都已有图片'); return; }
    const shotIds = shotsWithoutImage.map(s => s.id);
    setGeneratingShots(new Set(shotIds));
    try { await batchGenerateShotImages(projectId, episodeId, shotIds, characters, scenes, ttiConfigId); message.info(`已启动 ${shotIds.length} 个分镜的图片生成任务`); }
    catch (err: any) { message.error(err.message || '批量生成启动失败'); setGeneratingShots(new Set()); }
  }, [projectId, episodeId, shots, characters, scenes, ttiConfigId]);

  const handleBatchReGenerateImages = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) { message.warning('未选择剧集'); return; }
    const baseShots = targetShotIds ? shots.filter(s => targetShotIds.includes(s.id)) : shots;
    const shotsWithImage = baseShots.filter(s => s.imagePath || (s.imagePaths?.length));
    if (shotsWithImage.length === 0) { message.info('所选分镜都没有图片'); return; }
    const shotIds = shotsWithImage.map(s => s.id);
    setGeneratingShots(new Set(shotIds));
    try { await batchGenerateShotImages(projectId, episodeId, shotIds, characters, scenes, ttiConfigId); message.info(`已启动 ${shotIds.length} 个分镜的图片重新生成任务`); }
    catch (err: any) { message.error(err.message || '批量重新生成启动失败'); setGeneratingShots(new Set()); }
  }, [projectId, episodeId, shots, characters, scenes, ttiConfigId]);

  const handleBatchRenderVideos = useCallback(async (targetShotIds?: string[]) => {
    const baseShots = targetShotIds ? shots.filter(s => targetShotIds.includes(s.id)) : shots;
    const confirmedToRender = baseShots.filter(s => s.confirmed);
    if (confirmedToRender.length === 0) { message.warning('请先确认要渲染的分镜'); return; }
    const shotIds = confirmedToRender.map(s => s.id);
    setRenderingShots(new Set(shotIds)); setRenderProgress(0); setRenderStep('准备批量渲染...');
    try {
      const result = await batchRenderShots(
        { projectId, shots: confirmedToRender, projectConfigIds: { ttiConfigId, itvConfigId: settings.itvConfigs?.find(c => c.isDefault)?.id, ttsConfigId: settings.ttsConfigs?.find(c => c.isDefault)?.id } },
        (overall, current) => { setRenderProgress(overall); setRenderStep(`${current.step || ''} (${current.shotId})`); }
      );
      const updatedShots = shots.map(s => {
        const rr = result.results.find(r => r.shotId === s.id && r.success && r.version);
        if (rr && rr.version) {
          const nv: ShotVideo = { path: rr.version.videoPath || rr.version.remoteVideoUrl || '', thumbnailPath: rr.version.imagePath, prompt: rr.version.prompt, seed: rr.version.seed, model: rr.version.model, createdAt: rr.version.createdAt || Date.now() };
          const ev = s.videos || [];
          return { ...s, videos: [...ev, nv], currentVideoIndex: ev.length, ...(rr.version.imagePath ? { imagePaths: [...(s.imagePaths || []), rr.version.imagePath], currentImageIndex: (s.imagePaths || []).length, imagePath: rr.version.imagePath } : {}) };
        }
        return s;
      });
      await saveAllShots(updatedShots); message.success(`批量渲染完成: ${result.success} 成功, ${result.failed} 失败`);
    } catch (err: any) { message.error(err.message || '批量渲染失败'); }
    finally { setRenderingShots(new Set()); setRenderProgress(0); setRenderStep(''); }
  }, [projectId, shots, ttiConfigId, settings.itvConfigs, settings.ttsConfigs, saveAllShots]);

  const handleBatchReGenerateVideos = useCallback(async (targetShotIds?: string[]) => {
    const baseShots = targetShotIds ? shots.filter(s => targetShotIds.includes(s.id)) : shots;
    const shotsWithVideo = baseShots.filter(s => (s.videos?.length || 0) > 0);
    if (shotsWithVideo.length === 0) { message.info('所选分镜都没有视频'); return; }
    const shotIds = shotsWithVideo.map(s => s.id);
    setRenderingShots(new Set(shotIds)); setRenderProgress(0); setRenderStep('准备批量重新渲染...');
    try {
      const result = await batchRenderShots(
        { projectId, shots: shotsWithVideo, projectConfigIds: { ttiConfigId, itvConfigId: settings.itvConfigs?.find(c => c.isDefault)?.id, ttsConfigId: settings.ttsConfigs?.find(c => c.isDefault)?.id } },
        (overall, current) => { setRenderProgress(overall); setRenderStep(`${current.step || ''} (${current.shotId})`); }
      );
      const updatedShots = shots.map(s => {
        const rr = result.results.find(r => r.shotId === s.id && r.success && r.version);
        if (rr && rr.version) {
          const nv: ShotVideo = { path: rr.version.videoPath || rr.version.remoteVideoUrl || '', thumbnailPath: rr.version.imagePath, prompt: rr.version.prompt, seed: rr.version.seed, model: rr.version.model, createdAt: rr.version.createdAt || Date.now() };
          const ev = s.videos || [];
          return { ...s, videos: [...ev, nv], currentVideoIndex: ev.length, ...(rr.version.imagePath ? { imagePaths: [...(s.imagePaths || []), rr.version.imagePath], currentImageIndex: (s.imagePaths || []).length, imagePath: rr.version.imagePath } : {}) };
        }
        return s;
      });
      await saveAllShots(updatedShots); message.success(`批量重新渲染完成: ${result.success} 成功, ${result.failed} 失败`);
    } catch (err: any) { message.error(err.message || '批量重新渲染失败'); }
    finally { setRenderingShots(new Set()); setRenderProgress(0); setRenderStep(''); }
  }, [projectId, shots, ttiConfigId, settings.itvConfigs, settings.ttsConfigs, saveAllShots]);

  // ============ 新建/编辑 ============
  const createNewShot = useCallback((): Shot => ({
    id: uuidv4(), scriptContent: '', shotType: 'medium', cameraMovement: 'static', duration: 3, description: '', characters: [], dialogue: '', emotion: '',
  }), []);

  const handleAddShot = useCallback(async () => { await saveAllShots([...shots, createNewShot()]); }, [shots, saveAllShots, createNewShot]);
  const handleInsertAbove = useCallback(async (shotId: string) => { const i = shots.findIndex(s => s.id === shotId); if (i < 0) return; await saveAllShots([...shots.slice(0, i), createNewShot(), ...shots.slice(i)]); }, [shots, saveAllShots, createNewShot]);
  const handleInsertBelow = useCallback(async (shotId: string) => { const i = shots.findIndex(s => s.id === shotId); if (i < 0) return; await saveAllShots([...shots.slice(0, i + 1), createNewShot(), ...shots.slice(i + 1)]); }, [shots, saveAllShots, createNewShot]);

  const handleOpenPresetModal = useCallback(() => {
    if (!episodeId || !script) { message.warning('缺少剧集信息或剧本内容'); return; }
    setPresetModalOpen(true);
  }, [episodeId, script, message]);

  const handlePresetConfirm = useCallback(async (assets: PresetAssets) => {
    setPresetModalOpen(false); setPresetAssets(assets); setIsAnalyzing(true);
    try { await startShotAnalysis(projectId, episodeId!, episodeName || `剧集 ${episodeId}`, script!, llmConfigId, assets); message.info('AI 分镜生成任务已启动，可在状态栏查看进度'); }
    catch (err: any) { message.error(err.message || '启动生成失败'); setIsAnalyzing(false); }
  }, [projectId, episodeId, episodeName, script, llmConfigId, message]);

  const handleGenerateAIShots = useCallback(async () => {
    if (!episodeId || !script) { message.warning('缺少剧集信息或剧本内容'); return; }
    setIsAnalyzing(true);
    try { await startShotAnalysis(projectId, episodeId, episodeName || `剧集 ${episodeId}`, script, llmConfigId); message.info('AI 分镜生成任务已启动，可在状态栏查看进度'); }
    catch (err: any) { message.error(err.message || '启动生成失败'); setIsAnalyzing(false); }
  }, [projectId, episodeId, episodeName, script, llmConfigId, message]);

  const handleSaveEdit = useCallback(async () => {
    if (!editFormData.scriptContent?.trim()) { message.warning('请输入剧本内容'); return; }
    if (!editFormData.description?.trim()) { message.warning('请输入画面描述'); return; }
    const updatedShot: Shot = { ...editingShot!, ...editFormData } as Shot;
    const isNew = !shots.find(s => s.id === editingShot!.id);
    const updatedShots = isNew ? [...shots, updatedShot] : shots.map(s => s.id === updatedShot.id ? updatedShot : s);
    message.success(isNew ? '分镜已添加' : '分镜已更新');
    await saveAllShots(updatedShots);
    setEditModalOpen(false); setEditingShot(null); setEditFormData({});
  }, [editFormData, editingShot, shots, saveAllShots]);

  return {
    // State
    shots, characters, scenes, props, loading, isAnalyzing,
    generatingShots, generatingImagePrompts, generatingVideoPrompts,
    renderingShots, renderProgress, renderStep, batchProgress,
    presetModalOpen, editModalOpen, editingShot, editFormData,
    activeShotId, activeShot, actualMentionItems,
    // State setters
    setPresetModalOpen, setEditModalOpen, setEditingShot, setEditFormData, setActiveShotId,
    // Handlers
    handleToggleConfirm, handleDeleteShot, handleBatchDelete, handleBatchConfirm,
    handleGenerateShotImage, handleRenderShotVideo,
    handleScriptChange, handleImagePromptChange, handleVideoPromptChange,
    handleCharactersChange, handleScenesChange, handleReferenceImagesChange,
    handlePropsChange, handleImagesChange, handleVideosChange,
    handleMergeUp, handleMergeDown, handleMoveUp, handleMoveDown,
    handleGenerateImagePrompt, handleGenerateVideoPrompt,
    handleOptimizeImagePrompt, handleOptimizeVideoPrompt,
    handleBatchGeneratePrompts, handleBatchReGeneratePrompts,
    handleBatchGenerate, handleBatchReGenerateImages,
    handleBatchRenderVideos, handleBatchReGenerateVideos,
    handleAddShot, handleInsertAbove, handleInsertBelow,
    handleOpenPresetModal, handlePresetConfirm, handleGenerateAIShots, handleSaveEdit,
  };
}
