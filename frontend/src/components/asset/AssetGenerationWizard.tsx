/**
 * 资产生成向导
 * 分步引导生成项目所有资产：角色 → 场景 → 道具 → 预览视频
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  Steps,
  Button,
  Card,
  Flex,
  Progress,
  Typography,
  Space,
  Checkbox,
  Tag,
  Image,
  Spin,
  App,
  Result,
} from 'antd';
import {
  UserOutlined,
  EnvironmentOutlined,
  AppstoreOutlined,
  VideoCameraOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type { Project } from '../../types';
import { loadCharacters, loadScenes, loadProps } from '../../store/projectStore';
import { electronService } from '../../services/electronService';
import { serializeMediaSelection } from '../../providers/channel/resolver';
import {
  generateCostumePhoto,
  generateCharacterPreviewVideo,
} from '../../workflow/characterAssetWorkflow';
import { generateSceneImage, generatePropImage, generatePropPreviewVideo } from '../../workflow/scenePropAssetWorkflow';
import { runWithTask } from '../../services/taskRunner';
import { runBatchWithConcurrency } from '../../utils/batchRunner';
import { useTasks } from '../../hooks';
import {
  getCharacterCostumePhotoSource,
  getCharacterPreviewVideoSource,
  getPropPreviewImageSource,
  getPropPreviewVideoSource,
  getScenePreviewImageSource,
} from '../../utils/mediaSelectors';
import styles from './AssetGenerationWizard.module.scss';

const { Text } = Typography;

interface AssetGenerationWizardProps {
  project: Project;
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

type WizardStep = 'characters' | 'scenes' | 'props' | 'videos' | 'complete';

interface ItemStatus {
  id: string;
  name: string;
  selected: boolean;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  progress: number;
  error?: string;
  imagePath?: string;
  /**
   * 缓存绕过键。同名文件被覆盖（再次抽卡/重试）后 imagePath 不变但内容变了，
   * 浏览器按 URL 缓存仍然显示旧图。每次刷新 imagePath 时同步 bump 这个键，
   * 渲染时拼到 `?t=` 上让 koma-local 协议返回新内容。
   */
  imageCacheKey?: number;
  sourceType?: 'character' | 'prop'; // 视频步骤区分角色/道具
}

/** 写入任务 metadata 的精简结构（不含 selected / sourceType 等仅 UI 关心字段） */
interface ItemMetadataState {
  status: ItemStatus['status'];
  progress: number;
  error?: string;
  imagePath?: string;
  imageCacheKey?: number;
}

function itemsToMetadata(items: ItemStatus[]): Record<string, ItemMetadataState> {
  const map: Record<string, ItemMetadataState> = {};
  for (const it of items) {
    map[it.id] = {
      status: it.status,
      progress: it.progress,
      error: it.error,
      imagePath: it.imagePath,
      imageCacheKey: it.imageCacheKey,
    };
  }
  return map;
}

/** 把 cacheKey 拼到 koma-local URL 末尾。protocol.handle 仅消费 pathname，query 字符串安全忽略。*/
function appendImageCacheBust(url: string, key?: number): string {
  if (!url || !key) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${key}`;
}

const stepConfig = [
  { key: 'characters', title: '角色定妆照', icon: <UserOutlined /> },
  { key: 'scenes', title: '场景预览图', icon: <EnvironmentOutlined /> },
  { key: 'props', title: '道具参考图', icon: <AppstoreOutlined /> },
  // 预览视频步骤暂时隐藏（功能保留，未来恢复时取消注释）
  // { key: 'videos', title: '预览视频', icon: <VideoCameraOutlined /> },
];

export const AssetGenerationWizard: React.FC<AssetGenerationWizardProps> = ({
  project,
  open,
  onClose,
  onComplete,
}) => {
  const { message } = App.useApp();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);

  // ============ 方案 C：单源（任务 metadata） ============
  // 状态分层：
  //  · DB 基线：从角色/场景/道具表加载的初始 items（pending/completed by image existence）
  //  · 用户勾选：本地 Set，独立于持久化（关闭重开会重置——勾选属于 UI 一次性意图）
  //  · 运行时态：完全从 useTasks 派生 — task.metadata.items 是唯一真相源
  //  · 派生：useMemo(baseline + selected + activeTask.metadata.items) → 渲染用 ItemStatus[]
  // worker 只写 metadata，不再 setter 本地 state；UI 自动跟着 useTasks 重渲。

  // DB 基线（loadData 写入；不含 generating/progress 等运行时字段）
  const [baselineCharacters, setBaselineCharacters] = useState<ItemStatus[]>([]);
  const [baselineScenes, setBaselineScenes] = useState<ItemStatus[]>([]);
  const [baselineProps, setBaselineProps] = useState<ItemStatus[]>([]);
  const [baselineVideos, setBaselineVideos] = useState<ItemStatus[]>([]);
  // 用户勾选（独立于 baseline 的 selected 字段；初次 loadData 时按"DB 没图就默认勾选"初始化）
  const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());
  const [selectedPropIds, setSelectedPropIds] = useState<Set<string>>(new Set());
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());

  // 加载项目资产数据 → DB 基线（不含运行时态）。运行时态来自任务 metadata，自动合并到 derive。
  useEffect(() => {
    if (!open || !project) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [chars, scns, prps] = await Promise.all([
          loadCharacters(project.id),
          loadScenes(project.id),
          loadProps(project.id),
        ]);

        const reopenCacheKey = Date.now();

        const charsItems: ItemStatus[] = chars.map(c => ({
          id: c.id,
          name: c.name,
          selected: false, // selected 由 selectedCharIds Set 维护
          status: getCharacterCostumePhotoSource(c) ? 'completed' : 'pending',
          progress: getCharacterCostumePhotoSource(c) ? 100 : 0,
          imagePath: getCharacterCostumePhotoSource(c),
          imageCacheKey: reopenCacheKey,
        }));
        const scnsItems: ItemStatus[] = scns.map(s => ({
          id: s.id,
          name: s.name,
          selected: false,
          status: getScenePreviewImageSource(s) ? 'completed' : 'pending',
          progress: getScenePreviewImageSource(s) ? 100 : 0,
          imagePath: getScenePreviewImageSource(s),
          imageCacheKey: reopenCacheKey,
        }));
        const prpsItems: ItemStatus[] = prps.map(p => ({
          id: p.id,
          name: p.name,
          selected: false,
          status: getPropPreviewImageSource(p) ? 'completed' : 'pending',
          progress: getPropPreviewImageSource(p) ? 100 : 0,
          imagePath: getPropPreviewImageSource(p),
          imageCacheKey: reopenCacheKey,
        }));
        const charVideos: ItemStatus[] = chars
          .filter(c => getCharacterCostumePhotoSource(c))
          .map(c => ({
            id: c.id,
            name: `[角色] ${c.name}`,
            selected: false,
            status: getCharacterPreviewVideoSource(c) ? 'completed' : 'pending',
            progress: getCharacterPreviewVideoSource(c) ? 100 : 0,
            imagePath: getCharacterPreviewVideoSource(c),
            imageCacheKey: reopenCacheKey,
            sourceType: 'character' as const,
          }));
        const propVideos: ItemStatus[] = prps
          .filter(p => getPropPreviewImageSource(p))
          .map(p => ({
            id: p.id,
            name: `[道具] ${p.name}`,
            selected: false,
            status: getPropPreviewVideoSource(p) ? 'completed' : 'pending',
            progress: getPropPreviewVideoSource(p) ? 100 : 0,
            imagePath: getPropPreviewVideoSource(p),
            imageCacheKey: reopenCacheKey,
            sourceType: 'prop' as const,
          }));

        setBaselineCharacters(charsItems);
        setBaselineScenes(scnsItems);
        setBaselineProps(prpsItems);
        setBaselineVideos([...charVideos, ...propVideos]);

        // 仅当本次是首屏（selected Set 为空）才默认勾选"DB 没图的项"；
        // 否则保留用户已有的勾选选择
        setSelectedCharIds(prev => prev.size > 0 ? prev : new Set(charsItems.filter(it => it.status === 'pending').map(it => it.id)));
        setSelectedSceneIds(prev => prev.size > 0 ? prev : new Set(scnsItems.filter(it => it.status === 'pending').map(it => it.id)));
        setSelectedPropIds(prev => prev.size > 0 ? prev : new Set(prpsItems.filter(it => it.status === 'pending').map(it => it.id)));
        setSelectedVideoIds(prev => prev.size > 0 ? prev : new Set([...charVideos, ...propVideos].filter(it => it.status === 'pending').map(it => it.id)));
      } catch (err: any) {
        message.error(`加载数据失败: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [open, project, message]);

  // ============ 任务订阅 + 运行时态派生 ============
  // 订阅当前项目所有 asset-generation 任务（含已完成的，让 UI 短暂显示完成态）
  const allAssetTasks = useTasks({
    scope: project ? `project:${project.id}` : '__none__',
    type: 'asset-generation',
  });

  // 找当前 step 对应的"最新一条带 stepKey 的任务"（活跃优先，没有则用最近完成的）
  const taskForStep = useMemo(() => {
    const stepKey = stepConfig[currentStep]?.key as WizardStep | undefined;
    if (!stepKey) return null;
    const matching = allAssetTasks.filter(t => (t.metadata as any)?.stepKey === stepKey);
    if (matching.length === 0) return null;
    // 优先活跃任务；没活跃则最近完成的（按 createdAt 倒序）
    const active = matching.find(t => t.status === 'running' || t.status === 'pending' || t.status === 'processing');
    return active || matching[0];
  }, [allAssetTasks, currentStep]);

  // 通用派生器：baseline + selected Set + active task metadata.items → 渲染用 ItemStatus[]
  const deriveItems = useCallback(
    (baseline: ItemStatus[], selectedIds: Set<string>, stepKey: WizardStep): ItemStatus[] => {
      // 仅消费"匹配本 step 的"任务 metadata
      const matching = allAssetTasks.find(t => (t.metadata as any)?.stepKey === stepKey
        && (t.status === 'running' || t.status === 'pending' || t.status === 'processing'));
      const itemStates = (matching?.metadata as { items?: Record<string, ItemMetadataState> } | undefined)?.items || {};
      return baseline.map(it => {
        const remote = itemStates[it.id];
        if (remote) {
          return {
            ...it,
            selected: selectedIds.has(it.id),
            status: remote.status,
            progress: remote.progress,
            error: remote.error,
            imagePath: remote.imagePath ?? it.imagePath,
            imageCacheKey: remote.imageCacheKey ?? it.imageCacheKey,
          };
        }
        return { ...it, selected: selectedIds.has(it.id) };
      });
    },
    [allAssetTasks],
  );

  const characters = useMemo(() => deriveItems(baselineCharacters, selectedCharIds, 'characters'), [baselineCharacters, selectedCharIds, deriveItems]);
  const scenes = useMemo(() => deriveItems(baselineScenes, selectedSceneIds, 'scenes'), [baselineScenes, selectedSceneIds, deriveItems]);
  const props = useMemo(() => deriveItems(baselineProps, selectedPropIds, 'props'), [baselineProps, selectedPropIds, deriveItems]);
  const videoItems = useMemo(() => deriveItems(baselineVideos, selectedVideoIds, 'videos'), [baselineVideos, selectedVideoIds, deriveItems]);

  // generating / overallProgress / currentItem 也派生自 taskForStep
  const generating = !!taskForStep && (taskForStep.status === 'running' || taskForStep.status === 'pending' || taskForStep.status === 'processing');
  const overallProgress = taskForStep?.progress ?? 0;
  const currentItem = ((taskForStep?.metadata as { lastMessage?: string } | undefined)?.lastMessage) || '';

  // 切换选中状态：Set 的 toggle
  const toggleSetMember = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const toggleSelect = useCallback((type: WizardStep, id: string) => {
    switch (type) {
      case 'characters':
        setSelectedCharIds(prev => toggleSetMember(prev, id));
        break;
      case 'scenes':
        setSelectedSceneIds(prev => toggleSetMember(prev, id));
        break;
      case 'props':
        setSelectedPropIds(prev => toggleSetMember(prev, id));
        break;
      case 'videos':
        setSelectedVideoIds(prev => toggleSetMember(prev, id));
        break;
    }
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback((type: WizardStep, selected: boolean) => {
    const apply = (
      baseline: ItemStatus[],
      setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    ) => setter(selected ? new Set(baseline.map(it => it.id)) : new Set());
    switch (type) {
      case 'characters':
        apply(baselineCharacters, setSelectedCharIds);
        break;
      case 'scenes':
        apply(baselineScenes, setSelectedSceneIds);
        break;
      case 'props':
        apply(baselineProps, setSelectedPropIds);
        break;
      case 'videos':
        apply(baselineVideos, setSelectedVideoIds);
        break;
    }
  }, [baselineCharacters, baselineScenes, baselineProps, baselineVideos]);

  // 生成单个资产
  const generateOneItem = async (
    item: ItemStatus,
    stepKey: WizardStep,
    setter: React.Dispatch<React.SetStateAction<ItemStatus[]>>,
    onProgress: (progress: number, step: string) => void,
    /** 在批量场景下传 true：让单 item 不创建独立 task（外层批量 task 已包装） */
    disableTask = false,
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    const ttiSelection = serializeMediaSelection(project.mediaSelections?.tti);
    const itvSelection = serializeMediaSelection(project.mediaSelections?.itv);
    // 项目全局比例 — 角色 / 场景 / 道具的参考图必须落在这个比例上，
    // 否则下游分镜走 image-to-image 时输出比例会被参考图带跑。
    const aspectRatio = project.aspectRatio || '16:9';
    switch (stepKey) {
      case 'characters': {
        const chars = await loadCharacters(project.id);
        const char = chars.find(c => c.id === item.id);
        if (!char) return { success: false, error: '角色不存在' };
        return generateCostumePhoto({
          projectId: project.id,
          character: char,
          aspectRatio,
          styleSnapshot: project.styleSnapshot,
          ttiSelection,
          onProgress,
          disableTask,
        });
      }
      case 'scenes': {
        const scns = await loadScenes(project.id);
        const scene = scns.find(s => s.id === item.id);
        if (!scene) return { success: false, error: '场景不存在' };
        return generateSceneImage({
          projectId: project.id,
          scene,
          aspectRatio,
          styleSnapshot: project.styleSnapshot,
          ttiSelection,
          onProgress,
          disableTask,
        });
      }
      case 'props': {
        const prps = await loadProps(project.id);
        const prop = prps.find(p => p.id === item.id);
        if (!prop) return { success: false, error: '道具不存在' };
        return generatePropImage({
          projectId: project.id,
          prop,
          aspectRatio,
          styleSnapshot: project.styleSnapshot,
          ttiSelection,
          onProgress,
          disableTask,
        });
      }
      case 'videos': {
        if (item.sourceType === 'prop') {
          const prps = await loadProps(project.id);
          const prop = prps.find(p => p.id === item.id);
          if (!prop) return { success: false, error: '道具不存在' };
          return generatePropPreviewVideo({
            projectId: project.id,
            prop,
            styleSnapshot: project.styleSnapshot,
            itvSelection,
            onProgress,
            disableTask,
          });
        } else {
          const chars = await loadCharacters(project.id);
          const char = chars.find(c => c.id === item.id);
          if (!char) return { success: false, error: '角色不存在' };
          return generateCharacterPreviewVideo({
            projectId: project.id,
            character: char,
            styleSnapshot: project.styleSnapshot,
            itvSelection,
            onProgress,
            disableTask,
          });
        }
      }
      default:
        return { success: false, error: '未知步骤' };
    }
  };

  /**
   * 100ms 节流写 metadata。worker 内部维护 latestItems Map，所有进度更新都先合并到 Map，
   * 然后 setMetadata 节流刷盘——避免高频 IPC 写。强制 flush 用于关键节点（开始 / 完成 / 失败）。
   */
  const buildThrottledMetadataWriter = (
    taskCtx: { setMetadata: (patch: Record<string, unknown>) => void; progress: (p: number, msg: string) => void },
    initialItems: Map<string, ItemMetadataState>,
  ) => {
    const latestItems = initialItems;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastMessage = '';

    const flush = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      taskCtx.setMetadata({
        items: Object.fromEntries(latestItems),
        lastMessage,
      });
    };
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(flush, 100);
    };

    return {
      patch: (id: string, partial: Partial<ItemMetadataState>) => {
        const existing = latestItems.get(id) || { status: 'pending', progress: 0 };
        latestItems.set(id, { ...existing, ...partial });
        schedule();
      },
      setLastMessage: (msg: string) => {
        lastMessage = msg;
        schedule();
      },
      flushNow: flush,
    };
  };

  // 开始生成当前步骤
  // 方案 C：worker 只写任务 metadata；UI 通过 useTasks 派生自动刷新
  const startGeneration = async () => {
    const stepKey = stepConfig[currentStep].key as WizardStep;

    // 选中的 item id 集合
    const selectedSet = stepKey === 'characters' ? selectedCharIds
      : stepKey === 'scenes' ? selectedSceneIds
      : stepKey === 'props' ? selectedPropIds
      : selectedVideoIds;

    const baseline = stepKey === 'characters' ? baselineCharacters
      : stepKey === 'scenes' ? baselineScenes
      : stepKey === 'props' ? baselineProps
      : baselineVideos;

    const items = baseline.filter(it => selectedSet.has(it.id));
    if (items.length === 0) return;

    const stepLabel = stepConfig[currentStep].title || stepKey;
    const targetType: 'character' | 'scene' | 'prop' = stepKey === 'scenes'
      ? 'scene'
      : stepKey === 'props'
        ? 'prop'
        : 'character';

    // 初始 metadata.items：所有项 status='generating' progress=0
    const initialItems = new Map<string, ItemMetadataState>();
    for (const it of items) {
      initialItems.set(it.id, {
        status: 'pending',
        progress: 0,
        imagePath: it.imagePath,
        imageCacheKey: it.imageCacheKey,
      });
    }

    try {
      await runWithTask({
        projectId: project.id,
        category: 'asset',
        subType: 'asset-generation',
        targetType,
        targetId: items[0].id,
        targetName: `批量${stepLabel}（${items.length} 个）`,
        type: 'asset-generation',
        metadata: { batchCount: items.length, stepKey, items: Object.fromEntries(initialItems) },
        execute: async (taskCtx) => {
          const writer = buildThrottledMetadataWriter(taskCtx, initialItems);

          const updateOverallProgress = (currentName: string, stage: string) => {
            let acc = 0;
            for (const it of items) acc += initialItems.get(it.id)?.progress ?? 0;
            const overall = acc / items.length;
            taskCtx.progress(overall, `${currentName}: ${stage}`);
          };

          await runBatchWithConcurrency<ItemStatus, { success: boolean; path?: string; error?: string }>({
            items,
            concurrency: 3,
            maxRetries: 2,
            retryBaseDelayMs: 800,
            onAttemptStart: (item, _idx, attempt) => {
              writer.patch(item.id, {
                status: 'generating',
                progress: 0,
                error: attempt > 1 ? `重试中（第 ${attempt} 次）` : undefined,
              });
              writer.setLastMessage(item.name);
              updateOverallProgress(item.name, attempt > 1 ? `重试 ${attempt}` : '开始');
            },
            onAttemptEnd: (item, _idx, _attempt, ok, error) => {
              if (!ok) {
                writer.patch(item.id, {
                  progress: 0,
                  error: error instanceof Error ? error.message : String(error || ''),
                });
                updateOverallProgress(item.name, '重试中');
              }
            },
            worker: async (item) => {
              const onProgress = (progress: number, step: string) => {
                writer.patch(item.id, { progress });
                writer.setLastMessage(`${item.name}: ${step}`);
                updateOverallProgress(item.name, step);
              };
              // disableTask=true：不为单 item 创建独立 task，只把进度写到父任务 metadata
              const r = await generateOneItem(item, stepKey, () => {}, onProgress, true);
              if (!r.success) {
                throw new Error(r.error || '生成失败');
              }
              writer.patch(item.id, {
                status: 'completed',
                progress: 100,
                error: undefined,
                imagePath: r.path || item.imagePath,
                imageCacheKey: Date.now(),
              });
              updateOverallProgress(item.name, '完成');
              return r;
            },
          }).then(results => {
            // 失败兜底：把"用尽重试后仍失败"的项落 metadata
            results.forEach(({ item, result, error, attempts }) => {
              const ok = Boolean(result?.success);
              if (ok) return;
              writer.patch(item.id, {
                status: 'failed',
                progress: 0,
                error: result?.error
                  || (error instanceof Error ? error.message : String(error || ''))
                  || `失败（已重试 ${attempts} 次）`,
              });
            });
            writer.setLastMessage('所有任务结束');
            writer.flushNow(); // 关键节点强制 flush 不留尾巴
          });
        },
      });
    } catch (err: any) {
      message.error(`批量生成异常: ${err.message || err}`);
    }

    // 任务终态后 generating / overallProgress 自动通过 derive 归位
    // baseline 在下次 loadData 时刷新；这里做一次软刷新拉最新 DB 图
    try {
      const [chars, scns, prps] = await Promise.all([
        loadCharacters(project.id),
        loadScenes(project.id),
        loadProps(project.id),
      ]);
      const reopenCacheKey = Date.now();
      if (stepKey === 'characters') {
        setBaselineCharacters(chars.map(c => ({
          id: c.id, name: c.name, selected: false,
          status: getCharacterCostumePhotoSource(c) ? 'completed' : 'pending',
          progress: getCharacterCostumePhotoSource(c) ? 100 : 0,
          imagePath: getCharacterCostumePhotoSource(c),
          imageCacheKey: reopenCacheKey,
        })));
      } else if (stepKey === 'scenes') {
        setBaselineScenes(scns.map(s => ({
          id: s.id, name: s.name, selected: false,
          status: getScenePreviewImageSource(s) ? 'completed' : 'pending',
          progress: getScenePreviewImageSource(s) ? 100 : 0,
          imagePath: getScenePreviewImageSource(s),
          imageCacheKey: reopenCacheKey,
        })));
      } else if (stepKey === 'props') {
        setBaselineProps(prps.map(p => ({
          id: p.id, name: p.name, selected: false,
          status: getPropPreviewImageSource(p) ? 'completed' : 'pending',
          progress: getPropPreviewImageSource(p) ? 100 : 0,
          imagePath: getPropPreviewImageSource(p),
          imageCacheKey: reopenCacheKey,
        })));
      }
    } catch {
      // 软刷新失败不影响主流程
    }
    message.success(`${stepConfig[currentStep].title}生成完成`);
  };

  // 重试单个失败项 — 复用同样的"包一个 1-item 批"模式，让 UI 通过 useTasks 派生看到进度
  const retryItem = async (item: ItemStatus) => {
    const stepKey = stepConfig[currentStep].key as WizardStep;
    const stepLabel = stepConfig[currentStep].title || stepKey;
    const targetType: 'character' | 'scene' | 'prop' = stepKey === 'scenes'
      ? 'scene'
      : stepKey === 'props'
        ? 'prop'
        : 'character';

    const initialItems = new Map<string, ItemMetadataState>([
      [item.id, { status: 'pending', progress: 0, imagePath: item.imagePath, imageCacheKey: item.imageCacheKey }],
    ]);

    let result: { success: boolean; path?: string; error?: string } = { success: false };
    try {
      await runWithTask({
        projectId: project.id,
        category: 'asset',
        subType: 'asset-generation',
        targetType,
        targetId: item.id,
        targetName: `重试 ${stepLabel} · ${item.name}`,
        type: 'asset-generation',
        metadata: { batchCount: 1, stepKey, items: Object.fromEntries(initialItems), retry: true },
        execute: async (taskCtx) => {
          const writer = buildThrottledMetadataWriter(taskCtx, initialItems);
          writer.patch(item.id, { status: 'generating', progress: 0, error: undefined });
          writer.setLastMessage(item.name);
          taskCtx.progress(0, item.name);

          try {
            const onProgress = (progress: number, step: string) => {
              writer.patch(item.id, { progress });
              writer.setLastMessage(`${item.name}: ${step}`);
              taskCtx.progress(progress, `${item.name}: ${step}`);
            };
            result = await generateOneItem(item, stepKey, () => {}, onProgress, true);
          } catch (err: any) {
            result = { success: false, error: err?.message || String(err) };
          }

          if (result.success) {
            writer.patch(item.id, {
              status: 'completed',
              progress: 100,
              error: undefined,
              imagePath: result.path || item.imagePath,
              imageCacheKey: Date.now(),
            });
          } else {
            writer.patch(item.id, {
              status: 'failed',
              progress: 0,
              error: result.error,
            });
          }
          writer.flushNow();
        },
      });
    } catch (err: any) {
      message.error(`重试失败: ${err.message || err}`);
      return;
    }

    if (result.success) {
      message.success(`${item.name} 生成完成`);
    }
  };

  // 下一步
  const handleNext = async () => {
    if (currentStep < stepConfig.length - 1) {
      const nextStep = currentStep + 1;

      // 跳转到视频步骤时，重新加载数据（定妆照/参考图可能刚生成）
      if (stepConfig[nextStep].key === 'videos') {
        const [chars, prps] = await Promise.all([
          loadCharacters(project.id),
          loadProps(project.id),
        ]);
        const reopenCacheKey = Date.now();
        const charVideos: ItemStatus[] = chars
          .filter(c => getCharacterCostumePhotoSource(c))
          .map(c => ({
            id: c.id,
            name: `[角色] ${c.name}`,
            selected: false,
            status: getCharacterPreviewVideoSource(c) ? 'completed' : 'pending',
            progress: getCharacterPreviewVideoSource(c) ? 100 : 0,
            imagePath: getCharacterPreviewVideoSource(c),
            imageCacheKey: reopenCacheKey,
            sourceType: 'character' as const,
          }));
        const propVideos: ItemStatus[] = prps
          .filter(p => getPropPreviewImageSource(p))
          .map(p => ({
            id: p.id,
            name: `[道具] ${p.name}`,
            selected: false,
            status: getPropPreviewVideoSource(p) ? 'completed' : 'pending',
            progress: getPropPreviewVideoSource(p) ? 100 : 0,
            imagePath: getPropPreviewVideoSource(p),
            imageCacheKey: reopenCacheKey,
            sourceType: 'prop' as const,
          }));
        const all = [...charVideos, ...propVideos];
        setBaselineVideos(all);
        // 默认勾选未生成预览视频的项
        setSelectedVideoIds(new Set(all.filter(it => it.status === 'pending').map(it => it.id)));
      }

      setCurrentStep(nextStep);
    } else {
      onComplete?.();
      onClose();
    }
  };

  // 获取当前列表
  const getCurrentList = (): ItemStatus[] => {
    const stepKey = stepConfig[currentStep]?.key as WizardStep;
    switch (stepKey) {
      case 'characters': return characters;
      case 'scenes': return scenes;
      case 'props': return props;
      case 'videos': return videoItems;
      default: return [];
    }
  };

  const currentList = getCurrentList();
  const selectedCount = currentList.filter(i => i.selected).length;
  const completedCount = currentList.filter(i => i.status === 'completed').length;

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  // 渲染列表项
  const renderListItem = (item: ItemStatus, type: WizardStep) => {
    const statusIcon = item.status === 'completed' ? <CheckCircleOutlined className={styles.statusSuccess} /> :
      item.status === 'failed' ? <CloseCircleOutlined className={styles.statusError} /> :
      item.status === 'generating' ? <LoadingOutlined className={styles.statusInfo} /> :
      null;

    return (
      <div key={item.id} className={styles.listItem}>
        <Checkbox
          checked={item.selected}
          onChange={() => toggleSelect(type, item.id)}
          disabled={generating || item.status === 'generating'}
          className={styles.itemCheckbox}
        />
        <div className={styles.itemContent}>
          <Space>
            {item.name}
            {statusIcon}
            {item.status === 'generating' && (
              <Text type="secondary">{item.progress}%</Text>
            )}
          </Space>
          {item.error && <div><Text type="danger">{item.error}</Text></div>}
        </div>
        {item.imagePath && (
          <div className={styles.thumbnailFrame}>
            {type === 'videos' ? (
              <video
                src={appendImageCacheBust(toLocalUrl(item.imagePath), item.imageCacheKey)}
                className={styles.thumbnail}
              />
            ) : (
              <Image
                src={appendImageCacheBust(toLocalUrl(item.imagePath), item.imageCacheKey)}
                className={styles.thumbnail}
                preview={{ mask: null }}
              />
            )}
          </div>
        )}
        {item.status === 'failed' && (
          <Button
            type="link"
            icon={<ReloadOutlined />}
            onClick={() => retryItem(item)}
            disabled={generating}
            className={styles.retryButton}
          >
            重试
          </Button>
        )}
      </div>
    );
  };

  return (
    <Modal
      title={generating ? '资产生成向导（任务后台运行中）' : '资产生成向导'}
      open={open}
      onCancel={onClose}
      width={720}
      footer={null}
      // 资产生成已经走 runWithTask 任务化，关闭向导不会取消后台任务，可在状态栏查看进度
      // 之前 closable 锁死要求用户必须等所有项跑完才能关，体验差
      mask={{ closable: true }}
      closable
    >
      {loading ? (
        <div className={styles.loadingState}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Steps
            current={currentStep}
            items={stepConfig.map(s => ({ title: s.title, icon: s.icon }))}
            className={styles.steps}
          />

          {generating && (
            <Card size="small" className={styles.progressCard}>
              <Space orientation="vertical" className={styles.fullWidth}>
                <Text>正在生成: {currentItem}</Text>
                <Progress percent={Math.round(overallProgress)} status="active" />
              </Space>
            </Card>
          )}

          <Card
            title={
              <Space>
                <span>{stepConfig[currentStep].title}</span>
                <Tag>{completedCount}/{currentList.length} 已完成</Tag>
              </Space>
            }
            extra={
              <Space>
                <Button
                  size="small"
                  onClick={() => toggleSelectAll(stepConfig[currentStep].key as WizardStep, true)}
                  disabled={generating}
                >
                  全选
                </Button>
                <Button
                  size="small"
                  onClick={() => toggleSelectAll(stepConfig[currentStep].key as WizardStep, false)}
                  disabled={generating}
                >
                  取消全选
                </Button>
              </Space>
            }
            classNames={{ body: styles.assetListBody }}
          >
            {currentList.length === 0 ? (
              <Result
                status="info"
                title="暂无数据"
                subTitle={`请先在剧本分析中提取${stepConfig[currentStep].title.replace(/预览图|参考图|定妆照|视频/g, '')}`}
              />
            ) : (
              <Flex vertical>
                {currentList.map((item) => renderListItem(item, stepConfig[currentStep].key as WizardStep))}
              </Flex>
            )}
          </Card>

          <div className={styles.footerActions}>
            <Space>
              {/* 生成中允许关闭窗口：runWithTask 已任务化，关掉向导后台继续跑，可在任务面板看进度 */}
              <Button onClick={onClose}>
                {generating ? '关闭（后台继续）' : '取消'}
              </Button>
              {currentStep > 0 && (
                <Button onClick={() => setCurrentStep(currentStep - 1)} disabled={generating}>
                  上一步
                </Button>
              )}
              <Button
                type="primary"
                onClick={startGeneration}
                disabled={generating || selectedCount === 0}
                loading={generating}
                icon={<PlayCircleOutlined />}
              >
                开始生成 ({selectedCount})
              </Button>
              <Button onClick={handleNext} disabled={generating}>
                {currentStep === stepConfig.length - 1 ? '完成' : '下一步'}
              </Button>
            </Space>
          </div>
        </>
      )}
    </Modal>
  );
};

export default AssetGenerationWizard;
