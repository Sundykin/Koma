/**
 * 资产管理面板
 * 左侧列表 + 右侧详情面板布局
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createLogger } from '../../store/logger';

const logger = createLogger('AssetManagerPanel');
import { App, Spin, Button, Space, Switch, Tooltip } from 'antd';
import {
  ArrowRightOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Character, Scene, Prop, EpisodeAnalysis, ProjectStyleSnapshot } from '../../types';
import {
  loadCharacters,
  loadScenes,
  loadProps,
  saveCharacters,
  saveScenes,
  saveProps,
  loadEpisodeAnalysis,
  loadEpisodeShots,
  removeAssetFromAnalysis,
} from '../../store/projectStore';
import { startShotAnalysis } from '../../services/ShotAnalysisService';
import { AssetListPanel, AssetType } from './AssetListPanel';
import { CharacterDetailPanel } from './CharacterDetailPanel';
import { SceneDetailPanel } from './SceneDetailPanel';
import { PropDetailPanel } from './PropDetailPanel';
import { AssetGenerationWizard } from './AssetGenerationWizard';
import type { Project } from '../../types';
import './AssetManager.css';

interface AssetManagerPanelProps {
  projectId: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  theme?: string;
  styleSnapshot?: ProjectStyleSnapshot;
  stylePrompt?: string;
  episodeId?: string;
  episodeName?: string;
  script?: string;
  llmConfigId?: string;
  onNext: () => void;
}

export const AssetManagerPanel: React.FC<AssetManagerPanelProps> = ({
  projectId,
  ttiConfigId,
  itvConfigId,
  theme,
  styleSnapshot,
  stylePrompt: legacyStylePrompt,
  episodeId,
  episodeName,
  script,
  llmConfigId,
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
  // 批量生成向导
  const [wizardOpen, setWizardOpen] = useState(false);
  const stylePrompt = useMemo(
    () => styleSnapshot?.ttiStylePrefix?.trim() || legacyStylePrompt?.trim() || '',
    [styleSnapshot, legacyStylePrompt]
  );

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
    const refs = episodeAnalysis.characterRefs;
    if (!refs || refs.length === 0) return characters;
    return characters.filter(c => new Set(refs).has(c.id));
  }, [characters, showCurrentEpisodeOnly, episodeAnalysis]);

  const filteredScenes = useMemo(() => {
    if (!showCurrentEpisodeOnly || !episodeAnalysis) return scenes;
    const refs = episodeAnalysis.sceneRefs;
    if (!refs || refs.length === 0) return scenes;
    return scenes.filter(s => new Set(refs).has(s.id));
  }, [scenes, showCurrentEpisodeOnly, episodeAnalysis]);

  const filteredProps = useMemo(() => {
    if (!showCurrentEpisodeOnly || !episodeAnalysis) return props;
    const refs = episodeAnalysis.propRefs;
    if (!refs || refs.length === 0) return props;
    return props.filter(p => new Set(refs).has(p.id));
  }, [props, showCurrentEpisodeOnly, episodeAnalysis]);

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

  // 资产更新回调
  const handleCharacterUpdate = useCallback((updated: Character) => {
    setCharacters(prev => prev.map(c => c.id === updated.id ? updated : c));
  }, []);

  const handleSceneUpdate = useCallback((updated: Scene) => {
    setScenes(prev => prev.map(s => s.id === updated.id ? updated : s));
  }, []);

  const handlePropUpdate = useCallback((updated: Prop) => {
    setProps(prev => prev.map(p => p.id === updated.id ? updated : p));
  }, []);

  // 资产删除回调
  const handleCharacterDelete = useCallback(async (id: string) => {
    const updatedList = characters.filter(c => c.id !== id);
    await saveCharacters(projectId, updatedList);
    if (episodeId) {
      await removeAssetFromAnalysis(projectId, episodeId, id, 'character');
    }
    setCharacters(updatedList);
    if (selectedId === id) setSelectedId(null);
    message.success(t('asset.characterDeleted'));
  }, [characters, projectId, episodeId, selectedId, message, t]);

  const handleSceneDelete = useCallback(async (id: string) => {
    const updatedList = scenes.filter(s => s.id !== id);
    await saveScenes(projectId, updatedList);
    if (episodeId) {
      await removeAssetFromAnalysis(projectId, episodeId, id, 'scene');
    }
    setScenes(updatedList);
    if (selectedId === id) setSelectedId(null);
    message.success(t('asset.sceneDeleted'));
  }, [scenes, projectId, episodeId, selectedId, message, t]);

  const handlePropDelete = useCallback(async (id: string) => {
    const updatedList = props.filter(p => p.id !== id);
    await saveProps(projectId, updatedList);
    if (episodeId) {
      await removeAssetFromAnalysis(projectId, episodeId, id, 'prop');
    }
    setProps(updatedList);
    if (selectedId === id) setSelectedId(null);
    message.success(t('asset.propDeleted'));
  }, [props, projectId, episodeId, selectedId, message, t]);

  // 新建资产回调
  const handleCharacterCreate = useCallback((newChar: Character) => {
    setCharacters(prev => [...prev, newChar]);
    setSelectedType('character');
    setSelectedId(newChar.id);
  }, []);

  const handleSceneCreate = useCallback((newScene: Scene) => {
    setScenes(prev => [...prev, newScene]);
    setSelectedType('scene');
    setSelectedId(newScene.id);
  }, []);

  const handlePropCreate = useCallback((newProp: Prop) => {
    setProps(prev => [...prev, newProp]);
    setSelectedType('prop');
    setSelectedId(newProp.id);
  }, []);

  // 选择资产
  const handleSelect = useCallback((type: AssetType, id: string | null) => {
    setSelectedType(type);
    setSelectedId(id);
  }, []);

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
      await startShotAnalysis(
        projectId,
        episodeId,
        episodeName || `${t('editor.episode')} ${episodeId}`,
        script,
        llmConfigId,
        undefined,
        styleSnapshot
      );
      message.info(t('asset.aiShotStarted'));
      onNext();
    } catch (err: any) {
      message.error(err.message || t('asset.startShotFailed'));
    } finally {
      setIsGeneratingShots(false);
    }
  };

  if (loading) {
    return (
      <div className="assetManagerPanel" style={{ justifyContent: 'center', alignItems: 'center' }}>
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
            theme={theme}
            stylePrompt={stylePrompt}
            styleSnapshot={styleSnapshot}
            ttiConfigId={ttiConfigId}
            itvConfigId={itvConfigId}
            onUpdate={handleCharacterUpdate}
            onDelete={handleCharacterDelete}
          />
        )}
        {selectedType === 'scene' && selectedScene && (
          <SceneDetailPanel
            key={selectedScene.id}
            scene={selectedScene}
            projectId={projectId}
            theme={theme}
            stylePrompt={stylePrompt}
            styleSnapshot={styleSnapshot}
            ttiConfigId={ttiConfigId}
            onUpdate={handleSceneUpdate}
            onDelete={handleSceneDelete}
          />
        )}
        {selectedType === 'prop' && selectedProp && (
          <PropDetailPanel
            key={selectedProp.id}
            prop={selectedProp}
            projectId={projectId}
            theme={theme}
            stylePrompt={stylePrompt}
            styleSnapshot={styleSnapshot}
            ttiConfigId={ttiConfigId}
            itvConfigId={itvConfigId}
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

      {/* 底部操作栏 */}
      <div className="assetFooter">
        <Space>
          <Tooltip title={t('asset.batchGenerateMaterials')}>
            <Button icon={<ThunderboltOutlined />} onClick={() => setWizardOpen(true)}>{t('asset.batchGenerate')}</Button>
          </Tooltip>
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

      {/* 批量生成向导 */}
      <AssetGenerationWizard
        project={{ id: projectId, ttiConfigId, itvConfigId, styleSnapshot } as Project}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={loadAssets}
      />
    </div>
  );
};

export default AssetManagerPanel;
