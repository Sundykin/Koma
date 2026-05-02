import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Button,
  Space,
  Segmented,
  Select,
  Typography,
  Input,
  Modal,
  Form,
  Spin,
  Empty,
  App,
} from 'antd';
import {
  PlusOutlined,
  LoadingOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { Shot, Character, Scene, Prop, AppSettings, StoredMediaAsset, ProjectStyleSnapshot } from '../../types';
import { loadEpisodeShots, saveEpisodeShots, loadCharacters, loadScenes, loadProps, loadEpisodeAnalysis } from '../../store/projectStore';
import { generateShotImage, batchGenerateShotImages } from '../../services/ShotGenerationService';
import { shotRenderWorkflow, batchRenderShots } from '../../workflow/shotRenderWorkflow';
import { runWithTask } from '../../services/taskRunner';
import { startShotAnalysis } from '../../services/ShotAnalysisService';
import type { PresetAssets } from '../../services/ShotAnalysisService';
import { generateShotPrompt, batchGenerateShotPrompts } from '../../services/ShotPromptService';
import { TaskManager } from '../../services/TaskManager';
import { ScriptEditor } from '../../editor';
import type { MentionItem } from '../../editor';
import { StoryboardStudio } from './StoryboardStudio';
import { ShotListEditor } from './ShotListEditor';
import { ShotAssetPresetModal } from './ShotAssetPresetModal';
import { useShotAssetSync } from '../../hooks/useShotAssetSync';
import { createLogger } from '../../store/logger';
import { loadSettings } from '../../store/globalStore';
import {
  collectShotVideoPlan,
  resolveShotVideoCapabilitySupport,
} from '../../workflow/shotVideoPlan';
import { resolveConfiguredChannelModel } from '../../providers/channel/resolver';
import {
  clampDurationToSpec,
  getDurationSpecForModel,
  getDurationSpecForProviderType,
  specToInputBounds,
  type VideoDurationSpec,
} from '../../providers/itv/durationSpec';
import './Storyboard.css';
import './ShotListEditor.css';
import { getMediaAssetDisplaySource } from '../../types';

const logger = createLogger('Storyboard');

const { Text } = Typography;
const { TextArea } = Input;

const SHOT_TYPE_OPTIONS = [
  { label: 'CU', value: 'close-up' },
  { label: 'MED', value: 'medium' },
  { label: 'WIDE', value: 'wide' },
  { label: 'X-WIDE', value: 'extreme-wide' },
];

const CAMERA_OPTIONS = [
  { label: '固定镜头', value: 'static' },
  { label: '水平摇镜', value: 'pan' },
  { label: '跟随镜头', value: 'tracking' },
  { label: '缓慢推镜', value: 'zoom-in' },
  { label: '手持晃动', value: 'handheld' },
];

// 合并两个分镜（duration 按当前 ITV 渠道 spec 吸附；不再硬编码到 grok 枚举）
function mergeShots(target: Shot, source: Shot, durationSpec: VideoDurationSpec): Shot {
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
    scriptContent: [target.scriptContent, source.scriptContent].filter(Boolean).join('\n'),
    imagePrompt: [target.imagePrompt, source.imagePrompt].filter(Boolean).join('\n\n'),
    duration: clampDurationToSpec(target.duration + source.duration, durationSpec),
    characters: [...new Set([...target.characters, ...source.characters])],
    dialogue: [target.dialogue, source.dialogue].filter(Boolean).join('\n'),
    props: [...new Set([...(target.props || []), ...(source.props || [])])],
    media: mergedMedia,
  };
}

// ============ 主组件 ============
interface StoryboardProps {
  projectId: string;
  episodeId?: string;
  episodeName?: string;
  script?: string;
  aspectRatio?: '16:9' | '9:16';
  llmSelection?: string;
  ttiSelection?: string;
  itvSelection?: string;
  ttsSelection?: string;
  settings: AppSettings;
  styleSnapshot?: ProjectStyleSnapshot;
  mentionItems?: MentionItem[];
  onConfirmedShotsToTimeline?: (shots: Shot[]) => void;
}

export const Storyboard: React.FC<StoryboardProps> = ({
  projectId,
  episodeId,
  episodeName,
  script,
  aspectRatio,
  llmSelection,
  ttiSelection,
  itvSelection,
  ttsSelection,
  settings,
  styleSnapshot,
  mentionItems = [],
  onConfirmedShotsToTimeline: _onConfirmedShotsToTimeline,
}) => {
  const { message } = App.useApp();
  const [effectiveSettings, setEffectiveSettings] = useState<AppSettings>(settings);
  const [shots, setShots] = useState<Shot[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingShots, setGeneratingShots] = useState<Set<string>>(new Set());
  // 状态拆分：图片/视频提示词独立追踪
  const [generatingImagePrompts, setGeneratingImagePrompts] = useState<Set<string>>(new Set());
  const [generatingVideoPrompts, setGeneratingVideoPrompts] = useState<Set<string>>(new Set());
  const [renderingShots, setRenderingShots] = useState<Set<string>>(new Set());
  // 单镜头视频生成进度（按 shotId 聚合，避免多镜头并跑时进度被覆盖）
  const [shotVideoProgress, setShotVideoProgress] = useState<Map<string, { progress: number; step: string }>>(new Map());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; step?: string } | undefined>();
  const queuedShotsSaveRef = useRef<{ projectId: string; episodeId: string; shots: Shot[] } | null>(null);
  const activeShotsSaveRef = useRef<Promise<void> | null>(null);

  // 预选资产弹窗
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [_presetAssets, setPresetAssets] = useState<PresetAssets | null>(null);

  // 编辑弹窗
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingShot, setEditingShot] = useState<Shot | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Shot>>({});

  // 舞台区激活的分镜
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const projectStylePrompt = useMemo(
    () => styleSnapshot?.ttiStylePrefix?.trim() || '',
    [styleSnapshot]
  );

  useEffect(() => {
    setEffectiveSettings(settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    const syncLatestSettings = async () => {
      try {
        const latest = await loadSettings();
        if (!cancelled) {
          setEffectiveSettings(latest);
        }
      } catch (error) {
        logger.warn('读取最新全局设置失败，继续使用当前快照', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void syncLatestSettings();
    window.addEventListener('focus', syncLatestSettings);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', syncLatestSettings);
    };
  }, []);

  // 获取当前激活的分镜对象
  const _activeShot = useMemo(() =>
    shots.find(s => s.id === activeShotId) || null
  , [shots, activeShotId]);

  // 实际使用的 mentionItems
  // 允许在编辑器中 @ 引用所有资产（角色/场景/道具）。
  // 注意：@mention 的 ID 与 useShotAssetSync 的解析规则保持一致（支持内部 ID 与 Sora2 ID）。
  const actualMentionItems: MentionItem[] = useMemo(() => {
    if (mentionItems.length > 0) return mentionItems;
    const items: MentionItem[] = [];

    // 角色：收口使用项目内 ID（在提示词层不混入 Provider 私有 ID）
    characters.forEach(char => {
      items.push({
        id: char.id,
        type: 'char' as const,
        name: char.name,
        description: char.prompt,
        previewImage: getMediaAssetDisplaySource(char.media?.costumePhoto),
      });
    });

    // 场景不需要 Sora2 绑定，保持使用自定义 ID
    scenes.forEach(scene => {
      items.push({
        id: scene.id,
        type: 'scene' as const,
        name: scene.name,
        description: scene.prompt,
        previewImage: getMediaAssetDisplaySource(scene.media?.previewImage),
      });
    });

    // 道具：收口使用项目内 ID
    props.forEach(prop => {
      items.push({
        id: prop.id,
        type: 'prop' as const,
        name: prop.name,
        description: prop.prompt,
        previewImage: getMediaAssetDisplaySource(prop.media?.previewImage),
      });
    });

    return items;
  }, [mentionItems, characters, scenes, props]);

  useEffect(() => {
    logger.info('Storyboard mentionItems ready', {
      characters: characters.length,
      scenes: scenes.length,
      props: props.length,
      mentionItems: actualMentionItems.length,
    });
  }, [characters.length, scenes.length, props.length, actualMentionItems.length]);

  // 当前选中 ITV 模型的能力矩阵；用于告诉 collectShotVideoPlan 能否走参考生视频，
  // 避免没有真主图时被迫降级到图生视频。
  const selectedItvModelCapabilities = useMemo(() => {
    const ctx = resolveConfiguredChannelModel(effectiveSettings, 'itv', itvSelection);
    return ctx?.model.capabilities;
  }, [effectiveSettings, itvSelection]);

  // 当前 ITV 渠道的时长规格：决定分镜编辑控件是 Select（grok 枚举）还是 InputNumber（即梦范围）
  // 优先按 modelId 命中（Koma 内置即梦渠道复用 grok runtime 但模型是 seedance-*）
  const itvDurationSpec = useMemo(() => {
    const ctx = resolveConfiguredChannelModel(effectiveSettings, 'itv', itvSelection);
    return (
      getDurationSpecForModel(ctx?.model.id)
      ?? getDurationSpecForProviderType(ctx?.channelConfig.providerType)
    );
  }, [effectiveSettings, itvSelection]);

  const shotVideoSupportMap = useMemo(() => {
    return new Map(shots.map(shot => {
      const plan = collectShotVideoPlan({
        shot,
        characters,
        scenes,
        props,
        modelCapabilities: selectedItvModelCapabilities,
      });
      const support = resolveShotVideoCapabilitySupport({
        settings: effectiveSettings,
        selectionKey: itvSelection,
        capability: plan.capability,
        visualInputCount: plan.visualReferenceInputs.length,
      });
      return [shot.id, support] as const;
    }));
  }, [shots, characters, scenes, props, effectiveSettings, itvSelection, selectedItvModelCapabilities]);

  const buildUnsupportedShotVideoMessage = useCallback((targetShots: Shot[]) => {
    const unsupported = targetShots
      .map(shot => ({
        shot,
        support: shotVideoSupportMap.get(shot.id),
        index: shots.findIndex(item => item.id === shot.id) + 1,
      }))
      .filter(item => item.support?.disabledReason);

    if (unsupported.length === 0) {
      return undefined;
    }

    const sample = unsupported
      .slice(0, 3)
      .map(item => `#${item.index} ${item.support?.capabilityLabel}`)
      .join('、');
    const suffix = unsupported.length > 3 ? ' 等分镜' : '';

    return `${unsupported[0].support?.disabledReason}。受影响分镜：${sample}${suffix}`;
  }, [shotVideoSupportMap, shots]);

  // 加载数据
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

      // 根据剧集分析结果筛选资产
      let filteredCharacters = loadedCharacters;
      let filteredScenes = loadedScenes;
      let filteredProps = loadedProps;

      if (episodeAnalysis) {
        // 构建 refs 集合：从 episodeAnalysis.xxxRefs + shots 中的资产 ID 合并
        const charRefs = new Set(episodeAnalysis.characterRefs || []);
        const sceneRefs = new Set(episodeAnalysis.sceneRefs || []);
        const propRefs = new Set(episodeAnalysis.propRefs || []);

        // 补充：从 shots 中提取所有引用的资产 ID（兜底 refs 为空的情况）
        for (const shot of loadedShots) {
          for (const id of shot.characters || []) { if (id) charRefs.add(id); }
          for (const id of shot.scenes || []) { if (id) sceneRefs.add(id); }
          for (const id of shot.props || []) { if (id) propRefs.add(id); }
        }

        // 仅在有 refs 时过滤，否则保留全部资产
        if (charRefs.size > 0) {
          filteredCharacters = loadedCharacters.filter(c => charRefs.has(c.id));
        }
        if (sceneRefs.size > 0) {
          filteredScenes = loadedScenes.filter(s => sceneRefs.has(s.id));
        }
        if (propRefs.size > 0) {
          filteredProps = loadedProps.filter(p => propRefs.has(p.id));
        }
      }

      // 一刀切：移除旧数据迁移/修复逻辑。分镜资产绑定与提示词 @mention 统一使用项目内 ID。
      // duration 按当前 ITV 渠道 spec 吸附（grok 枚举 / seedance 范围），不再固定 grok
      setShots(loadedShots.map(shot => ({ ...shot, duration: clampDurationToSpec(shot.duration, itvDurationSpec) })));
      setCharacters(filteredCharacters);
      setScenes(filteredScenes);
      setProps(filteredProps);

    } catch (err) {
      logger.error('加载失败', err);
      message.error('加载分镜数据失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, episodeId, itvDurationSpec]);

  const refreshShotsFromStore = useCallback(async () => {
    if (!projectId || !episodeId) {
      return;
    }
    const latestShots = await loadEpisodeShots(projectId, episodeId);
    setShots(latestShots.map(shot => ({ ...shot, duration: clampDurationToSpec(shot.duration, itvDurationSpec) })));
  }, [projectId, episodeId, itvDurationSpec]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 监听分析任务完成事件（媒体任务已收口到 taskQueueStore，不再走 TaskManager）
  useEffect(() => {
    const unsubscribe = TaskManager.addListener(async (task) => {
      if (task.projectId !== projectId) return;
      if (task.type === 'shot-analysis') {
        if (task.status === 'completed') {
          message.success(`AI 分镜生成完成，共 ${task.result?.shotsCount || 0} 个分镜`);
          setIsAnalyzing(false);
          loadData();
        } else if (task.status === 'failed') {
          logger.error('AI 分镜生成失败', task.error);
          message.error('AI 分镜生成失败，请检查 LLM 配置后重试');
          setIsAnalyzing(false);
        }
      }
    });
    return () => unsubscribe();
  }, [projectId, episodeId, loadData]);

  const flushQueuedShotSaves = useCallback((): Promise<void> => {
    if (activeShotsSaveRef.current) {
      return activeShotsSaveRef.current;
    }

    const task = (async () => {
      while (queuedShotsSaveRef.current) {
        const snapshot = queuedShotsSaveRef.current;
        queuedShotsSaveRef.current = null;
        await saveEpisodeShots(snapshot.projectId, snapshot.episodeId, snapshot.shots);
      }
    })();

    activeShotsSaveRef.current = task
      .catch((error: unknown) => {
        logger.error('保存分镜失败', error);
        message.error('保存失败');
      })
      .finally(() => {
        activeShotsSaveRef.current = null;
        if (queuedShotsSaveRef.current) {
          void flushQueuedShotSaves();
        }
      });

    return activeShotsSaveRef.current;
  }, [message]);

  // 保存分镜数据
  const saveAllShots = useCallback((updatedShots: Shot[]) => {
    if (!episodeId) {
      message.warning('未选择剧集，无法保存分镜');
      return Promise.resolve();
    }

    const normalizedShots = updatedShots.map(shot => ({
      ...shot,
      duration: clampDurationToSpec(shot.duration, itvDurationSpec),
    }));

    // 先本地更新，避免输入法组合输入被异步持久化回写打断。
    setShots(normalizedShots);
    queuedShotsSaveRef.current = {
      projectId,
      episodeId,
      shots: normalizedShots,
    };

    return flushQueuedShotSaves();
  }, [projectId, episodeId, message, flushQueuedShotSaves, itvDurationSpec]);

  // ============ 回调函数 ============

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
      const shot = shots.find(s => s.id === shotId);
      if (!shot) {
        throw new Error('分镜不存在');
      }
      const asset = await generateShotImage(projectId, episodeId, shotId, characters, scenes, ttiSelection, {
        aspectRatio,
        styleSnapshot,
      });
      message.success('分镜图片生成完成');
      setShots(prev => prev.map(s => {
        if (s.id !== shotId) return s;
        const existing = s.media?.images || [];
        return {
          ...s,
          media: {
            ...(s.media || {}),
            images: [...existing, asset],
            currentImageIndex: existing.length,
          },
        };
      }));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '启动生成失败');
    } finally {
      setGeneratingShots(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, characters, scenes, ttiSelection, aspectRatio, styleSnapshot]);

  // 渲染视频
  const handleRenderShotVideo = useCallback(async (shotId: string) => {
    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;
    const support = shotVideoSupportMap.get(shotId);
    if (support?.disabledReason) {
      message.error(support.disabledReason);
      return;
    }
    setRenderingShots(prev => new Set(prev).add(shotId));
    setShotVideoProgress(prev => {
      const next = new Map(prev);
      next.set(shotId, { progress: 0, step: '准备渲染...' });
      return next;
    });
    try {
      const { result } = await runWithTask({
        projectId,
        category: 'analysis',
        subType: 'shot-generation',
        targetType: 'shot',
        targetId: shotId,
        targetName: `分镜 #${shotId.slice(-6)} 视频生成`,
        type: 'shot-generation',
        execute: async (taskCtx) => shotRenderWorkflow(
          {
            projectId,
            episodeId,
            shot,
            settings: effectiveSettings,
            aspectRatio,
            mediaSelections: {
              ttiSelection,
              itvSelection,
              ttsSelection,
            },
            styleSnapshot,
          },
          (progress, step) => {
            setShotVideoProgress(prev => {
              const next = new Map(prev);
              next.set(shotId, { progress, step: step || '' });
              return next;
            });
            taskCtx.progress(progress, step);
          }
        ),
      });
      if (result.success && result.version) {
        await refreshShotsFromStore();
        message.success('分镜渲染完成');
      } else {
        message.error(result.error || '渲染失败');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '渲染失败');
    } finally {
      setRenderingShots(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
      setShotVideoProgress(prev => {
        const next = new Map(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, shotVideoSupportMap, effectiveSettings, ttiSelection, itvSelection, ttsSelection, aspectRatio, styleSnapshot, message, refreshShotsFromStore]);

  // 剧本内容变更
  const handleScriptChange = useCallback((shotId: string, scriptContent: string) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, scriptContent } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 分镜时长变更
  const handleDurationChange = useCallback((shotId: string, duration: number) => {
    const safeDuration = clampDurationToSpec(duration, itvDurationSpec);
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, duration: safeDuration } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, itvDurationSpec]);

  // 资产同步 Hook
  const assets = useMemo(() => ({ characters, scenes, props }), [characters, scenes, props]);
  const { syncFromPrompt, handleAssetChange } = useShotAssetSync(assets);

  // 提示词变更时的资产同步策略：
  // 1. 批量生成期间跳过同步（generatingImagePrompts 守卫）
  // 2. 仅当提示词包含 @mentions 时才更新资产绑定（hasMentions 守卫）
  // 3. ScriptEditor 外部 value 同步时不触发 onChange（isSyncingExternalRef）
  const handleImagePromptChange = useCallback((shotId: string, imagePrompt: string) => {
    // 批量生成期间，ScriptEditor 的 value 同步会触发 onChange，
    // 但此时 shots 闭包可能是旧状态，直接跳过避免覆盖批量生成的正确数据
    if (generatingImagePrompts.has(shotId)) return;

    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    // 解析提示词中的 @mentions，同步到资产选择
    const syncState = syncFromPrompt(imagePrompt);

    // 仅当提示词中确实包含 @mentions 时才更新资产绑定，避免空解析结果覆盖已有数据
    const hasMentions = syncState.mentionedAssets.length > 0;

    const updatedShots = shots.map(s =>
      s.id === shotId ? {
        ...s,
        imagePrompt,
        ...(hasMentions ? {
          characters: syncState.selectedCharacters,
          scenes: syncState.selectedScenes,
          props: syncState.selectedProps,
        } : {}),
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, syncFromPrompt, generatingImagePrompts]);

  // 视频提示词变更时的资产同步策略（同 handleImagePromptChange）：
  // 1. 批量生成期间跳过同步（generatingVideoPrompts 守卫）
  // 2. 仅当提示词包含 @mentions 时才更新资产绑定（hasMentions 守卫）
  // 3. ScriptEditor 外部 value 同步时不触发 onChange（isSyncingExternalRef）
  const handleVideoPromptChange = useCallback((shotId: string, videoPrompt: string) => {
    // 批量生成期间跳过，同 handleImagePromptChange
    if (generatingVideoPrompts.has(shotId)) return;

    const shot = shots.find(s => s.id === shotId);
    if (!shot) return;

    // 解析提示词中的 @mentions，同步到资产选择
    const syncState = syncFromPrompt(videoPrompt);

    // 仅当提示词中确实包含 @mentions 时才更新资产绑定，避免空解析结果覆盖已有数据
    const hasMentions = syncState.mentionedAssets.length > 0;

    const updatedShots = shots.map(s =>
      s.id === shotId ? {
        ...s,
        videoPrompt,
        ...(hasMentions ? {
          characters: syncState.selectedCharacters,
          scenes: syncState.selectedScenes,
          props: syncState.selectedProps,
        } : {}),
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots, syncFromPrompt, generatingVideoPrompts]);

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

  // 多视频变更
  const handleVideosChange = useCallback((shotId: string, videos: StoredMediaAsset[], currentVideoIndex: number) => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? {
        ...s,
        media: {
          ...(s.media || {}),
          videos,
          currentVideoIndex,
        },
      } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  // 向上合并
  const handleMergeUp = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index <= 0) return;
    const target = shots[index - 1];
    const source = shots[index];
    const merged = mergeShots(target, source, itvDurationSpec);
    const updatedShots = shots.filter((_, i) => i !== index).map((s, i) =>
      i === index - 1 ? merged : s
    );
    await saveAllShots(updatedShots);
    message.success('分镜已向上合并');
  }, [shots, saveAllShots, itvDurationSpec]);

  // 向下合并
  const handleMergeDown = useCallback(async (shotId: string) => {
    const index = shots.findIndex(s => s.id === shotId);
    if (index < 0 || index >= shots.length - 1) return;
    const target = shots[index];
    const source = shots[index + 1];
    const merged = mergeShots(target, source, itvDurationSpec);
    const updatedShots = shots.filter((_, i) => i !== index + 1).map((s, i) =>
      i === index ? merged : s
    );
    await saveAllShots(updatedShots);
    message.success('分镜已向下合并');
  }, [shots, saveAllShots, itvDurationSpec]);

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
        projectStylePrompt,
        llmSelection,
        { image: true, video: false },  // 只生成图片提示词
        undefined,
        styleSnapshot
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '生成失败');
    } finally {
      setGeneratingImagePrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmSelection, projectStylePrompt, styleSnapshot]);

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
        projectStylePrompt,
        llmSelection,
        { image: false, video: true },  // 只生成视频提示词
        undefined,
        styleSnapshot
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '生成失败');
    } finally {
      setGeneratingVideoPrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmSelection, projectStylePrompt, styleSnapshot]);

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
        projectStylePrompt,
        llmSelection,
        { image: true, video: false },
        { force: true },  // 强制重新生成
        styleSnapshot
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '优化失败');
    } finally {
      setGeneratingImagePrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmSelection, projectStylePrompt, styleSnapshot]);

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
        projectStylePrompt,
        llmSelection,
        { image: false, video: true },
        { force: true },  // 强制重新生成
        styleSnapshot
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '优化失败');
    } finally {
      setGeneratingVideoPrompts(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [projectId, episodeId, shots, llmSelection, projectStylePrompt, styleSnapshot]);

  // 批量生成图片提示词（跳过已有图片提示词的）
  const handleBatchGenerateImagePrompts = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithoutPrompt = baseShots.filter(s => !s.imagePrompt?.trim());
    if (shotsWithoutPrompt.length === 0) {
      message.info('所选分镜都已有图片提示词');
      return;
    }
    const shotIds = shotsWithoutPrompt.map(s => s.id);
    setGeneratingImagePrompts(new Set(shotIds));
    setBatchProgress({ current: 0, total: shotsWithoutPrompt.length, step: '准备生成...' });
    try {
      const results = await batchGenerateShotPrompts(
        projectId,
        episodeId,
        shotsWithoutPrompt,
        projectStylePrompt,
        (current, total, result) => {
          setBatchProgress({ current, total, step: `生成中 ${current}/${total}` });
          if (result.success) {
            setShots(prev => prev.map(s => s.id === result.shotId ? {
              ...s,
              imagePrompt: result.imagePrompt,
            } : s));
          }
        },
        llmSelection,
        styleSnapshot,
        { image: true, video: false }
      );
      const successCount = results.filter(r => r.success).length;
      if (successCount === 0 && results.length > 0) {
        const firstError = results.find(r => r.error)?.error;
        message.error(`图片提示词生成全部失败${firstError ? `: ${firstError}` : ''}`);
      } else {
        message.success(`图片提示词生成完成: ${successCount}/${results.length} 成功`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '批量生成失败');
    } finally {
      setGeneratingImagePrompts(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, shots, llmSelection, projectStylePrompt, styleSnapshot]);

  // 批量重新生成图片提示词
  const handleBatchReGenerateImagePrompts = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithPrompt = baseShots.filter(s => s.imagePrompt?.trim());
    if (shotsWithPrompt.length === 0) {
      message.info('所选分镜都没有图片提示词');
      return;
    }
    const shotIds = shotsWithPrompt.map(s => s.id);
    setGeneratingImagePrompts(new Set(shotIds));
    setBatchProgress({ current: 0, total: shotsWithPrompt.length, step: '准备重新生成...' });
    try {
      const results = await batchGenerateShotPrompts(
        projectId,
        episodeId,
        shotsWithPrompt,
        projectStylePrompt,
        (current, total, result) => {
          setBatchProgress({ current, total, step: `重新生成中 ${current}/${total}` });
          if (result.success) {
            setShots(prev => prev.map(s => s.id === result.shotId ? {
              ...s,
              imagePrompt: result.imagePrompt,
            } : s));
          }
        },
        llmSelection,
        styleSnapshot,
        { image: true, video: false },
        { force: true }
      );
      const successCount = results.filter(r => r.success).length;
      if (successCount === 0 && results.length > 0) {
        const firstError = results.find(r => r.error)?.error;
        message.error(`图片提示词重新生成全部失败${firstError ? `: ${firstError}` : ''}`);
      } else {
        message.success(`图片提示词重新生成完成: ${successCount}/${results.length} 成功`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '批量重新生成失败');
    } finally {
      setGeneratingImagePrompts(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, shots, llmSelection, projectStylePrompt, styleSnapshot]);

  // 批量生成视频提示词（跳过已有视频提示词的）
  const handleBatchGenerateVideoPrompts = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithoutPrompt = baseShots.filter(s => !s.videoPrompt?.trim());
    if (shotsWithoutPrompt.length === 0) {
      message.info('所选分镜都已有视频提示词');
      return;
    }
    const shotIds = shotsWithoutPrompt.map(s => s.id);
    setGeneratingVideoPrompts(new Set(shotIds));
    setBatchProgress({ current: 0, total: shotsWithoutPrompt.length, step: '准备生成...' });
    try {
      const results = await batchGenerateShotPrompts(
        projectId,
        episodeId,
        shotsWithoutPrompt,
        projectStylePrompt,
        (current, total, result) => {
          setBatchProgress({ current, total, step: `生成中 ${current}/${total}` });
          if (result.success) {
            setShots(prev => prev.map(s => s.id === result.shotId ? {
              ...s,
              videoPrompt: result.videoPrompt,
            } : s));
          }
        },
        llmSelection,
        styleSnapshot,
        { image: false, video: true }
      );
      const successCount = results.filter(r => r.success).length;
      if (successCount === 0 && results.length > 0) {
        const firstError = results.find(r => r.error)?.error;
        message.error(`视频提示词生成全部失败${firstError ? `: ${firstError}` : ''}`);
      } else {
        message.success(`视频提示词生成完成: ${successCount}/${results.length} 成功`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '批量生成失败');
    } finally {
      setGeneratingVideoPrompts(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, shots, llmSelection, projectStylePrompt, styleSnapshot]);

  // 批量重新生成视频提示词
  const handleBatchReGenerateVideoPrompts = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithPrompt = baseShots.filter(s => s.videoPrompt?.trim());
    if (shotsWithPrompt.length === 0) {
      message.info('所选分镜都没有视频提示词');
      return;
    }
    const shotIds = shotsWithPrompt.map(s => s.id);
    setGeneratingVideoPrompts(new Set(shotIds));
    setBatchProgress({ current: 0, total: shotsWithPrompt.length, step: '准备重新生成...' });
    try {
      const results = await batchGenerateShotPrompts(
        projectId,
        episodeId,
        shotsWithPrompt,
        projectStylePrompt,
        (current, total, result) => {
          setBatchProgress({ current, total, step: `重新生成中 ${current}/${total}` });
          if (result.success) {
            setShots(prev => prev.map(s => s.id === result.shotId ? {
              ...s,
              videoPrompt: result.videoPrompt,
            } : s));
          }
        },
        llmSelection,
        styleSnapshot,
        { image: false, video: true },
        { force: true }
      );
      const successCount = results.filter(r => r.success).length;
      if (successCount === 0 && results.length > 0) {
        const firstError = results.find(r => r.error)?.error;
        message.error(`视频提示词重新生成全部失败${firstError ? `: ${firstError}` : ''}`);
      } else {
        message.success(`视频提示词重新生成完成: ${successCount}/${results.length} 成功`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '批量重新生成失败');
    } finally {
      setGeneratingVideoPrompts(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, shots, llmSelection, projectStylePrompt, styleSnapshot]);

  // 创建新分镜
  const createNewShot = useCallback((): Shot => ({
    id: uuidv4(),
    scriptContent: '',
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 10,
    imagePrompt: '',
    imageMode: 'normal',
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

  const handleShotImageModeChange = useCallback((shotId: string, mode: 'normal' | 'grid') => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, imageMode: mode } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  const handleShotVideoModeChange = useCallback((shotId: string, mode: 'multi-ref' | 'first-frame') => {
    const updatedShots = shots.map(s =>
      s.id === shotId ? { ...s, videoMode: mode } : s
    );
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

  /** 批量切换：把当前剧集所有分镜的 videoMode 改为同一值 */
  const handleBulkVideoModeChange = useCallback((mode: 'multi-ref' | 'first-frame') => {
    if (!shots.length) return;
    const updatedShots = shots.map(s => ({ ...s, videoMode: mode }));
    saveAllShots(updatedShots);
  }, [shots, saveAllShots]);

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

  // 打开预选资产弹窗
  const _handleOpenPresetModal = useCallback(() => {
    if (!episodeId || !script) {
      message.warning('缺少剧集信息或剧本内容');
      return;
    }
    setPresetModalOpen(true);
  }, [episodeId, script, message]);

  // 预选资产确认后执行 AI 分镜生成
  const handlePresetConfirm = useCallback(async (assets: PresetAssets) => {
    setPresetModalOpen(false);
    setPresetAssets(assets);
    setIsAnalyzing(true);
    try {
      await startShotAnalysis(
        projectId,
        episodeId!,
        episodeName || `剧集 ${episodeId}`,
        script!,
        llmSelection,
        assets,  // 传递预选资产
        styleSnapshot
      );
      message.info('AI 分镜生成任务已启动，可在状态栏查看进度');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '启动生成失败');
      setIsAnalyzing(false);
    }
  }, [projectId, episodeId, episodeName, script, llmSelection, message, styleSnapshot]);

  const handleGenerateAIShots = useCallback(async () => {
    if (!episodeId || !script) {
      logger.warn('AI 生成被拒：缺少必要参数', {
        hasEpisodeId: !!episodeId,
        hasScript: !!script,
      });
      message.warning('缺少剧集信息或剧本内容');
      return;
    }
    // 检查是否有已绑定 Sora2 的资产，如有则打开预选对话框
    const hasBoundCharacters = characters.some(c => c.sora2CharacterId);
    const hasBoundProps = props.some(p => p.sora2PropId);
    logger.info('点击 AI 智能生成分镜', {
      projectId,
      episodeId,
      episodeName,
      scriptLength: script.length,
      llmSelection,
      charactersCount: characters.length,
      propsCount: props.length,
      hasBoundCharacters,
      hasBoundProps,
      branch: hasBoundCharacters || hasBoundProps ? 'preset-modal' : 'direct',
    });
    if (hasBoundCharacters || hasBoundProps) {
      setPresetModalOpen(true);
    } else {
      // 无已绑定资产，直接生成
      setIsAnalyzing(true);
      try {
        await startShotAnalysis(projectId, episodeId, episodeName || `剧集 ${episodeId}`, script, llmSelection, undefined, styleSnapshot);
        message.info('AI 分镜生成任务已启动，可在状态栏查看进度');
      } catch (err: any) {
        logger.error('启动 AI 分镜生成失败', err);
        message.error(err.message || '启动生成失败');
        setIsAnalyzing(false);
      }
    }
  }, [projectId, episodeId, episodeName, script, llmSelection, characters, props, message, styleSnapshot]);

  const handleSaveEdit = useCallback(async () => {
    if (!editFormData.scriptContent?.trim()) {
      message.warning('请输入剧本内容');
      return;
    }
    if (!editFormData.imagePrompt?.trim()) {
      message.warning('请输入画面描述');
      return;
    }
    const updatedShot: Shot = {
      ...editingShot!,
      ...editFormData,
      duration: clampDurationToSpec(editFormData.duration ?? editingShot?.duration, itvDurationSpec),
    } as Shot;
    const isNew = !shots.find(s => s.id === editingShot!.id);
    let updatedShots: Shot[];
    if (isNew) {
      updatedShots = [...shots, updatedShot];
      message.success('分镜已添加');
    } else {
      updatedShots = shots.map(s => s.id === updatedShot.id ? updatedShot : s);
      message.success('分镜已更新');
    }
    await saveAllShots(updatedShots);
    setEditModalOpen(false);
    setEditingShot(null);
    setEditFormData({});
  }, [editFormData, editingShot, shots, saveAllShots, itvDurationSpec]);

  // 批量生成图片（跳过已有图片的）
  const handleBatchGenerate = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithoutImage = baseShots.filter(s => (s.media?.images?.length || 0) === 0);
    if (shotsWithoutImage.length === 0) {
      message.info('所选分镜都已有图片');
      return;
    }
    const shotIds = shotsWithoutImage.map(s => s.id);
    setGeneratingShots(new Set(shotIds));
    try {
      const indexMap = new Map(shotIds.map((id, idx) => [id, idx]));
      setBatchProgress({ current: 0, total: shotIds.length, step: '准备生成...' });
      const results = await batchGenerateShotImages(projectId, episodeId, shotIds, characters, scenes, ttiSelection, {
        aspectRatio,
        styleSnapshot,
        onProgress: (_overall, current) => {
          const idx = (indexMap.get(current.shotId) ?? 0) + 1;
          setBatchProgress({
            current: idx,
            total: shotIds.length,
            step: current.step ? `分镜 ${current.shotId}: ${current.step}` : `分镜 ${current.shotId}`,
          });
        },
      });

      // 回写 UI 状态（shots state），避免依赖 TaskManager 监听
      setShots(prev => prev.map(s => {
        const hit = results.find(r => r.shotId === s.id && r.success && r.asset);
        if (!hit?.asset) return s;
        const existing = s.media?.images || [];
        return {
          ...s,
          media: {
            ...(s.media || {}),
            images: [...existing, hit.asset],
            currentImageIndex: existing.length,
          },
        };
      }));

      const successCount = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success);
      if (failed.length === 0) {
        message.success(`批量生成完成：成功 ${successCount}/${results.length}`);
      } else {
        message.warning(`批量生成完成：成功 ${successCount}/${results.length}，失败 ${failed.length}`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '批量生成失败');
    } finally {
      setGeneratingShots(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, shots, characters, scenes, ttiSelection, aspectRatio, styleSnapshot]);

  // 批量重新生成图片（强制重新生成已有图片的）
  const handleBatchReGenerateImages = useCallback(async (targetShotIds?: string[]) => {
    if (!episodeId) {
      message.warning('未选择剧集');
      return;
    }
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithImage = baseShots.filter(s => (s.media?.images?.length || 0) > 0);
    if (shotsWithImage.length === 0) {
      message.info('所选分镜都没有图片');
      return;
    }
    const shotIds = shotsWithImage.map(s => s.id);
    setGeneratingShots(new Set(shotIds));
    try {
      const indexMap = new Map(shotIds.map((id, idx) => [id, idx]));
      setBatchProgress({ current: 0, total: shotIds.length, step: '准备生成...' });
      const results = await batchGenerateShotImages(projectId, episodeId, shotIds, characters, scenes, ttiSelection, {
        aspectRatio,
        styleSnapshot,
        onProgress: (_overall, current) => {
          const idx = (indexMap.get(current.shotId) ?? 0) + 1;
          setBatchProgress({
            current: idx,
            total: shotIds.length,
            step: current.step ? `分镜 ${current.shotId}: ${current.step}` : `分镜 ${current.shotId}`,
          });
        },
      });

      setShots(prev => prev.map(s => {
        const hit = results.find(r => r.shotId === s.id && r.success && r.asset);
        if (!hit?.asset) return s;
        const existing = s.media?.images || [];
        return {
          ...s,
          media: {
            ...(s.media || {}),
            images: [...existing, hit.asset],
            currentImageIndex: existing.length,
          },
        };
      }));

      const successCount = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success);
      if (failed.length === 0) {
        message.success(`批量重新生成完成：成功 ${successCount}/${results.length}`);
      } else {
        message.warning(`批量重新生成完成：成功 ${successCount}/${results.length}，失败 ${failed.length}`);
      }
    } catch (err: any) {
      message.error(err.message || '批量重新生成失败');
    } finally {
      setGeneratingShots(new Set());
      setBatchProgress(undefined);
    }
  }, [projectId, episodeId, shots, characters, scenes, ttiSelection, aspectRatio, styleSnapshot]);

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
    const unsupportedMessage = buildUnsupportedShotVideoMessage(confirmedToRender);
    if (unsupportedMessage) {
      message.error(unsupportedMessage);
      return;
    }
    const shotIds = confirmedToRender.map(s => s.id);
    setRenderingShots(new Set(shotIds));
    setRenderProgress(0);
    setRenderStep('准备批量渲染...');
    try {
      const { result } = await runWithTask({
        projectId,
        category: 'analysis',
        subType: 'shot-generation',
        targetType: 'episode',
        targetId: episodeId,
        targetName: `批量视频渲染（${confirmedToRender.length} 个分镜）`,
        type: 'shot-generation',
        metadata: { shotCount: confirmedToRender.length },
        execute: async (taskCtx) => batchRenderShots(
          {
            projectId,
            episodeId,
            shots: confirmedToRender,
            settings: effectiveSettings,
            aspectRatio,
            mediaSelections: {
              ttiSelection,
              itvSelection,
              ttsSelection,
            },
            styleSnapshot,
          },
          (overall, current) => {
            setRenderProgress(overall);
            setRenderStep(`${current.step || ''} (${current.shotId})`);
            taskCtx.progress(overall, `${current.shotId.slice(-6)}: ${current.step || ''}`);
          }
        ),
      });
      await refreshShotsFromStore();
      message.success(`批量渲染完成: ${result.success} 成功, ${result.failed} 失败`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '批量渲染失败');
    } finally {
      setRenderingShots(new Set());
      setRenderProgress(0);
      setRenderStep('');
    }
  }, [projectId, episodeId, shots, effectiveSettings, ttiSelection, itvSelection, ttsSelection, aspectRatio, styleSnapshot, buildUnsupportedShotVideoMessage, message, refreshShotsFromStore]);

  // 批量重新生成视频（已有视频的）
  const handleBatchReGenerateVideos = useCallback(async (targetShotIds?: string[]) => {
    const baseShots = targetShotIds
      ? shots.filter(s => targetShotIds.includes(s.id))
      : shots;
    const shotsWithVideo = baseShots.filter(s => (s.media?.videos?.length || 0) > 0);
    if (shotsWithVideo.length === 0) {
      message.info('所选分镜都没有视频');
      return;
    }
    const unsupportedMessage = buildUnsupportedShotVideoMessage(shotsWithVideo);
    if (unsupportedMessage) {
      message.error(unsupportedMessage);
      return;
    }
    const shotIds = shotsWithVideo.map(s => s.id);
    setRenderingShots(new Set(shotIds));
    setRenderProgress(0);
    setRenderStep('准备批量重新渲染...');
    try {
      const { result } = await runWithTask({
        projectId,
        category: 'analysis',
        subType: 'shot-generation',
        targetType: 'episode',
        targetId: episodeId,
        targetName: `批量重新渲染视频（${shotsWithVideo.length} 个分镜）`,
        type: 'shot-generation',
        metadata: { shotCount: shotsWithVideo.length, regenerate: true },
        execute: async (taskCtx) => batchRenderShots(
          {
            projectId,
            episodeId,
            shots: shotsWithVideo,
            settings: effectiveSettings,
            aspectRatio,
            mediaSelections: {
              ttiSelection,
              itvSelection,
              ttsSelection,
            },
            styleSnapshot,
          },
          (overall, current) => {
            setRenderProgress(overall);
            setRenderStep(`${current.step || ''} (${current.shotId})`);
            taskCtx.progress(overall, `${current.shotId.slice(-6)}: ${current.step || ''}`);
          }
        ),
      });
      await refreshShotsFromStore();
      message.success(`批量重新渲染完成: ${result.success} 成功, ${result.failed} 失败`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '批量重新渲染失败');
    } finally {
      setRenderingShots(new Set());
      setRenderProgress(0);
      setRenderStep('');
    }
  }, [projectId, episodeId, shots, effectiveSettings, ttiSelection, itvSelection, ttsSelection, aspectRatio, styleSnapshot, buildUnsupportedShotVideoMessage, message, refreshShotsFromStore]);

  // ============ 渲染 ============

  if (loading) {
    return (
      <div className="storyboardContainer w-500" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" description="加载分镜数据...">
        </Spin>
      </div>
    );
  }

  return (
    <div className="storyboardContainer">
      {shots.length === 0 ? (
        <div className="storyboardEmpty">
          <Empty
            description={isAnalyzing ? "AI 正在生成分镜..." : "暂无分镜数据"}
            style={{ margin: '100px auto' }}
          >
            {isAnalyzing ? (
              <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
            ) : (
              <Space direction="vertical" size="middle">
                {script && episodeId && (
                  <Button
                    type="primary"
                    size="large"
                    icon={<RobotOutlined />}
                    onClick={handleGenerateAIShots}
                  >
                    AI 智能生成分镜
                  </Button>
                )}
                <Button icon={<PlusOutlined />} onClick={handleAddShot}>
                  手动添加分镜
                </Button>
                {!script && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    提示：需要先在剧本步骤输入内容才能使用 AI 生成
                  </Text>
                )}
              </Space>
            )}
          </Empty>
        </div>
      ) : (
        <StoryboardStudio>
          <ShotListEditor
            projectId={projectId}
            shots={shots}
            characters={characters}
            scenes={scenes}
            props={props}
            mentionItems={actualMentionItems}
            generatingImagePrompts={generatingImagePrompts}
            generatingVideoPrompts={generatingVideoPrompts}
            generatingImages={generatingShots}
            generatingVideos={renderingShots}
            videoProgressMap={shotVideoProgress}
            batchProgress={batchProgress}
            activeShotId={activeShotId}
            onActiveShotChange={setActiveShotId}
            onScriptChange={handleScriptChange}
            onImagePromptChange={handleImagePromptChange}
            onVideoPromptChange={handleVideoPromptChange}
            onDurationChange={handleDurationChange}
            onCharactersChange={handleCharactersChange}
            onScenesChange={handleScenesChange}
            onPropsChange={handlePropsChange}
            onReferenceImagesChange={handleReferenceImagesChange}
            onImagesChange={handleImagesChange}
            onVideosChange={handleVideosChange}
            onGenerateImagePrompt={handleGenerateImagePrompt}
            onGenerateVideoPrompt={handleGenerateVideoPrompt}
            onOptimizeImagePrompt={handleOptimizeImagePrompt}
            onOptimizeVideoPrompt={handleOptimizeVideoPrompt}
            onBatchGenerateImagePrompts={handleBatchGenerateImagePrompts}
            onBatchReGenerateImagePrompts={handleBatchReGenerateImagePrompts}
            onBatchGenerateVideoPrompts={handleBatchGenerateVideoPrompts}
            onBatchReGenerateVideoPrompts={handleBatchReGenerateVideoPrompts}
            onGenerateImage={handleGenerateShotImage}
            onBatchGenerateImages={handleBatchGenerate}
            onBatchReGenerateImages={handleBatchReGenerateImages}
            onGenerateVideo={handleRenderShotVideo}
            onBatchGenerateVideos={handleBatchRenderVideos}
            onBatchReGenerateVideos={handleBatchReGenerateVideos}
            getVideoCapabilityLabel={(shotId) => shotVideoSupportMap.get(shotId)?.capabilityLabel}
            getVideoGenerateDisabledReason={(shotId) => shotVideoSupportMap.get(shotId)?.disabledReason}
            onToggleConfirm={handleToggleConfirm}
            onDelete={handleDeleteShot}
            onBatchDelete={handleBatchDelete}
            onBatchConfirm={handleBatchConfirm}
            onMergeUp={handleMergeUp}
            onMergeDown={handleMergeDown}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onAddShot={handleAddShot}
            onInsertAbove={handleInsertAbove}
            onInsertBelow={handleInsertBelow}
            onShotImageModeChange={handleShotImageModeChange}
            onShotVideoModeChange={handleShotVideoModeChange}
            onBulkVideoModeChange={handleBulkVideoModeChange}
            durationSpec={itvDurationSpec}
          />
        </StoryboardStudio>
      )}

      {/* 编辑/添加分镜弹窗 */}
      <Modal
        title={editingShot && shots.find(s => s.id === editingShot.id) ? '编辑分镜' : '添加分镜'}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); setEditingShot(null); setEditFormData({}); }}
        onOk={handleSaveEdit}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form layout="vertical">
          <Form.Item label="剧本内容" required>
            <TextArea
              rows={3}
              placeholder="对应剧本中的内容..."
              value={editFormData.scriptContent || ''}
              onChange={(e) => setEditFormData(prev => ({ ...prev, scriptContent: e.target.value }))}
            />
          </Form.Item>

          <Form.Item label="画面描述 (Prompt)" required>
            <ScriptEditor
              value={editFormData.imagePrompt || ''}
              onChange={(value) => setEditFormData(prev => ({ ...prev, imagePrompt: value }))}
              placeholder="描述这个镜头的画面，可使用 @ 引用角色或道具"
              mentionItems={actualMentionItems}
              minHeight="120px"
              maxHeight="200px"
              showLineNumbers={false}
              darkTheme={true}
            />
          </Form.Item>

          <Space size="large" style={{ width: '100%' }}>
            <Form.Item label="景别" style={{ marginBottom: 0 }}>
              <Segmented
                options={SHOT_TYPE_OPTIONS}
                value={editFormData.shotType || 'medium'}
                onChange={(value) => setEditFormData(prev => ({ ...prev, shotType: value as Shot['shotType'] }))}
              />
            </Form.Item>

            <Form.Item label="运镜" style={{ marginBottom: 0 }}>
              <Select
                options={CAMERA_OPTIONS}
                value={editFormData.cameraMovement || 'static'}
                onChange={(value) => setEditFormData(prev => ({ ...prev, cameraMovement: value }))}
                style={{ width: 160 }}
              />
            </Form.Item>

            <Form.Item label="时长（秒）" style={{ marginBottom: 0 }}>
              <Input
                type="number"
                min={specToInputBounds(itvDurationSpec).min}
                max={specToInputBounds(itvDurationSpec).max}
                step={specToInputBounds(itvDurationSpec).step}
                value={editFormData.duration ?? itvDurationSpec.default}
                onChange={(e) => setEditFormData(prev => ({
                  ...prev,
                  duration: clampDurationToSpec(e.target.value, itvDurationSpec),
                }))}
                style={{ width: 80 }}
              />
            </Form.Item>
          </Space>

          <Form.Item label="情绪氛围" style={{ marginTop: 16 }}>
            <Input
              placeholder="如：紧张、欢快、悲伤..."
              value={editFormData.emotion || ''}
              onChange={(e) => setEditFormData(prev => ({ ...prev, emotion: e.target.value }))}
            />
          </Form.Item>

          <Form.Item label="台词">
            <TextArea
              rows={2}
              placeholder="角色台词（如有）"
              value={editFormData.dialogue || ''}
              onChange={(e) => setEditFormData(prev => ({ ...prev, dialogue: e.target.value }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 预选资产弹窗 */}
      <ShotAssetPresetModal
        open={presetModalOpen}
        characters={characters}
        props={props}
        onConfirm={handlePresetConfirm}
        onCancel={() => setPresetModalOpen(false)}
      />
    </div>
  );
};
