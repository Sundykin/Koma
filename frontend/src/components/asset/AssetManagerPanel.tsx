/**
 * 资产管理面板
 * 左侧列表 + 右侧详情面板布局
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { App, Spin, Button, Space, Switch, Tooltip } from 'antd';
import {
  ArrowRightOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import type { Character, Scene, Prop, EpisodeAnalysis } from '../../types';
import {
  loadCharacters,
  loadScenes,
  loadProps,
  saveCharacters,
  saveScenes,
  saveProps,
  loadEpisodeAnalysis,
} from '../../store/projectStore';
import { startShotAnalysis } from '../../services/ShotAnalysisService';
import { AssetListPanel, AssetType } from './AssetListPanel';
import { CharacterDetailPanel } from './CharacterDetailPanel';
import { SceneDetailPanel } from './SceneDetailPanel';
import { PropDetailPanel } from './PropDetailPanel';
import './AssetManager.css';

interface AssetManagerPanelProps {
  projectId: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  theme?: string;
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
  stylePrompt,
  episodeId,
  episodeName,
  script,
  llmConfigId,
  onNext,
}) => {
  const { message } = App.useApp();

  // 资产数据
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);

  // 选中状态
  const [selectedType, setSelectedType] = useState<AssetType>('character');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 分集筛选
  const [showCurrentEpisodeOnly, setShowCurrentEpisodeOnly] = useState(true);
  const [episodeAnalysis, setEpisodeAnalysis] = useState<EpisodeAnalysis | null>(null);

  // 分镜生成状态
  const [isGeneratingShots, setIsGeneratingShots] = useState(false);

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
      console.error('加载资产失败:', err);
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
    const refs = new Set(episodeAnalysis.characterRefs);
    return characters.filter(c => refs.has(c.id));
  }, [characters, showCurrentEpisodeOnly, episodeAnalysis]);

  const filteredScenes = useMemo(() => {
    if (!showCurrentEpisodeOnly || !episodeAnalysis) return scenes;
    const refs = new Set(episodeAnalysis.sceneRefs);
    return scenes.filter(s => refs.has(s.id));
  }, [scenes, showCurrentEpisodeOnly, episodeAnalysis]);

  const filteredProps = useMemo(() => {
    if (!showCurrentEpisodeOnly || !episodeAnalysis) return props;
    const refs = new Set(episodeAnalysis.propRefs);
    return props.filter(p => refs.has(p.id));
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
    setCharacters(updatedList);
    if (selectedId === id) setSelectedId(null);
    message.success('角色已删除');
  }, [characters, projectId, selectedId, message]);

  const handleSceneDelete = useCallback(async (id: string) => {
    const updatedList = scenes.filter(s => s.id !== id);
    await saveScenes(projectId, updatedList);
    setScenes(updatedList);
    if (selectedId === id) setSelectedId(null);
    message.success('场景已删除');
  }, [scenes, projectId, selectedId, message]);

  const handlePropDelete = useCallback(async (id: string) => {
    const updatedList = props.filter(p => p.id !== id);
    await saveProps(projectId, updatedList);
    setProps(updatedList);
    if (selectedId === id) setSelectedId(null);
    message.success('道具已删除');
  }, [props, projectId, selectedId, message]);

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
      message.warning('缺少分集或剧本信息，跳过分镜生成');
      onNext();
      return;
    }

    setIsGeneratingShots(true);
    try {
      await startShotAnalysis(
        projectId,
        episodeId,
        episodeName || `分集 ${episodeId}`,
        script,
        llmConfigId
      );
      message.info('AI 分镜生成任务已启动');
      onNext();
    } catch (err: any) {
      message.error(err.message || '启动分镜生成失败');
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
              <span>仅当前分集</span>
              <Switch
                size="small"
                checked={showCurrentEpisodeOnly}
                onChange={setShowCurrentEpisodeOnly}
                disabled={!episodeAnalysis}
              />
            </Space>
          </div>
        )}
      </div>

      {/* 右侧详情面板 */}
      <div className="assetDetailSection">
        {selectedType === 'character' && selectedCharacter && (
          <CharacterDetailPanel
            character={selectedCharacter}
            projectId={projectId}
            theme={theme}
            stylePrompt={stylePrompt}
            ttiConfigId={ttiConfigId}
            itvConfigId={itvConfigId}
            onUpdate={handleCharacterUpdate}
            onDelete={handleCharacterDelete}
          />
        )}
        {selectedType === 'scene' && selectedScene && (
          <SceneDetailPanel
            scene={selectedScene}
            projectId={projectId}
            theme={theme}
            stylePrompt={stylePrompt}
            ttiConfigId={ttiConfigId}
            onUpdate={handleSceneUpdate}
            onDelete={handleSceneDelete}
          />
        )}
        {selectedType === 'prop' && selectedProp && (
          <PropDetailPanel
            prop={selectedProp}
            projectId={projectId}
            theme={theme}
            stylePrompt={stylePrompt}
            ttiConfigId={ttiConfigId}
            itvConfigId={itvConfigId}
            onUpdate={handlePropUpdate}
            onDelete={handlePropDelete}
          />
        )}
        {!selectedId && (
          <div className="assetDetailEmpty">
            <span>选择一个资产查看详情</span>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="assetFooter">
        <Space>
          <Tooltip title="批量生成素材">
            <Button icon={<ThunderboltOutlined />}>批量生成</Button>
          </Tooltip>
        </Space>
        <Button
          type="primary"
          size="large"
          icon={isGeneratingShots ? <LoadingOutlined /> : <ArrowRightOutlined />}
          onClick={handleNextAndGenerateShots}
          loading={isGeneratingShots}
        >
          {isGeneratingShots ? 'AI 分镜生成中...' : '下一步：生成 AI 分镜'}
        </Button>
      </div>
    </div>
  );
};

export default AssetManagerPanel;
