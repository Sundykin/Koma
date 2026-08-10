import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import type { Shot, Character, Scene, Prop, AppSettings, ProjectStyleSnapshot, ShotMeta } from '../../types';
import { useStoryboardMediaGeneration } from './hooks/useStoryboardMediaGeneration';
import { submitShotAnalysisTask } from '../../services/analysisTaskClient';
import type { PresetAssets } from '../../services/ShotAnalysisService';
import { useStoryboardPrompts } from './hooks/useStoryboardPrompts';
import { loadVoiceLibrary } from '../../services/voiceLibrary/voiceLibraryService';
import { useStoryboardAudio } from './hooks/useStoryboardAudio';
import { useStoryboardShotMutations } from './hooks/useStoryboardShotMutations';
import { useStoryboardPersistence } from './hooks/useStoryboardPersistence';
import { useStoryboardTaskSubscriptions } from './hooks/useStoryboardTaskSubscriptions';
import type { VoiceLibrarySnapshot } from '../../types/voice-library';
import { useTasks } from '../../hooks';
import { ScriptEditor } from '../../editor';
import type { MentionItem } from '../../editor';
import { useTheme } from '../../theme/runtime';
import { StoryboardStudio } from './StoryboardStudio';
import { ShotListEditor } from './ShotListEditor';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { ShotAssetPresetModal } from './ShotAssetPresetModal';
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
} from '../../providers/itv/durationSpec';
import { getModelMaxReferenceImages } from '../../providers/itv/modelCatalog';
import './Storyboard.scss';
import './ShotListEditor.scss';
import { getMediaAssetDisplaySource, scriptLinesFromText, getShotScriptText, createScriptLine } from '../../types';
import { parseShotScriptParagraph, serializeShotScriptParagraph } from '../../services/dramaScript';

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


function getShotImageCount(shot: Shot): number {
  return shot.media?.images?.length || 0;
}

function getShotVideoCount(shot: Shot): number {
  return shot.media?.videos?.length || 0;
}


// ============ 主组件 ============
interface StoryboardProps {
  projectId: string;
  episodeId?: string;
  episodeName?: string;
  script?: string;
  /** 叙事模式：剧情模式（drama）在分镜字幕列显示旁白/台词标记与说话人；解说模式（narration）保持纯字幕 */
  narrativeMode?: 'drama' | 'narration';
  aspectRatio?: '16:9' | '9:16';
  llmSelection?: string;
  ttiSelection?: string;
  itvSelection?: string;
  ttsSelection?: string;
  /** 项目级 TTS 音色（覆盖 channel.defaultVoice，留空走 channel 默认） */
  ttsVoiceId?: string;
  /** 项目级 TTS 语速倍数（默认 1.2） */
  ttsSpeed?: number;
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
  narrativeMode,
  aspectRatio,
  llmSelection,
  ttiSelection,
  itvSelection,
  ttsSelection,
  ttsVoiceId,
  ttsSpeed,
  settings,
  styleSnapshot,
  mentionItems = [],
  onConfirmedShotsToTimeline: _onConfirmedShotsToTimeline,
}) => {
  const { message } = App.useApp();
  const { theme } = useTheme();
  const isDarkTheme = theme.meta.mode === 'dark';
  const [effectiveSettings, setEffectiveSettings] = useState<AppSettings>(settings);
  const [shots, setShots] = useState<Shot[]>([]);
  const shotsRef = useRef<Shot[]>([]);
  const [shotMetas, setShotMetas] = useState<ShotMeta[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  // 全局音色库快照（builtin + custom），出配音前编译 @voice / @char-音色 时用。
  // 启动加载一次，与音色库 UI 共享同源；用户在设置里改音色库不会自动重拉，
  // 当前迭代认为足够（出配音时如果发现 mention 解析失败会显式提示）。
  const [voiceLibrary, setVoiceLibrary] = useState<VoiceLibrarySnapshot>({ categories: [], profiles: [] });
  const [loading, setLoading] = useState(true);
  // 本地"提交中"短暂兜底集合：点击到主进程任务真正落库 (~50-100ms IPC roundtrip)
  // 之间，UI 立即显示 loading；任务进 DB 后由下面 useTasks 派生的集合接管。
  // 切走再回来时，DB 派生的集合还在 → UI 自动恢复；本地 Set 丢失也不影响。
  // 批量场景下 (runWithTask 只创一个 episode-level 父任务) 仍主要靠本地 Set 体现 per-shot loading。
  const [submittingShots, setSubmittingShots] = useState<Set<string>>(new Set());
  const [submittingImagePrompts, setSubmittingImagePrompts] = useState<Set<string>>(new Set());
  const [submittingVideoPrompts, setSubmittingVideoPrompts] = useState<Set<string>>(new Set());
  const [submittingRenderShots, setSubmittingRenderShots] = useState<Set<string>>(new Set());

  // 从主进程任务表派生 active 集合（pending/running/processing），切回页面时自动恢复
  const projectActiveTasks = useTasks({
    scope: `project:${projectId}`,
    activeOnly: true,
  });
  // 批量任务的 task 是 episode-level（targetKind='episode'），对应的"本批次哪些分镜在跑"
  // 通过 metadata.shotIds 暴露；切走再回来时，per-shot loading 指示从这里恢复。
  // 第二个 predicate 可基于 metadata 进一步筛（比如 batchKind 区分图片/视频批量）。
  const collectBatchShotIds = useCallback(
    (
      matchType: (taskType: string) => boolean,
      matchMeta?: (meta: Record<string, unknown>) => boolean,
    ): Set<string> => {
      const set = new Set<string>();
      for (const t of projectActiveTasks) {
        if (!matchType(t.type)) continue;
        if (t.targetKind !== 'episode' || t.targetId !== episodeId) continue;
        const meta = (t.payload?.metadata || {}) as Record<string, unknown>;
        if (matchMeta && !matchMeta(meta)) continue;
        const shotIds = meta.shotIds;
        if (!Array.isArray(shotIds)) continue;
        for (const id of shotIds) {
          if (typeof id === 'string' && id) set.add(id);
        }
      }
      return set;
    },
    [projectActiveTasks, episodeId],
  );

  const activeImagePromptShots = useMemo(() => {
    const set = new Set<string>();
    for (const t of projectActiveTasks) {
      if ((t.type === 'prompt-generation:image' || t.type === 'prompt-optimization:image')
          && t.targetKind === 'shot' && t.targetId) {
        set.add(t.targetId);
      }
    }
    // 批量提示词任务在 episode-level，shotIds 装着本批次目标
    for (const id of collectBatchShotIds(
      (type) => type === 'prompt-generation:image' || type === 'prompt-optimization:image',
    )) {
      set.add(id);
    }
    return set;
  }, [projectActiveTasks, collectBatchShotIds]);
  const activeVideoPromptShots = useMemo(() => {
    const set = new Set<string>();
    for (const t of projectActiveTasks) {
      if ((t.type === 'prompt-generation:video' || t.type === 'prompt-optimization:video')
          && t.targetKind === 'shot' && t.targetId) {
        set.add(t.targetId);
      }
    }
    for (const id of collectBatchShotIds(
      (type) => type === 'prompt-generation:video' || type === 'prompt-optimization:video',
    )) {
      set.add(id);
    }
    return set;
  }, [projectActiveTasks, collectBatchShotIds]);
  const activeImageGenShots = useMemo(() => {
    const set = new Set<string>();
    for (const t of projectActiveTasks) {
      if (t.type === 'tti' && t.targetKind === 'shot' && t.targetId) set.add(t.targetId);
    }
    // 批量图片生成 task type='shot-generation'，批量视频共用同一 type，需用 metadata.batchKind 区分
    for (const id of collectBatchShotIds(
      (type) => type === 'shot-generation',
      (meta) => meta.batchKind === 'image',
    )) {
      set.add(id);
    }
    return set;
  }, [projectActiveTasks, collectBatchShotIds]);
  const activeVideoGenShots = useMemo(() => {
    const set = new Set<string>();
    for (const t of projectActiveTasks) {
      if (t.type === 'itv' && t.targetKind === 'shot' && t.targetId) set.add(t.targetId);
    }
    for (const id of collectBatchShotIds(
      (type) => type === 'shot-generation',
      (meta) => meta.batchKind === 'video',
    )) {
      set.add(id);
    }
    return set;
  }, [projectActiveTasks, collectBatchShotIds]);

  // 切走再回来后，本地 batchProgress 状态丢失。用 episode-level 批量任务的 progress
  // 字段做兜底，让用户至少能看到"批量任务还在跑、当前进度多少"。
  const derivedBatchProgress = useMemo(() => {
    const PARENT_TYPES = new Set([
      'shot-generation',
      'prompt-generation:image', 'prompt-generation:video',
      'prompt-optimization:image', 'prompt-optimization:video',
    ]);
    const batchTask = projectActiveTasks.find(
      t => PARENT_TYPES.has(t.type) && t.targetKind === 'episode' && t.targetId === episodeId,
    );
    if (!batchTask) return undefined;
    const meta = (batchTask.payload?.metadata || {}) as { shotCount?: number; lastMessage?: string };
    const total = typeof meta.shotCount === 'number' ? meta.shotCount : 0;
    if (!total) return undefined;
    // runWithTask 把 progress 映射到 [0, 90]；映射回 [0, 100] 后按总数估算 current。
    const restoredPercent = Math.min(100, Math.round((batchTask.progress / 90) * 100));
    const current = Math.max(0, Math.min(total, Math.round((restoredPercent / 100) * total)));
    return {
      current,
      total,
      step: meta.lastMessage,
    } as { current: number; total: number; step?: string };
  }, [projectActiveTasks, episodeId]);

  // 实际给 UI 用的合并集合：DB 派生 + 本地短暂兜底
  const generatingShots = useMemo(
    () => new Set<string>([...submittingShots, ...activeImageGenShots]),
    [submittingShots, activeImageGenShots],
  );
  const generatingImagePrompts = useMemo(
    () => new Set<string>([...submittingImagePrompts, ...activeImagePromptShots]),
    [submittingImagePrompts, activeImagePromptShots],
  );
  const generatingVideoPrompts = useMemo(
    () => new Set<string>([...submittingVideoPrompts, ...activeVideoPromptShots]),
    [submittingVideoPrompts, activeVideoPromptShots],
  );
  const renderingShots = useMemo(
    () => new Set<string>([...submittingRenderShots, ...activeVideoGenShots]),
    [submittingRenderShots, activeVideoGenShots],
  );
  // 单镜头视频生成进度（按 shotId 聚合，避免多镜头并跑时进度被覆盖）
  const [shotVideoProgress, setShotVideoProgress] = useState<Map<string, { progress: number; step: string }>>(new Map());
  // 点击到任务真正落库之间的短暂"提交中"窗口；任务创建后由 activeAnalysisTask 接管
  const [isSubmittingAnalysis, setIsSubmittingAnalysis] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; step?: string } | undefined>();

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

  // 当前 ITV 模型的引用图配额上限；bundle builder 按此裁剪，避免 grok2 / seedance
  // 上游 multipart 限额被触发。
  const selectedItvModelMaxRefs = useMemo(() => {
    const ctx = resolveConfiguredChannelModel(effectiveSettings, 'itv', itvSelection);
    return getModelMaxReferenceImages(ctx?.model, ctx?.channelConfig.providerType);
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
        modelMaxRefs: selectedItvModelMaxRefs,
      });
      const support = resolveShotVideoCapabilitySupport({
        settings: effectiveSettings,
        selectionKey: itvSelection,
        capability: plan.capability,
        visualInputCount: plan.visualReferenceInputs.length,
      });
      return [shot.id, support] as const;
    }));
  }, [shots, characters, scenes, props, effectiveSettings, itvSelection, selectedItvModelCapabilities, selectedItvModelMaxRefs]);

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
  // 启动时拉一次全局音色库快照（builtin + custom 合并）
  useEffect(() => {
    let cancelled = false;
    loadVoiceLibrary()
      .then((snap) => { if (!cancelled) setVoiceLibrary(snap); })
      .catch((err) => logger.warn('加载音色库失败', err));
    return () => { cancelled = true; };
  }, []);

  // 数据加载/保存与删除已拆到 hooks/useStoryboardPersistence
  const {
    loadData,
    refreshShotsFromStore,
    queueRefreshShotsFromStore,
    flushQueuedShotSaves,
    saveAllShots,
    handleDeleteShot,
    handleBatchDelete,
  } = useStoryboardPersistence({
    projectId,
    episodeId,
    itvDurationSpec,
    shots,
    shotsRef,
    setShots,
    setShotMetas,
    setCharacters,
    setScenes,
    setProps,
    setLoading,
    message,
  });

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  // 当前剧集的 shot-analysis 任务投影 — 切走再回来 loading 自动复原
  // 任务订阅已拆到 hooks/useStoryboardTaskSubscriptions
  const { isAnalyzing } = useStoryboardTaskSubscriptions({
    projectId,
    episodeId,
    isSubmittingAnalysis,
    setIsSubmittingAnalysis,
    loadData,
    refreshShotsFromStore,
    message,
  });


  // ============ 回调函数 ============

  // dnd-kit 传感器：用 PointerSensor + 5px 激活距离，避免误触发
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // 分镜字段变更逻辑已拆到 hooks/useStoryboardShotMutations
  const {
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
    handleAddShot,
    handleInsertAbove,
    handleInsertBelow,
    handleShotImageModeChange,
    handleBulkImageModeChange,
    handleStoryboardInheritPreviousChange,
    handleShotVideoModeChange,
    handleBulkVideoModeChange,
    handleBulkDurationChange,
    handleBulkCalibrateDurations,
    handleVideoReferenceModeChange,
    handleCapturePreviousTailFrame,
  } = useStoryboardShotMutations({
    projectId,
    episodeId,
    shots,
    shotsRef,
    shotMetas,
    characters,
    scenes,
    props,
    saveAllShots,
    itvDurationSpec,
    generatingImagePrompts,
    generatingVideoPrompts,
    message,
  });

  // 生成图片提示词（首次生成）
  // 提示词生成/优化逻辑已拆到 hooks/useStoryboardPrompts（单镜 + 批量参数化）
  const {
    ensureNoActiveBatch,
    handleGenerateImagePrompt,
    handleGenerateVideoPrompt,
    handleOptimizeImagePrompt,
    handleOptimizeVideoPrompt,
    handleBatchGenerateImagePrompts,
    handleBatchReGenerateImagePrompts,
    handleBatchGenerateVideoPrompts,
    handleBatchReGenerateVideoPrompts,
  } = useStoryboardPrompts({
    projectId,
    episodeId,
    llmSelection,
    projectStylePrompt,
    styleSnapshot,
    shotsRef,
    setShots,
    setSubmittingImagePrompts,
    setSubmittingVideoPrompts,
    setBatchProgress,
    flushQueuedShotSaves,
    message,
  });


  const {
    handleGenerateShotAudio,
    handleBatchGenerateAudios,
    handleBatchReGenerateAudios,
  } = useStoryboardAudio({
    projectId,
    episodeId,
    shots,
    characters,
    voiceLibrary,
    ttsSelection,
    ttsVoiceId,
    ttsSpeed,
    setShots,
    setBatchProgress,
    message,
  });


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
    setIsSubmittingAnalysis(true);
    try {
      const { deduped } = await submitShotAnalysisTask({
        projectId,
        episodeId: episodeId!,
        episodeName: episodeName || `剧集 ${episodeId}`,
        script: script!,
        llmSelection,
        presetAssets: assets,
        styleSnapshot,
      });
      if (deduped) {
        message.info('当前剧集已在后台生成中，请等待完成后再试。');
      } else {
        message.info('AI 分镜生成任务已启动，可在状态栏查看进度');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(errorMessage || '启动生成失败');
      setIsSubmittingAnalysis(false);
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
      setIsSubmittingAnalysis(true);
      try {
        const { deduped } = await submitShotAnalysisTask({
          projectId,
          episodeId,
          episodeName: episodeName || `剧集 ${episodeId}`,
          script,
          llmSelection,
          styleSnapshot,
        });
        if (deduped) {
          message.info('当前剧集已在后台生成中，请等待完成后再试。');
        } else {
          message.info('AI 分镜生成任务已启动，可在状态栏查看进度');
        }
      } catch (err: any) {
        logger.error('启动 AI 分镜生成失败', err);
        message.error(err.message || '启动生成失败');
        setIsSubmittingAnalysis(false);
      }
    }
  }, [projectId, episodeId, episodeName, script, llmSelection, characters, props, message, styleSnapshot]);

  /** 剧情模式编辑弹窗：说话人名字 → characterId（精确 → 包含 → 被包含） */
  const speakerNameById = useMemo(
    () => new Map(characters.map(c => [c.id, c.name])),
    [characters],
  );
  const resolveSpeakerCharacterId = useCallback((speaker?: string): string | undefined => {
    if (!speaker || !characters.length) return undefined;
    const trimmed = speaker.trim();
    const exact = characters.find(c => c.name === trimmed);
    if (exact) return exact.id;
    const contains = characters.find(c => trimmed.includes(c.name));
    if (contains) return contains.id;
    return characters.find(c => c.name.includes(trimmed))?.id;
  }, [characters]);

  const handleSaveEdit = useCallback(async () => {    const isDrama = narrativeMode === 'drama';
    // 剧情模式：编辑文本是整段分镜剧本（含 [旁白]/[台词·角色] 标记），按结构解析保留行类型
    const editScriptText = isDrama
      ? serializeShotScriptParagraph((editFormData as Shot).scriptLines ?? [], speakerNameById)
      : getShotScriptText(editFormData as Shot);
    if (!editScriptText.trim()) {
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
      // 剧情模式 editFormData.scriptLines 已带角色结构，直接用；解说模式按纯文本逐行重建
      scriptLines: isDrama
        ? (editFormData.scriptLines ?? [])
        : scriptLinesFromText(editScriptText),
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
  }, [editFormData, editingShot, shots, saveAllShots, itvDurationSpec, message, narrativeMode, speakerNameById]);

  // 批量生成图片（跳过已有图片的）
  // 单镜/批量媒体生成逻辑已拆到 hooks/useStoryboardMediaGeneration（图片/视频 × 生成/重生成）
  const {
    handleGenerateShotImage,
    handleRenderShotVideo,
    handleBatchGenerate,
    handleBatchReGenerateImages,
    handleBatchRenderVideos,
    handleBatchReGenerateVideos,
  } = useStoryboardMediaGeneration({
    projectId,
    episodeId,
    characters,
    scenes,
    props,
    ttiSelection,
    itvSelection,
    ttsSelection,
    aspectRatio,
    styleSnapshot,
    effectiveSettings,
    shotsRef,
    setShots,
    setSubmittingShots,
    setSubmittingRenderShots,
    setShotVideoProgress,
    setBatchProgress,
    flushQueuedShotSaves,
    queueRefreshShotsFromStore,
    refreshShotsFromStore,
    shotVideoSupportMap,
    buildUnsupportedShotVideoMessage,
    ensureNoActiveBatch,
    getShotImageCount,
    getShotVideoCount,
    message,
  });

  // ============ 串行化连续生成工作流 ============
  // 顺序：判定连续性 →（需要继承时）截取上一镜尾帧 → 生成视频提示词（此时参考表已含
  // @previous_tail_frame，LLM 推理可直接引用）→ 生成视频。
  // 尾帧还兼任主图：本镜没有图片时把尾帧设为本镜锚定图；主图提示词/主图生成保持可选。
  const [continuousFlowRunning, setContinuousFlowRunning] = useState<Set<string>>(new Set());
  const handleRunContinuousFlow = useCallback(async (shotId: string) => {
    const runIndex = shotsRef.current.findIndex(s => s.id === shotId);
    if (runIndex < 0) return;
    setContinuousFlowRunning(prev => new Set(prev).add(shotId));
    try {
      if (runIndex > 0) {
        const shot = shotsRef.current[runIndex];
        const ref = shot.videoReference;
        const wantInherit = ref?.mode === 'manual'
          ? ref.usePreviousTailFrame
          : (ref?.autoUsePreviousTailFrame ?? ref?.usePreviousTailFrame ?? false);
        if (wantInherit && !ref?.referenceFrame) {
          await handleCapturePreviousTailFrame(shotId, false);
        }
        // 尾帧作主图：本镜还没有图片时，把截到的尾帧设为本镜锚定图
        const afterCapture = shotsRef.current[runIndex];
        const frame = afterCapture?.videoReference?.referenceFrame;
        if (frame && !(afterCapture.media?.images?.length)) {
          handleImagesChange(shotId, [frame], 0);
        }
      }
      // 生成视频提示词：有旧词则优化重生成，让 LLM 在含尾帧的参考表上重写
      const latest = shotsRef.current[runIndex];
      if (latest?.videoPrompt?.trim()) {
        await handleOptimizeVideoPrompt(shotId, latest.videoPrompt);
      } else {
        await handleGenerateVideoPrompt(shotId);
      }
      await handleRenderShotVideo(shotId);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '连续生成失败');
    } finally {
      setContinuousFlowRunning(prev => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }, [shotsRef, handleCapturePreviousTailFrame, handleImagesChange, handleGenerateVideoPrompt, handleOptimizeVideoPrompt, handleRenderShotVideo, message]);

  /** 批量连续生成：逐镜串行，每镜都等上一镜出片后再截尾帧/出词/出片 */
  const handleBatchContinuousFlow = useCallback(async (shotIds?: string[]) => {
    const targets = (shotIds?.length ? shotsRef.current.filter(s => shotIds.includes(s.id)) : shotsRef.current);
    if (!targets.length) return;
    setBatchProgress({ current: 0, total: targets.length, step: '连续生成准备中...' });
    let done = 0;
    for (const shot of targets) {
      setBatchProgress({ current: done, total: targets.length, step: `连续生成 ${done + 1}/${targets.length}` });
      try {
        await handleRunContinuousFlow(shot.id);
      } catch { /* 单镜失败不阻断后续（handler 内已提示） */ }
      done += 1;
    }
    setBatchProgress(undefined);
    message.success(`连续生成完成：${targets.length} 镜`);
  }, [shotsRef, handleRunContinuousFlow, setBatchProgress, message]);

  // ============ 渲染 ============

  if (loading) {
    return (
      <div className="storyboardContainer storyboardLoading w-500">
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
            className="storyboardEmptyContent"
          >
            {isAnalyzing ? (
              <Spin indicator={<LoadingOutlined className="storyboardLoadingIcon" spin />} />
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
                  <Text type="secondary" className="storyboardHint">
                    提示：需要先在剧本步骤输入内容才能使用 AI 生成
                  </Text>
                )}
              </Space>
            )}
          </Empty>
        </div>
      ) : (
        <StoryboardStudio>
          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleScriptLineDragEnd}
          >
          <ShotListEditor
            projectId={projectId}
            narrativeMode={narrativeMode}
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
            batchProgress={batchProgress ?? derivedBatchProgress}
            activeShotId={activeShotId}
            onActiveShotChange={setActiveShotId}
            onScriptLinesChange={handleScriptLinesChange}
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
            onGenerateAudio={handleGenerateShotAudio}
            onBatchGenerateAudios={handleBatchGenerateAudios}
            onBatchReGenerateAudios={handleBatchReGenerateAudios}
            getVideoCapabilityLabel={(shotId) => shotVideoSupportMap.get(shotId)?.capabilityLabel}
            getVideoGenerateDisabledReason={(shotId) => shotVideoSupportMap.get(shotId)?.disabledReason}
            onDelete={handleDeleteShot}
            onBatchDelete={handleBatchDelete}
            onMergeUp={handleMergeUp}
            onMergeDown={handleMergeDown}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onAddShot={handleAddShot}
            onInsertAbove={handleInsertAbove}
            onInsertBelow={handleInsertBelow}
            onShotImageModeChange={handleShotImageModeChange}
            onStoryboardInheritPreviousChange={handleStoryboardInheritPreviousChange}
            onVideoReferenceModeChange={handleVideoReferenceModeChange}
            onCapturePreviousTailFrame={handleCapturePreviousTailFrame}
            onRunContinuousFlow={handleRunContinuousFlow}
            continuousFlowRunning={continuousFlowRunning}
            onBatchContinuousFlow={(ids) => void handleBatchContinuousFlow(ids)}
            onShotVideoModeChange={handleShotVideoModeChange}
            onBulkVideoModeChange={handleBulkVideoModeChange}
            onBulkImageModeChange={handleBulkImageModeChange}
            onBulkDurationChange={handleBulkDurationChange}
            onBulkCalibrateDurations={handleBulkCalibrateDurations}
            durationSpec={itvDurationSpec}
          />
          </DndContext>
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
              placeholder={narrativeMode === 'drama'
                ? '分镜剧本：画面/动作/场景直接写；[旁白] 画外音；[台词·角色名] 人物台词'
                : '对应剧本中的内容（每行一句字幕，回车换行）'}
              value={narrativeMode === 'drama'
                ? serializeShotScriptParagraph((editFormData as Shot).scriptLines ?? [], speakerNameById)
                : getShotScriptText(editFormData as Shot)}
              onChange={(e) => {
                const value = e.target.value;
                setEditFormData(prev => ({
                  ...prev,
                  scriptLines: narrativeMode === 'drama'
                    ? parseShotScriptParagraph(value).map(line => createScriptLine(
                        line.text,
                        line.role,
                        line.role === 'dialogue' ? resolveSpeakerCharacterId(line.speaker) : undefined,
                      ))
                    : scriptLinesFromText(value),
                }));
              }}
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
              darkTheme={isDarkTheme}
            />
          </Form.Item>

          <Space size="large" className="storyboardEditControls">
            <Form.Item label="景别" className="storyboardCompactFormItem">
              <Segmented
                options={SHOT_TYPE_OPTIONS}
                value={editFormData.shotType || 'medium'}
                onChange={(value) => setEditFormData(prev => ({ ...prev, shotType: value as Shot['shotType'] }))}
              />
            </Form.Item>

            <Form.Item label="运镜" className="storyboardCompactFormItem">
              <Select
                options={CAMERA_OPTIONS}
                value={editFormData.cameraMovement || 'static'}
                onChange={(value) => setEditFormData(prev => ({ ...prev, cameraMovement: value }))}
                className="storyboardCameraSelect"
              />
            </Form.Item>

            <Form.Item label="时长（秒）" className="storyboardCompactFormItem">
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
                className="storyboardDurationInput"
              />
            </Form.Item>
          </Space>

          <Form.Item label="情绪氛围" className="storyboardEmotionItem">
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
