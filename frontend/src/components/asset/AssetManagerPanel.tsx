/**
 * 资产管理面板
 * 左侧列表 + 右侧详情面板布局
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createLogger } from '../../store/logger';

const logger = createLogger('AssetManagerPanel');
import { App, Spin, Button, Space, Switch, Tooltip, Progress } from 'antd';
import {
  ArrowRightOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  FilterOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Character, Scene, Prop, EpisodeAnalysis, ProjectStyleSnapshot } from '../../types';
import {
  loadCharacters,
  loadScenes,
  loadProps,
  loadEpisodeAnalysis,
  saveEpisodeAnalysis,
  loadEpisodeShots,
  removeAssetFromAnalysis,
  addCharacterEpisodeRef,
  addSceneEpisodeRef,
  addPropEpisodeRef,
  removeCharacterEpisodeRef,
  removeSceneEpisodeRef,
  removePropEpisodeRef,
} from '../../store/projectStore';
import { submitShotAnalysisTask, submitScriptAnalysisTask } from '../../services/analysisTaskClient';
import { listTaskRecords } from '../../services/tasksIPC';
import { runWithTask } from '../../services/taskRunner';
import { runBatchWithConcurrency } from '../../utils/batchRunner';
import { generateCostumePhoto } from '../../workflow/characterAssetWorkflow';
import { generateSceneImage, generatePropImage } from '../../workflow/scenePropAssetWorkflow';
import {
  getCharacterCostumePhotoSource,
  getScenePreviewImageSource,
  getPropPreviewImageSource,
} from '../../utils/mediaSelectors';
import { AssetListPanel, AssetType } from './AssetListPanel';
import { CharacterDetailPanel } from './CharacterDetailPanel';
import { SceneDetailPanel } from './SceneDetailPanel';
import { PropDetailPanel } from './PropDetailPanel';
import {
  addAssetIdToEpisodeAnalysisRefs,
  filterAssetsForEpisode,
  getUnboundAssetsForEpisode,
  withEpisodeRef,
  withoutEpisodeRef,
} from './assetEpisodeRefs';
import type { EpisodeRefsKey } from './assetEpisodeRefs';
import './AssetManager.scss';


function upsertAssetById<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some(existing => existing.id === item.id)
    ? items.map(existing => existing.id === item.id ? item : existing)
    : [...items, item];
}

interface AssetManagerPanelProps {
  projectId: string;
  /** 项目全局比例 — 透传给角色/场景/道具的生图调用，让参考图与项目比例一致 */
  aspectRatio?: '16:9' | '9:16';
  ttiSelection?: string;
  itvSelection?: string;
  theme?: string;
  styleSnapshot?: ProjectStyleSnapshot;
  stylePrompt?: string;
  episodeId?: string;
  episodeName?: string;
  script?: string;
  llmSelection?: string;
  onNext: () => void;
}

export const AssetManagerPanel: React.FC<AssetManagerPanelProps> = ({
  projectId,
  aspectRatio,
  ttiSelection,
  itvSelection,
  theme,
  styleSnapshot,
  stylePrompt: legacyStylePrompt,
  episodeId,
  episodeName,
  script,
  llmSelection,
  onNext,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  // 资产数据
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);

  // 选中状态
  const [selectedType, setSelectedType] = useState<AssetType>('character');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 剧集筛选
  const [showCurrentEpisodeOnly, setShowCurrentEpisodeOnly] = useState(true);
  const [episodeAnalysis, setEpisodeAnalysis] = useState<EpisodeAnalysis | null>(null);

  // 分镜生成状态
  const [isGeneratingShots, setIsGeneratingShots] = useState(false);
  // 剧本资产提取状态（提取在 main-side 任务里跑，这里轮询剧集分析落盘情况）
  const [isExtractingAssets, setIsExtractingAssets] = useState(false);
  // 缺失素材一键生成状态
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchDoneCount, setBatchDoneCount] = useState(0);
  const [batchTotalCount, setBatchTotalCount] = useState(0);
  /** 正在生成图片的资产 id 集合 — 列表卡片据此显示生成中遮罩 */
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const stylePrompt = useMemo(
    () => styleSnapshot?.ttiStylePrefix?.trim() || legacyStylePrompt?.trim() || '',
    [styleSnapshot, legacyStylePrompt]
  );
  const currentEpisodeRef = useMemo(() => {
    if (!episodeId) return null;
    return {
      episodeId,
      episodeName: episodeName || `${t('editor.episode')} ${episodeId}`,
      firstAppearance: true,
    };
  }, [episodeId, episodeName, t]);

  // 加载资产数据
  const loadAssets = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [chars, scns, prps] = await Promise.all([
        loadCharacters(projectId),
        loadScenes(projectId),
        loadProps(projectId),
      ]);
      setCharacters(chars);
      setScenes(scns);
      setProps(prps);

      if (episodeId) {
        const analysis = await loadEpisodeAnalysis(projectId, episodeId);
        setEpisodeAnalysis(analysis);
      }
    } catch (err) {
      logger.error('加载资产失败:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, episodeId]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // 筛选后的资产
  const filteredCharacters = useMemo(() => {
    if (!showCurrentEpisodeOnly || !episodeAnalysis) return characters;
    return filterAssetsForEpisode(characters, episodeAnalysis.characterRefs, episodeId);
  }, [characters, showCurrentEpisodeOnly, episodeAnalysis, episodeId]);

  const filteredScenes = useMemo(() => {
    if (!showCurrentEpisodeOnly || !episodeAnalysis) return scenes;
    return filterAssetsForEpisode(scenes, episodeAnalysis.sceneRefs, episodeId);
  }, [scenes, showCurrentEpisodeOnly, episodeAnalysis, episodeId]);

  const filteredProps = useMemo(() => {
    if (!showCurrentEpisodeOnly || !episodeAnalysis) return props;
    return filterAssetsForEpisode(props, episodeAnalysis.propRefs, episodeId);
  }, [props, showCurrentEpisodeOnly, episodeAnalysis, episodeId]);

  // 获取当前选中的资产
  const selectedCharacter = useMemo(
    () => characters.find(c => c.id === selectedId) || null,
    [characters, selectedId]
  );
  const selectedScene = useMemo(
    () => scenes.find(s => s.id === selectedId) || null,
    [scenes, selectedId]
  );
  const selectedProp = useMemo(
    () => props.find(p => p.id === selectedId) || null,
    [props, selectedId]
  );

  const characterBindCandidates = useMemo(() => (
    getUnboundAssetsForEpisode(characters, episodeAnalysis?.characterRefs, episodeId)
  ), [characters, episodeAnalysis?.characterRefs, episodeId]);

  const sceneBindCandidates = useMemo(() => (
    getUnboundAssetsForEpisode(scenes, episodeAnalysis?.sceneRefs, episodeId)
  ), [scenes, episodeAnalysis?.sceneRefs, episodeId]);

  const propBindCandidates = useMemo(() => (
    getUnboundAssetsForEpisode(props, episodeAnalysis?.propRefs, episodeId)
  ), [props, episodeAnalysis?.propRefs, episodeId]);

  const syncAssetWithCurrentEpisode = useCallback(async <T extends Character | Scene | Prop,>(
    asset: T,
    refsKey: EpisodeRefsKey,
    addEpisodeRef: (projectId: string, assetId: string, episodeRef: NonNullable<typeof currentEpisodeRef>) => Promise<void>
  ): Promise<T> => {
    if (!episodeId || !episodeAnalysis || !currentEpisodeRef) return asset;

    const latestAnalysis = await loadEpisodeAnalysis(projectId, episodeId);
    const baseAnalysis = latestAnalysis || episodeAnalysis;
    const updatedAnalysis = addAssetIdToEpisodeAnalysisRefs(baseAnalysis, refsKey, asset.id);

    const [savedAnalysis] = await Promise.all([
      saveEpisodeAnalysis(projectId, episodeId, {
        characterRefs: updatedAnalysis.characterRefs,
        sceneRefs: updatedAnalysis.sceneRefs,
        propRefs: updatedAnalysis.propRefs,
        completedStages: updatedAnalysis.completedStages,
        shots: updatedAnalysis.shots,
      }),
      addEpisodeRef(projectId, asset.id, currentEpisodeRef),
    ]);

    setEpisodeAnalysis(savedAnalysis);
    return withEpisodeRef(asset, currentEpisodeRef);
  }, [currentEpisodeRef, episodeAnalysis, episodeId, projectId]);

  const handleBindExistingCharacter = useCallback(async (character: Character) => {
    try {
      const syncedChar = await syncAssetWithCurrentEpisode(
        character,
        'characterRefs',
        addCharacterEpisodeRef
      );
      setCharacters(prev => upsertAssetById(prev, syncedChar));
      setSelectedType('character');
      setSelectedId(character.id);
      message.success(t('asset.addedToEpisode'));
    } catch (err) {
      logger.error('绑定已有角色到当前集失败:', err);
      message.error(t('asset.saveFailed'));
    }
  }, [message, syncAssetWithCurrentEpisode, t]);

  const handleBindExistingScene = useCallback(async (scene: Scene) => {
    try {
      const syncedScene = await syncAssetWithCurrentEpisode(
        scene,
        'sceneRefs',
        addSceneEpisodeRef
      );
      setScenes(prev => upsertAssetById(prev, syncedScene));
      setSelectedType('scene');
      setSelectedId(scene.id);
      message.success(t('asset.addedToEpisode'));
    } catch (err) {
      logger.error('绑定已有场景到当前集失败:', err);
      message.error(t('asset.saveFailed'));
    }
  }, [message, syncAssetWithCurrentEpisode, t]);

  const handleBindExistingProp = useCallback(async (prop: Prop) => {
    try {
      const syncedProp = await syncAssetWithCurrentEpisode(
        prop,
        'propRefs',
        addPropEpisodeRef
      );
      setProps(prev => upsertAssetById(prev, syncedProp));
      setSelectedType('prop');
      setSelectedId(prop.id);
      message.success(t('asset.addedToEpisode'));
    } catch (err) {
      logger.error('绑定已有道具到当前集失败:', err);
      message.error(t('asset.saveFailed'));
    }
  }, [message, syncAssetWithCurrentEpisode, t]);

  const updateAssetWithCurrentEpisode = useCallback(<T extends Character | Scene | Prop,>(
    updated: T,
    refsKey: EpisodeRefsKey,
    addEpisodeRef: (projectId: string, assetId: string, episodeRef: NonNullable<typeof currentEpisodeRef>) => Promise<void>,
    setAssets: React.Dispatch<React.SetStateAction<T[]>>,
    errorMessage: string
  ) => {
    setAssets(prev => upsertAssetById(prev, updated));

    if (!showCurrentEpisodeOnly || !episodeId || !episodeAnalysis || !currentEpisodeRef) return;

    void (async () => {
      try {
        const syncedAsset = await syncAssetWithCurrentEpisode(updated, refsKey, addEpisodeRef);
        setAssets(prev => upsertAssetById(prev, syncedAsset));
      } catch (err) {
        logger.error(errorMessage, err);
      }
    })();
  }, [currentEpisodeRef, episodeAnalysis, episodeId, showCurrentEpisodeOnly, syncAssetWithCurrentEpisode]);

  // 资产更新回调
  const handleCharacterUpdate = useCallback((updated: Character) => {
    updateAssetWithCurrentEpisode(
      updated,
      'characterRefs',
      addCharacterEpisodeRef,
      setCharacters,
      '同步角色剧集引用失败:'
    );
  }, [updateAssetWithCurrentEpisode]);

  const handleSceneUpdate = useCallback((updated: Scene) => {
    updateAssetWithCurrentEpisode(
      updated,
      'sceneRefs',
      addSceneEpisodeRef,
      setScenes,
      '同步场景剧集引用失败:'
    );
  }, [updateAssetWithCurrentEpisode]);

  const handlePropUpdate = useCallback((updated: Prop) => {
    updateAssetWithCurrentEpisode(
      updated,
      'propRefs',
      addPropEpisodeRef,
      setProps,
      '同步道具剧集引用失败:'
    );
  }, [updateAssetWithCurrentEpisode]);

  // 从当前集移除资产绑定，不删除项目公共资产本体
  const removeAssetFromCurrentEpisode = useCallback(async <T extends Character | Scene | Prop,>(
    id: string,
    type: AssetType,
    removeEpisodeRef: (projectId: string, assetId: string, episodeId: string) => Promise<void>,
    setAssets: React.Dispatch<React.SetStateAction<T[]>>
  ) => {
    if (!episodeId) {
      if (selectedId === id) setSelectedId(null);
      message.warning(t('asset.cannotRemoveWithoutEpisode'));
      return;
    }

    try {
      await Promise.all([
        removeAssetFromAnalysis(projectId, episodeId, id, type),
        removeEpisodeRef(projectId, id, episodeId),
      ]);

      const latestAnalysis = await loadEpisodeAnalysis(projectId, episodeId);
      setEpisodeAnalysis(latestAnalysis);
      setAssets(prev => prev.map(asset => (
        asset.id === id ? withoutEpisodeRef(asset, episodeId) : asset
      )));
      if (selectedId === id) setSelectedId(null);
      message.success(t('asset.removedFromEpisode'));
    } catch (err) {
      logger.error('从当前集移除资产失败:', err);
      message.error(t('asset.saveFailed'));
    }
  }, [episodeId, message, projectId, selectedId, t]);

  const handleCharacterDelete = useCallback(async (id: string) => {
    await removeAssetFromCurrentEpisode(id, 'character', removeCharacterEpisodeRef, setCharacters);
  }, [removeAssetFromCurrentEpisode]);

  const handleSceneDelete = useCallback(async (id: string) => {
    await removeAssetFromCurrentEpisode(id, 'scene', removeSceneEpisodeRef, setScenes);
  }, [removeAssetFromCurrentEpisode]);

  const handlePropDelete = useCallback(async (id: string) => {
    await removeAssetFromCurrentEpisode(id, 'prop', removePropEpisodeRef, setProps);
  }, [removeAssetFromCurrentEpisode]);

  // 新建资产回调
  const handleCharacterCreate = useCallback((newChar: Character) => {
    void (async () => {
      try {
        const syncedChar = await syncAssetWithCurrentEpisode(
          newChar,
          'characterRefs',
          addCharacterEpisodeRef
        );
        setCharacters(prev => upsertAssetById(prev, syncedChar));
      } catch (err) {
        logger.error('同步新角色剧集引用失败:', err);
        message.error(t('asset.saveFailed'));
        setCharacters(prev => upsertAssetById(prev, newChar));
      } finally {
        setSelectedType('character');
        setSelectedId(newChar.id);
      }
    })();
  }, [message, syncAssetWithCurrentEpisode, t]);

  const handleSceneCreate = useCallback((newScene: Scene) => {
    void (async () => {
      try {
        const syncedScene = await syncAssetWithCurrentEpisode(
          newScene,
          'sceneRefs',
          addSceneEpisodeRef
        );
        setScenes(prev => upsertAssetById(prev, syncedScene));
      } catch (err) {
        logger.error('同步新场景剧集引用失败:', err);
        message.error(t('asset.saveFailed'));
        setScenes(prev => upsertAssetById(prev, newScene));
      } finally {
        setSelectedType('scene');
        setSelectedId(newScene.id);
      }
    })();
  }, [message, syncAssetWithCurrentEpisode, t]);

  const handlePropCreate = useCallback((newProp: Prop) => {
    void (async () => {
      try {
        const syncedProp = await syncAssetWithCurrentEpisode(
          newProp,
          'propRefs',
          addPropEpisodeRef
        );
        setProps(prev => upsertAssetById(prev, syncedProp));
      } catch (err) {
        logger.error('同步新道具剧集引用失败:', err);
        message.error(t('asset.saveFailed'));
        setProps(prev => upsertAssetById(prev, newProp));
      } finally {
        setSelectedType('prop');
        setSelectedId(newProp.id);
      }
    })();
  }, [message, syncAssetWithCurrentEpisode, t]);

  // 选择资产
  const handleSelect = useCallback((type: AssetType, id: string | null) => {
    setSelectedType(type);
    setSelectedId(id);
  }, []);

  // 缺失图片的资产（以当前列表视图为准：只看用户看到的这些）
  const missingImageAssets = useMemo(() => ({
    characters: filteredCharacters.filter(c => !getCharacterCostumePhotoSource(c)),
    scenes: filteredScenes.filter(s => !getScenePreviewImageSource(s)),
    props: filteredProps.filter(p => !getPropPreviewImageSource(p)),
  }), [filteredCharacters, filteredScenes, filteredProps]);
  const missingImageCount = missingImageAssets.characters.length
    + missingImageAssets.scenes.length
    + missingImageAssets.props.length;

  // 从剧本提取资产：提交 main-side 分析任务后轮询落盘，中途逐步刷新列表
  const handleExtractAssets = useCallback(async () => {
    if (!episodeId || !script) {
      message.warning(t('asset.missingEpisodeOrScript'));
      return;
    }
    setIsExtractingAssets(true);
    try {
      const { deduped } = await submitScriptAnalysisTask({
        projectId,
        episodeId,
        episodeName: episodeName || `${t('editor.episode')} ${episodeId}`,
        script,
        llmSelection,
        styleSnapshot,
      });
      if (deduped) {
        message.info('当前剧集已有提取任务在进行中');
      }

      // 轮询直到没有活跃的 script-analysis 任务；阶段结果落盘即可见
      const maxPolls = 200; // 3s × 200 ≈ 10 分钟兜底
      for (let i = 0; i < maxPolls; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await loadAssets();
        const active = await listTaskRecords({
          scope: `project:${projectId}`,
          type: 'script-analysis',
          targetKind: 'episode',
          targetId: episodeId,
          status: ['pending', 'running', 'processing'],
        });
        if (active.length === 0) break;
      }
      await loadAssets();
      message.success(t('asset.extractAssetsDone'));
    } catch (err: any) {
      message.error(err.message || t('asset.saveFailed'));
    } finally {
      setIsExtractingAssets(false);
    }
  }, [episodeId, script, projectId, episodeName, llmSelection, styleSnapshot, loadAssets, message, t]);

  // 一键生成全部缺失素材：角色定妆照 → 场景图 → 道具图，并发 3、失败自动重试
  const handleGenerateMissingAssets = useCallback(async () => {
    const items: Array<{ type: AssetType; asset: Character | Scene | Prop; name: string }> = [
      ...missingImageAssets.characters.map(a => ({ type: 'character' as const, asset: a, name: a.name })),
      ...missingImageAssets.scenes.map(a => ({ type: 'scene' as const, asset: a, name: a.name })),
      ...missingImageAssets.props.map(a => ({ type: 'prop' as const, asset: a, name: a.name })),
    ];
    if (items.length === 0) return;

    setIsBatchGenerating(true);
    setBatchDoneCount(0);
    setBatchTotalCount(items.length);

    let successCount = 0;
    let failedCount = 0;
    try {
      await runWithTask({
        projectId,
        category: 'asset',
        subType: 'asset-generation',
        targetType: 'character',
        targetId: items[0].asset.id,
        targetName: `生成缺失素材（${items.length} 个）`,
        type: 'asset-generation',
        metadata: { batchCount: items.length },
        execute: async (taskCtx) => {
          const doneProgress = new Map<string, number>();
          const syncOverall = (label: string) => {
            let acc = 0;
            items.forEach(it => { acc += doneProgress.get(it.asset.id) ?? 0; });
            taskCtx.progress(acc / items.length, label);
          };
          await runBatchWithConcurrency({
            items,
            concurrency: 3,
            maxRetries: 2,
            retryBaseDelayMs: 800,
            onAttemptStart: (item) => {
              setGeneratingIds(prev => new Set(prev).add(item.asset.id));
              syncOverall(item.name);
            },
            worker: async (item) => {
              const onProgress = () => {
                // 单图生成没有细粒度进度回传需求，这里只保证总条在动
                syncOverall(item.name);
              };
              const common = {
                projectId,
                aspectRatio,
                theme,
                stylePrompt,
                styleSnapshot,
                ttiSelection,
                onProgress,
                disableTask: true,
              };
              let result: { success: boolean; error?: string };
              if (item.type === 'character') {
                result = await generateCostumePhoto({ ...common, character: item.asset as Character });
              } else if (item.type === 'scene') {
                result = await generateSceneImage({ ...common, scene: item.asset as Scene });
              } else {
                result = await generatePropImage({ ...common, prop: item.asset as Prop });
              }
              if (!result.success) throw new Error(result.error || '生成失败');
              return result;
            },
          }).then(results => {
            results.forEach(({ item, result }) => {
              const ok = Boolean(result?.success);
              doneProgress.set(item.asset.id, ok ? 100 : 0);
              if (ok) successCount += 1;
              else failedCount += 1;
              setGeneratingIds(prev => {
                const next = new Set(prev);
                next.delete(item.asset.id);
                return next;
              });
              setBatchDoneCount(prev => prev + 1);
            });
          });
        },
      });
      if (failedCount === 0) {
        message.success(t('asset.generateMissingAssetsDone'));
      } else {
        message.warning(t('asset.generateMissingAssetsPartial', { success: successCount, failed: failedCount }));
      }
    } catch (err: any) {
      message.error(err.message || t('asset.generateFailed'));
    } finally {
      setIsBatchGenerating(false);
      setGeneratingIds(new Set());
      // bindOwner 默认开启，图片已写回资产记录；重读列表刷新缩略图
      await loadAssets();
    }
  }, [missingImageAssets, projectId, aspectRatio, theme, stylePrompt, styleSnapshot, ttiSelection, loadAssets, message, t]);

  // 下一步
  const handleNextAndGenerateShots = async () => {
    if (!episodeId || !script) {
      message.warning(t('asset.missingEpisodeOrScript'));
      onNext();
      return;
    }

    // 检查是否已有分镜数据，避免重复生成
    try {
      const existingShots = await loadEpisodeShots(projectId, episodeId);
      if (existingShots.length > 0) {
        onNext();
        return;
      }
    } catch {
      // 加载失败时继续生成
    }

    setIsGeneratingShots(true);
    try {
      const { deduped } = await submitShotAnalysisTask({
        projectId,
        episodeId,
        episodeName: episodeName || `${t('editor.episode')} ${episodeId}`,
        script,
        llmSelection,
        styleSnapshot,
      });
      if (deduped) {
        message.info('当前剧集已在后台生成中，请等待完成后再试。');
      } else {
        message.info(t('asset.aiShotStarted'));
      }
      onNext();
    } catch (err: any) {
      message.error(err.message || t('asset.startShotFailed'));
    } finally {
      setIsGeneratingShots(false);
    }
  };

  if (loading) {
    return (
      <div className="assetManagerPanel assetManagerPanelLoading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="assetManagerPanel">
      {/* 左侧列表 */}
      <div className="assetListSection">
        <AssetListPanel
          characters={filteredCharacters}
          scenes={filteredScenes}
          props={filteredProps}
          selectedType={selectedType}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreateCharacter={handleCharacterCreate}
          onCreateScene={handleSceneCreate}
          onCreateProp={handlePropCreate}
          canBindExisting={!!episodeId && !!episodeAnalysis}
          existingCharacterCandidates={characterBindCandidates}
          existingSceneCandidates={sceneBindCandidates}
          existingPropCandidates={propBindCandidates}
          onBindExistingCharacter={handleBindExistingCharacter}
          onBindExistingScene={handleBindExistingScene}
          onBindExistingProp={handleBindExistingProp}
          generatingIds={generatingIds}
          projectId={projectId}
        />
        {/* 筛选开关 */}
        {episodeId && (
          <div className="assetListFilter">
            <Space size="small">
              <FilterOutlined />
              <span>{t('asset.currentEpisodeOnly')}</span>
              <Tooltip title={!episodeAnalysis ? t('asset.needAnalysisFirst') : ''}>
                <Switch
                  size="small"
                  checked={showCurrentEpisodeOnly}
                  onChange={setShowCurrentEpisodeOnly}
                  disabled={!episodeAnalysis}
                />
              </Tooltip>
            </Space>
          </div>
        )}
      </div>

      {/* 右侧详情面板 */}
      <div className="assetDetailSection">
        {selectedType === 'character' && selectedCharacter && (
          <CharacterDetailPanel
            key={selectedCharacter.id}
            character={selectedCharacter}
            projectId={projectId}
            aspectRatio={aspectRatio}
            theme={theme}
            stylePrompt={stylePrompt}
            styleSnapshot={styleSnapshot}
            ttiSelection={ttiSelection}
            itvSelection={itvSelection}
            onUpdate={handleCharacterUpdate}
            onDelete={handleCharacterDelete}
          />
        )}
        {selectedType === 'scene' && selectedScene && (
          <SceneDetailPanel
            key={selectedScene.id}
            scene={selectedScene}
            projectId={projectId}
            aspectRatio={aspectRatio}
            theme={theme}
            stylePrompt={stylePrompt}
            styleSnapshot={styleSnapshot}
            ttiSelection={ttiSelection}
            onUpdate={handleSceneUpdate}
            onDelete={handleSceneDelete}
          />
        )}
        {selectedType === 'prop' && selectedProp && (
          <PropDetailPanel
            key={selectedProp.id}
            prop={selectedProp}
            projectId={projectId}
            aspectRatio={aspectRatio}
            theme={theme}
            stylePrompt={stylePrompt}
            styleSnapshot={styleSnapshot}
            ttiSelection={ttiSelection}
            itvSelection={itvSelection}
            onUpdate={handlePropUpdate}
            onDelete={handlePropDelete}
          />
        )}
        {!selectedId && (
          <div className="assetDetailEmpty">
            <span>{t('asset.selectToView')}</span>
          </div>
        )}
      </div>

      {/* 底部操作栏：提取 → 生成 → 下一步，同一界面闭环 */}
      <div className="assetFooter">
        <Space size="middle">
          {episodeId && script && (
            <Tooltip title={t('asset.extractAssetsFromScript')}>
              <Button
                icon={isExtractingAssets ? <LoadingOutlined /> : <FileSearchOutlined />}
                onClick={handleExtractAssets}
                loading={isExtractingAssets}
                disabled={isBatchGenerating || isGeneratingShots}
              >
                {isExtractingAssets ? t('asset.extractingAssets') : t('asset.extractAssetsFromScript')}
              </Button>
            </Tooltip>
          )}
          <Tooltip title={missingImageCount === 0 ? t('asset.batchGenerateMaterials') : ''}>
            <Button
              type={missingImageCount > 0 ? 'primary' : 'default'}
              icon={<ThunderboltOutlined />}
              onClick={handleGenerateMissingAssets}
              disabled={missingImageCount === 0 || isBatchGenerating || isExtractingAssets || isGeneratingShots}
            >
              {t('asset.generateMissingAssetsCount', { count: missingImageCount })}
            </Button>
          </Tooltip>
          {isBatchGenerating && (
            <Progress
              percent={batchTotalCount > 0 ? Math.round((batchDoneCount / batchTotalCount) * 100) : 0}
              size="small"
              style={{ width: 180 }}
              format={() => t('asset.generatingMissingAssets', { done: batchDoneCount, total: batchTotalCount })}
            />
          )}
        </Space>
        <Button
          type="primary"
          size="large"
          icon={isGeneratingShots ? <LoadingOutlined /> : <ArrowRightOutlined />}
          onClick={handleNextAndGenerateShots}
          loading={isGeneratingShots}
        >
          {isGeneratingShots ? t('asset.generatingAIShots') : t('asset.nextGenerateShots')}
        </Button>
      </div>
    </div>
  );
};

export default AssetManagerPanel;
