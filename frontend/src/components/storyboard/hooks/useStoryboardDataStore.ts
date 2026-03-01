import { useState, useEffect, useCallback, useMemo } from 'react';
import { App } from 'antd';
import { v4 as uuidv4 } from 'uuid';
import type { Shot, Character, Scene, Prop } from '../../../types';
import { loadEpisodeShots, saveEpisodeShots, loadCharacters, loadScenes, loadProps, loadEpisodeAnalysis } from '../../../store/projectStore';
import { useShotAssetSync } from '../../../hooks/useShotAssetSync';
import type { MentionItem } from '../../../editor';

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

interface UseStoryboardDataStoreParams {
  projectId: string;
  episodeId?: string;
  mentionItems?: MentionItem[];
}

export function useStoryboardDataStore({
  projectId,
  episodeId,
  mentionItems = [],
}: UseStoryboardDataStoreParams) {
  const { message } = App.useApp();

  const [shots, setShots] = useState<Shot[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);

  const assets = useMemo(() => ({ characters, scenes, props }), [characters, scenes, props]);
  const { syncFromPrompt, handleAssetChange } = useShotAssetSync(assets);

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

  const loadData = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const loadedShots = episodeId ? await loadEpisodeShots(projectId, episodeId) : [];
      const [loadedCharacters, loadedScenes, loadedProps, episodeAnalysis] = await Promise.all([
        loadCharacters(projectId),
        loadScenes(projectId),
        loadProps(projectId),
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
  }, [projectId, episodeId, message]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveAllShots = useCallback(async (updatedShots: Shot[]) => {
    if (!episodeId) {
      message.warning('未选择剧集，无法保存分镜');
      return;
    }

    try {
      await saveEpisodeShots(projectId, episodeId, updatedShots);
      setShots(updatedShots);
    } catch {
      message.error('保存失败');
    }
  }, [projectId, episodeId, message]);

  const handleToggleConfirm = useCallback(async (shot: Shot) => {
    await saveAllShots(shots.map(s => s.id === shot.id ? { ...s, confirmed: !s.confirmed } : s));
  }, [shots, saveAllShots]);

  const handleDeleteShot = useCallback(async (shotId: string) => {
    await saveAllShots(shots.filter(s => s.id !== shotId));
    message.success('分镜已删除');
  }, [shots, saveAllShots, message]);

  const handleBatchDelete = useCallback(async (shotIds: string[]) => {
    await saveAllShots(shots.filter(s => !shotIds.includes(s.id)));
    message.success(`已删除 ${shotIds.length} 个分镜`);
  }, [shots, saveAllShots, message]);

  const handleBatchConfirm = useCallback(async (shotIds: string[], confirm: boolean) => {
    await saveAllShots(shots.map(s => shotIds.includes(s.id) ? { ...s, confirmed: confirm } : s));
    message.success(confirm ? `已确认 ${shotIds.length} 个分镜` : `已取消确认 ${shotIds.length} 个分镜`);
  }, [shots, saveAllShots, message]);

  const handleScriptChange = useCallback((shotId: string, scriptContent: string) => {
    saveAllShots(shots.map(s => s.id === shotId ? { ...s, scriptContent } : s));
  }, [shots, saveAllShots]);

  const handleImagePromptChange = useCallback((shotId: string, imagePrompt: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    const syncState = syncFromPrompt(imagePrompt);
    saveAllShots(shots.map(s => s.id === shotId ? {
      ...s,
      imagePrompt,
      characters: syncState.selectedCharacters,
      scenes: syncState.selectedScenes,
      props: syncState.selectedProps,
    } : s));
  }, [shots, saveAllShots, syncFromPrompt]);

  const handleVideoPromptChange = useCallback((shotId: string, videoPrompt: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    const syncState = syncFromPrompt(videoPrompt);
    saveAllShots(shots.map(s => s.id === shotId ? {
      ...s,
      videoPrompt,
      characters: syncState.selectedCharacters,
      scenes: syncState.selectedScenes,
      props: syncState.selectedProps,
    } : s));
  }, [shots, saveAllShots, syncFromPrompt]);

  const handleCharactersChange = useCallback((shotId: string, characterIds: string[]) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    const newImagePrompt = handleAssetChange('character', characterIds, shot.imagePrompt || '', assets);
    const newVideoPrompt = handleAssetChange('character', characterIds, shot.videoPrompt || '', assets);
    saveAllShots(shots.map(s => s.id === shotId ? {
      ...s,
      characters: characterIds,
      imagePrompt: newImagePrompt,
      videoPrompt: newVideoPrompt,
    } : s));
  }, [shots, saveAllShots, handleAssetChange, assets]);

  const handleScenesChange = useCallback((shotId: string, sceneIds: string[]) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    const newImagePrompt = handleAssetChange('scene', sceneIds, shot.imagePrompt || '', assets);
    const newVideoPrompt = handleAssetChange('scene', sceneIds, shot.videoPrompt || '', assets);
    saveAllShots(shots.map(s => s.id === shotId ? {
      ...s,
      scenes: sceneIds,
      imagePrompt: newImagePrompt,
      videoPrompt: newVideoPrompt,
    } : s));
  }, [shots, saveAllShots, handleAssetChange, assets]);

  const handlePropsChange = useCallback((shotId: string, propIds: string[]) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    const newImagePrompt = handleAssetChange('prop', propIds, shot.imagePrompt || '', assets);
    const newVideoPrompt = handleAssetChange('prop', propIds, shot.videoPrompt || '', assets);
    saveAllShots(shots.map(s => s.id === shotId ? {
      ...s,
      props: propIds,
      imagePrompt: newImagePrompt,
      videoPrompt: newVideoPrompt,
    } : s));
  }, [shots, saveAllShots, handleAssetChange, assets]);

  const handleReferenceImagesChange = useCallback((shotId: string, referenceImages: string[], selectedReferenceIndex: number) => {
    saveAllShots(shots.map(s => s.id === shotId ? { ...s, referenceImages, selectedReferenceIndex } : s));
  }, [shots, saveAllShots]);

  const handleImagesChange = useCallback((shotId: string, imagePaths: string[], currentImageIndex: number) => {
    saveAllShots(shots.map(s => s.id === shotId ? {
      ...s,
      imagePaths,
      currentImageIndex,
      imagePath: imagePaths[currentImageIndex] || undefined,
    } : s));
  }, [shots, saveAllShots]);

  const handleVideosChange = useCallback((shotId: string, videos: Shot['videos'], currentVideoIndex: number) => {
    saveAllShots(shots.map(s => s.id === shotId ? { ...s, videos, currentVideoIndex } : s));
  }, [shots, saveAllShots]);

  const handleMergeUp = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index <= 0) return;

    const merged = mergeShots(shots[index - 1], shots[index]);
    await saveAllShots(shots.filter((_, i) => i !== index).map((s, i) => i === index - 1 ? merged : s));
    message.success('分镜已向上合并');
  }, [shots, saveAllShots, message]);

  const handleMergeDown = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0 || index >= shots.length - 1) return;

    const merged = mergeShots(shots[index], shots[index + 1]);
    await saveAllShots(shots.filter((_, i) => i !== index + 1).map((s, i) => i === index ? merged : s));
    message.success('分镜已向下合并');
  }, [shots, saveAllShots, message]);

  const handleMoveUp = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index <= 0) return;

    const updated = [...shots];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    await saveAllShots(updated);
  }, [shots, saveAllShots]);

  const handleMoveDown = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0 || index >= shots.length - 1) return;

    const updated = [...shots];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    await saveAllShots(updated);
  }, [shots, saveAllShots]);

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

  const handleAddShot = useCallback(async () => {
    await saveAllShots([...shots, createNewShot()]);
  }, [shots, saveAllShots, createNewShot]);

  const handleInsertAbove = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0) return;
    await saveAllShots([...shots.slice(0, index), createNewShot(), ...shots.slice(index)]);
  }, [shots, saveAllShots, createNewShot]);

  const handleInsertBelow = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0) return;
    await saveAllShots([...shots.slice(0, index + 1), createNewShot(), ...shots.slice(index + 1)]);
  }, [shots, saveAllShots, createNewShot]);

  return {
    shots,
    setShots,
    characters,
    scenes,
    props,
    loading,
    loadData,
    saveAllShots,
    actualMentionItems,
    handleToggleConfirm,
    handleDeleteShot,
    handleBatchDelete,
    handleBatchConfirm,
    handleScriptChange,
    handleImagePromptChange,
    handleVideoPromptChange,
    handleCharactersChange,
    handleScenesChange,
    handlePropsChange,
    handleReferenceImagesChange,
    handleImagesChange,
    handleVideosChange,
    handleMergeUp,
    handleMergeDown,
    handleMoveUp,
    handleMoveDown,
    handleAddShot,
    handleInsertAbove,
    handleInsertBelow,
  };
}
