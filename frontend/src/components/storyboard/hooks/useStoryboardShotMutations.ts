/**
 * 分镜字段变更逻辑（从 Storyboard.tsx 拆出）。
 *
 * 覆盖：字幕行编辑/跨分镜拖拽、时长、图片/视频提示词（含 @mention 资产同步）、
 * 角色/场景/道具、参考图/多图/多视频、合并/移动、新建/插入、图片与视频模式切换。
 * 全部收敛为「算出新 shots → saveAllShots」单一写入路径。
 */
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { DragEndEvent } from '@dnd-kit/core';
import type {
  Shot, ShotScriptLine, Character, Scene, Prop, StoredMediaAsset, ShotMeta,
} from '../../../types';
import type { ShotImageMode } from '../../../types';
import { useShotAssetSync } from '../../../hooks/useShotAssetSync';
import { clampDurationToSpec, type VideoDurationSpec } from '../../../providers/itv/durationSpec';
import { findVersionNumberForVideoAsset } from '../../../utils/shotVersionSelection';

export type EditableShotImageMode = Exclude<ShotImageMode, 'grid'>;

function normalizeShotImageMode(mode?: ShotImageMode): EditableShotImageMode {
  return mode === 'grid' ? 'grid-9' : (mode || 'normal');
}

function isMultiPanelImageMode(mode?: ShotImageMode): boolean {
  return mode === 'grid' || mode === 'grid-9' || mode === 'grid-4' || mode === 'storyboard';
}

/**
 * 合并两个分镜。注意 imagePrompt / videoPrompt 直接清空而非拼接：
 * 这两个是派生产物，拼接出来的不是合法模板；清空后 workflow 用新整段
 * scriptLines 作为兜底输入，用户也可以手动重新 AI 推理更精炼的版本。
 */
export function mergeShots(target: Shot, source: Shot, durationSpec: VideoDurationSpec): Shot {
  const mergedMedia = {
    references: [...(target.media?.references || []), ...(source.media?.references || [])],
    images: [...(target.media?.images || []), ...(source.media?.images || [])],
    videos: [...(target.media?.videos || []), ...(source.media?.videos || [])],
    selectedReferenceIndex: target.media?.selectedReferenceIndex ?? 0,
    currentImageIndex: target.media?.currentImageIndex ?? 0,
    currentVideoIndex: target.media?.currentVideoIndex ?? 0,
  };
  return {
    ...target,
    scriptLines: [...(target.scriptLines || []), ...(source.scriptLines || [])],
    imagePrompt: undefined,
    videoPrompt: undefined,
    duration: clampDurationToSpec(target.duration + source.duration, durationSpec),
    characters: [...new Set([...target.characters, ...source.characters])],
    dialogue: [target.dialogue, source.dialogue].filter(Boolean).join('\n'),
    props: [...new Set([...(target.props || []), ...(source.props || [])])],
    media: mergedMedia,
  };
}

export interface StoryboardShotMutationsDeps {
  shots: Shot[];
  shotsRef: React.MutableRefObject<Shot[]>;
  shotMetas: ShotMeta[];
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  saveAllShots: (updatedShots: Shot[]) => void;
  itvDurationSpec: VideoDurationSpec;
  generatingImagePrompts: Set<string>;
  generatingVideoPrompts: Set<string>;
  message: {
    success: (c: string) => void;
    warning: (c: string) => void;
    error: (c: string) => void;
    info: (c: string) => void;
  };
}

export function useStoryboardShotMutations(deps: StoryboardShotMutationsDeps) {
  const {
    shots, shotsRef, shotMetas, characters, scenes, props,
    saveAllShots, itvDurationSpec,
    generatingImagePrompts, generatingVideoPrompts,
    message,
  } = deps;

  const assets = useMemo(() => ({ characters, scenes, props }), [characters, scenes, props]);
  const { syncFromPrompt, handleAssetChange } = useShotAssetSync(assets);

  /** 单分镜内字幕行变更（编辑 / 添加 / 删除 / 同分镜内排序 / 任意位置插入） */
  const handleScriptLinesChange = useCallback((shotId: string, lines: ShotScriptLine[]) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, scriptLines: lines } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  /**
   * 字幕行块拖拽落点处理（同分镜 + 跨分镜）。
   * 拖拽源 / 落点 id 编码为 `${shotId}::${lineId}`；解析归属后做相应数组操作。
   */
  const handleScriptLineDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === overKey) return;
    const [srcShotId, srcLineId] = activeKey.split('::');
    const [dstShotId, dstLineId] = overKey.split('::');
    if (!srcShotId || !srcLineId || !dstShotId || !dstLineId) return;

    if (srcShotId === dstShotId) {
      const next = shots.map(shot => {
        if (shot.id !== srcShotId) return shot;
        const fromIdx = (shot.scriptLines || []).findIndex(l => l.id === srcLineId);
        const toIdx = (shot.scriptLines || []).findIndex(l => l.id === dstLineId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return shot;
        const list = [...(shot.scriptLines || [])];
        const [moved] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, moved);
        return { ...shot, scriptLines: list };
      });
      saveAllShots(next);
      return;
    }

    // 跨分镜：从源镜删除，插到目标镜的目标位置
    const src = shots.find(s => s.id === srcShotId);
    const dst = shots.find(s => s.id === dstShotId);
    if (!src || !dst) return;
    const movedLine = (src.scriptLines || []).find(l => l.id === srcLineId);
    if (!movedLine) return;
    const newSrcLines = (src.scriptLines || []).filter(l => l.id !== srcLineId);
    const dstInsertIdx = (dst.scriptLines || []).findIndex(l => l.id === dstLineId);
    const dstLines = [...(dst.scriptLines || [])];
    if (dstInsertIdx < 0) {
      dstLines.push(movedLine);
    } else {
      dstLines.splice(dstInsertIdx, 0, movedLine);
    }
    const next = shots.map(shot => {
      if (shot.id === srcShotId) return { ...shot, scriptLines: newSrcLines };
      if (shot.id === dstShotId) return { ...shot, scriptLines: dstLines };
      return shot;
    });
    saveAllShots(next);
  }, [shots, saveAllShots]);

  /** 分镜时长变更（按当前 ITV 渠道时长规格吸附） */
  const handleDurationChange = useCallback((shotId: string, duration: number) => {
    const safeDuration = clampDurationToSpec(duration, itvDurationSpec);
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, duration: safeDuration } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, itvDurationSpec]);

  /**
   * 提示词变更时的资产同步策略（图片 / 视频同构）：
   * 1. 批量生成期间跳过同步（generating* 守卫，避免旧闭包覆盖批量结果）
   * 2. 仅当提示词包含 @mentions 时才更新资产绑定（避免空解析覆盖已有数据）
   */
  const runPromptChange = useCallback((kind: 'image' | 'video', shotId: string, prompt: string) => {
    const generating = kind === 'image' ? generatingImagePrompts : generatingVideoPrompts;
    if (generating.has(shotId)) return;

    const currentShots = shotsRef.current;
    const shot = currentShots.find(s => s.id === shotId);
    if (!shot) return;

    const syncState = syncFromPrompt(prompt);
    const hasMentions = syncState.mentionedAssets.length > 0;
    const promptField = kind === 'image' ? 'imagePrompt' : 'videoPrompt';

    const updatedShots = currentShots.map(s =>
      s.id === shotId ? {
        ...s,
        [promptField]: prompt,
        ...(hasMentions ? {
          characters: syncState.selectedCharacters,
          scenes: syncState.selectedScenes,
          props: syncState.selectedProps,
        } : {}),
      } : s
    );
    saveAllShots(updatedShots);
  }, [saveAllShots, syncFromPrompt, generatingImagePrompts, generatingVideoPrompts, shotsRef]);

  const handleImagePromptChange = useCallback(
    (shotId: string, imagePrompt: string) => runPromptChange('image', shotId, imagePrompt),
    [runPromptChange],
  );
  const handleVideoPromptChange = useCallback(
    (shotId: string, videoPrompt: string) => runPromptChange('video', shotId, videoPrompt),
    [runPromptChange],
  );

  /** 资产变更（角色/场景/道具同构）——同时更新图片与视频提示词中的 @mentions */
  const runAssetChange = useCallback((kind: 'character' | 'scene' | 'prop', shotId: string, ids: string[]) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    const field = kind === 'character' ? 'characters' : kind === 'scene' ? 'scenes' : 'props';
    const newImagePrompt = handleAssetChange(kind, ids, shot.imagePrompt || '', assets);
    const newVideoPrompt = handleAssetChange(kind, ids, shot.videoPrompt || '', assets);
    const updatedShots = shots.map(s =>
      s.id === shotId ? {
        ...s,
        [field]: ids,
        imagePrompt: newImagePrompt,
        videoPrompt: newVideoPrompt,
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, handleAssetChange, assets]);

  const handleCharactersChange = useCallback(
    (shotId: string, characterIds: string[]) => runAssetChange('character', shotId, characterIds),
    [runAssetChange],
  );
  const handleScenesChange = useCallback(
    (shotId: string, sceneIds: string[]) => runAssetChange('scene', shotId, sceneIds),
    [runAssetChange],
  );
  const handlePropsChange = useCallback(
    (shotId: string, propIds: string[]) => runAssetChange('prop', shotId, propIds),
    [runAssetChange],
  );

  /** 参考图变更 */
  const handleReferenceImagesChange = useCallback((shotId: string, referenceImages: StoredMediaAsset[], selectedReferenceIndex: number) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? {
        ...s,
        media: {
          ...(s.media || {}),
          references: referenceImages,
          selectedReferenceIndex,
        },
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  /** 多图片变更 */
  const handleImagesChange = useCallback((shotId: string, images: StoredMediaAsset[], currentImageIndex: number) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? {
        ...s,
        media: {
          ...(s.media || {}),
          images,
          currentImageIndex,
        },
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  /** 多视频变更（同步推导 currentVersion） */
  const handleVideosChange = useCallback((shotId: string, videos: StoredMediaAsset[], currentVideoIndex: number) => {
    const selectedVersion = findVersionNumberForVideoAsset(
      shotMetas.find(meta => meta.id === shotId),
      videos[currentVideoIndex],
    );
    const updatedShots = shots.map(s =>
      s.id === shotId ? {
        ...s,
        currentVersion: selectedVersion ?? s.currentVersion,
        media: {
          ...(s.media || {}),
          videos,
          currentVideoIndex,
        },
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, shotMetas]);

  /** 合并：direction='up' 与上一镜合并（当前镜被吸收）；'down' 与下一镜合并 */
  const runMerge = useCallback(async (shotId: string, direction: 'up' | 'down') => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0) return;
    const targetIdx = direction === 'up' ? index - 1 : index;
    const sourceIdx = direction === 'up' ? index : index + 1;
    if (targetIdx < 0 || sourceIdx >= shots.length) return;
    const merged = mergeShots(shots[targetIdx], shots[sourceIdx], itvDurationSpec);
    const updatedShots = shots.filter((_, i) => i !== sourceIdx).map((s, i) =>
      i === targetIdx ? merged : s
    );
    await saveAllShots(updatedShots);
    message.success(direction === 'up' ? '分镜已向上合并' : '分镜已向下合并');
  }, [shots, saveAllShots, itvDurationSpec, message]);

  const handleMergeUp = useCallback((shotId: string) => runMerge(shotId, 'up'), [runMerge]);
  const handleMergeDown = useCallback((shotId: string) => runMerge(shotId, 'down'), [runMerge]);

  /** 移动：direction='up' 上移一位；'down' 下移一位 */
  const runMove = useCallback(async (shotId: string, direction: 'up' | 'down') => {
    const index = shots.findIndex(s => s.id === shotId);
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || swapIdx < 0 || swapIdx >= shots.length) return;
    const updatedShots = [...shots];
    [updatedShots[index], updatedShots[swapIdx]] = [updatedShots[swapIdx], updatedShots[index]];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  const handleMoveUp = useCallback((shotId: string) => runMove(shotId, 'up'), [runMove]);
  const handleMoveDown = useCallback((shotId: string) => runMove(shotId, 'down'), [runMove]);

  /** 新建空白分镜 */
  const createNewShot = useCallback((): Shot => ({
    id: uuidv4(),
    scriptLines: [],
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 10,
    imagePrompt: '',
    imageMode: 'normal',
    characters: [],
    dialogue: '',
    emotion: '',
  }), []);

  const handleAddShot = useCallback(async () => {
    const newShot = createNewShot();
    const updatedShots = [...shots, newShot];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots, createNewShot]);

  /** 在指定位置插入空白分镜 */
  const runInsert = useCallback(async (shotId: string, position: 'above' | 'below') => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0) return;
    const newShot = createNewShot();
    const insertIdx = position === 'above' ? index : index + 1;
    const updatedShots = [...shots.slice(0, insertIdx), newShot, ...shots.slice(insertIdx)];
    await saveAllShots(updatedShots);
  }, [shots, saveAllShots, createNewShot]);

  const handleInsertAbove = useCallback((shotId: string) => runInsert(shotId, 'above'), [runInsert]);
  const handleInsertBelow = useCallback((shotId: string) => runInsert(shotId, 'below'), [runInsert]);

  /**
   * 图片模式切换的核心规则（单镜与批量共用）：
   * 模式变了就要清掉旧模板的产物（imagePrompt / videoPrompt / images），强制重推；
   * 多面板（grid/storyboard）+ first-frame 是非法组合，videoMode 自动修回 multi-ref。
   */
  const applyImageModeToShot = useCallback((s: Shot, mode: EditableShotImageMode): Shot => {
    const oldMode = normalizeShotImageMode(s.imageMode);
    const modeChanged = oldMode !== mode;
    const correctedVideoMode = (isMultiPanelImageMode(mode) && s.videoMode === 'first-frame')
      ? 'multi-ref' as const
      : s.videoMode;
    if (!modeChanged) {
      return { ...s, imageMode: mode, videoMode: correctedVideoMode };
    }
    return {
      ...s,
      imageMode: mode,
      videoMode: correctedVideoMode,
      imagePrompt: '',
      videoPrompt: '',
      media: {
        ...(s.media || {}),
        images: [],
        currentImageIndex: 0,
        gridImage: undefined,
      },
    };
  }, []);

  const handleShotImageModeChange = useCallback((shotId: string, mode: EditableShotImageMode) => {
    const updatedShots = shots.map(s => (s.id === shotId ? applyImageModeToShot(s, mode) : s));
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, applyImageModeToShot]);

  /** 批量切换图片模式（逐镜应用与单镜同套规则） */
  const handleBulkImageModeChange = useCallback((mode: EditableShotImageMode) => {
    if (!shots.length) return;
    const updatedShots = shots.map(s => applyImageModeToShot(s, mode));
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, applyImageModeToShot]);

  const handleStoryboardInheritPreviousChange = useCallback((shotId: string, enabled: boolean) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, inheritPreviousStoryboard: enabled } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  const handleShotVideoModeChange = useCallback((shotId: string, mode: 'multi-ref' | 'first-frame') => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, videoMode: mode } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  /** 批量切换视频模式 */
  const handleBulkVideoModeChange = useCallback((mode: 'multi-ref' | 'first-frame') => {
    if (!shots.length) return;
    const updatedShots = shots.map(s => ({ ...s, videoMode: mode }));
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  /** 批量统一分镜时长（秒）：影响后续视频渲染时长与剪辑入轨，总时长统计即时反映 */
  const handleBulkDurationChange = useCallback((duration: number) => {
    const seconds = Math.max(1, Math.min(600, Math.round(duration) || 3));
    if (!shots.length) return;
    const updatedShots = shots.map(s => ({ ...s, duration: seconds }));
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  return {
    handleScriptLinesChange,
    handleScriptLineDragEnd,
    handleDurationChange,
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
    createNewShot,
    handleAddShot,
    handleInsertAbove,
    handleInsertBelow,
    handleShotImageModeChange,
    handleBulkImageModeChange,
    handleStoryboardInheritPreviousChange,
    handleShotVideoModeChange,
    handleBulkVideoModeChange,
    handleBulkDurationChange,
  };
}
