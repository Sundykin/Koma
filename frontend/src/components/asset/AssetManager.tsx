import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tabs, Button, Card, Tag, Image, Empty, Modal, Row, Col, Tooltip, App, Spin, Progress, Switch, Space } from 'antd';
import {
  UserOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  PlusOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  ArrowRightOutlined,
  LoadingOutlined,
  PictureOutlined,
  ReloadOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { Sparkles, RefreshCw } from 'lucide-react';
import type { Character, Scene, Prop, EpisodeAnalysis } from '../../types';
import { loadCharacters, loadScenes, loadProps, saveCharacters, loadEpisodeAnalysis } from '../../store/projectStore';
import { generateSceneImage, generatePropImage } from '../../services/AssetGenerationService';
import { generateCostumePhoto } from '../../workflow/characterAssetWorkflow';
import { startShotAnalysis } from '../../services/ShotAnalysisService';
import { TaskManager, Task } from '../../services/TaskManager';
import { electronService } from '../../services/electronService';
import { CharacterDetailModal } from './CharacterDetailModal';
import { CreateCharacterModal } from './CreateCharacterModal';
import './AssetManager.css';

// SVG 占位图组件
const PlaceholderImage: React.FC<{ type: 'character' | 'scene' | 'prop'; name?: string }> = ({ type, name }) => {
  const icons = {
    character: (
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#1a1a1a"/>
        <circle cx="50" cy="35" r="18" stroke="#3f3f3f" strokeWidth="2"/>
        <path d="M20 85 C20 60, 80 60, 80 85" stroke="#3f3f3f" strokeWidth="2" fill="none"/>
        <text x="50" y="95" textAnchor="middle" fill="#4a4a4a" fontSize="8">点击生成</text>
      </svg>
    ),
    scene: (
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#1a1a1a"/>
        <rect x="10" y="50" width="25" height="35" stroke="#3f3f3f" strokeWidth="2" fill="none"/>
        <rect x="40" y="35" width="25" height="50" stroke="#3f3f3f" strokeWidth="2" fill="none"/>
        <rect x="70" y="45" width="20" height="40" stroke="#3f3f3f" strokeWidth="2" fill="none"/>
        <circle cx="80" cy="20" r="10" stroke="#3f3f3f" strokeWidth="2" fill="none"/>
        <text x="50" y="95" textAnchor="middle" fill="#4a4a4a" fontSize="8">点击生成</text>
      </svg>
    ),
    prop: (
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" fill="#1a1a1a"/>
        <rect x="25" y="25" width="50" height="50" rx="5" stroke="#3f3f3f" strokeWidth="2" fill="none"/>
        <line x1="35" y1="50" x2="65" y2="50" stroke="#3f3f3f" strokeWidth="2"/>
        <line x1="50" y1="35" x2="50" y2="65" stroke="#3f3f3f" strokeWidth="2"/>
        <text x="50" y="95" textAnchor="middle" fill="#4a4a4a" fontSize="8">点击生成</text>
      </svg>
    ),
  };

  return (
    <div className="assetPlaceholder">
      {icons[type]}
    </div>
  );
};

// 生成中状态组件
const GeneratingOverlay: React.FC<{ progress?: number }> = ({ progress }) => (
  <div className="assetGeneratingOverlay">
    <Spin indicator={<LoadingOutlined style={{ fontSize: 32, color: '#52c41a' }} spin />} />
    <div className="assetGeneratingText">AI 生成中...</div>
    {progress !== undefined && progress > 0 && (
      <Progress percent={progress} size="small" strokeColor="#52c41a" style={{ width: 100 }} />
    )}
  </div>
);

interface AssetManagerProps {
  projectId: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  theme?: string;
  stylePrompt?: string;
  // 分镜生成所需
  episodeId?: string;
  episodeName?: string;
  script?: string;
  llmConfigId?: string;
  characters?: Character[];
  scenes?: Scene[];
  props?: Prop[];
  onNext: () => void;
}

type TabType = 'characters' | 'scenes' | 'props';

export const AssetManager: React.FC<AssetManagerProps> = ({
  projectId,
  ttiConfigId,
  itvConfigId,
  theme,
  stylePrompt,
  episodeId,
  episodeName,
  script,
  llmConfigId,
  characters: propCharacters,
  scenes: propScenes,
  props: propProps,
  onNext,
}) => {
  const { message } = App.useApp();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<Character[]>(propCharacters || []);
  const [scenes, setScenes] = useState<Scene[]>(propScenes || []);
  const [props, setProps] = useState<Prop[]>(propProps || []);
  // 跟踪生成中的资产及其进度
  const [generatingTasks, setGeneratingTasks] = useState<Map<string, { progress: number }>>(new Map());
  // 分镜生成状态
  const [isGeneratingShots, setIsGeneratingShots] = useState(false);

  // 角色弹窗状态
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // 分集筛选状态
  const [showCurrentEpisodeOnly, setShowCurrentEpisodeOnly] = useState(true);
  const [episodeAnalysis, setEpisodeAnalysis] = useState<EpisodeAnalysis | null>(null);

  // 筛选后的资产列表
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

  // 点击下一步时自动触发分镜生成
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

      // 加载分集分析数据（如果有 episodeId）
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

  // 加载资产和恢复运行中的任务状态
  useEffect(() => {
    loadAssets();

    // 恢复正在运行的资产生成任务
    const runningTasks = TaskManager.getProjectTasks(projectId)
      .filter(t => t.type === 'asset-generation' && (t.status === 'running' || t.status === 'pending'));
    if (runningTasks.length > 0) {
      const taskMap = new Map<string, { progress: number }>();
      runningTasks.forEach(t => taskMap.set(t.targetId, { progress: t.progress }));
      setGeneratingTasks(taskMap);
    }
  }, [projectId, loadAssets]);

  // 监听任务状态变化
  useEffect(() => {
    const unsubscribe = TaskManager.addListener((task) => {
      if (task.projectId === projectId && task.type === 'asset-generation') {
        if (task.status === 'running' || task.status === 'pending') {
          // 更新进度
          setGeneratingTasks(prev => {
            const next = new Map(prev);
            next.set(task.targetId, { progress: task.progress });
            return next;
          });
        } else if (task.status === 'completed' || task.status === 'failed') {
          // 任务结束，从生成中列表移除
          setGeneratingTasks(prev => {
            const next = new Map(prev);
            next.delete(task.targetId);
            return next;
          });
          if (task.status === 'completed') {
            loadAssets();
            message.success('图片生成完成');
          } else {
            message.error(`生成失败: ${task.error || '未知错误'}`);
          }
        }
      }
    });
    return () => unsubscribe();
  }, [projectId, loadAssets, message]);

  // 检查是否正在生成
  const isGenerating = (id: string) => generatingTasks.has(id);
  const getProgress = (id: string) => generatingTasks.get(id)?.progress;

  // 生成角色定妆照（使用三视图模板）
  const handleGenerateCharacter = async (characterId: string) => {
    if (isGenerating(characterId)) return;
    const character = characters.find(c => c.id === characterId);
    if (!character) return;

    try {
      setGeneratingTasks(prev => new Map(prev).set(characterId, { progress: 0 }));
      const result = await generateCostumePhoto({
        projectId,
        character,
        theme,
        stylePrompt,
        ttiConfigId,
        onProgress: (progress, step) => {
          setGeneratingTasks(prev => {
            const next = new Map(prev);
            next.set(characterId, { progress });
            return next;
          });
        },
      });

      setGeneratingTasks(prev => {
        const next = new Map(prev);
        next.delete(characterId);
        return next;
      });

      if (result.success) {
        await loadAssets();
        message.success('定妆照生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '启动生成失败');
      setGeneratingTasks(prev => {
        const next = new Map(prev);
        next.delete(characterId);
        return next;
      });
    }
  };

  // 生成场景图
  const handleGenerateScene = async (sceneId: string) => {
    if (isGenerating(sceneId)) return;
    try {
      setGeneratingTasks(prev => new Map(prev).set(sceneId, { progress: 0 }));
      await generateSceneImage(projectId, sceneId, ttiConfigId);
    } catch (err: any) {
      message.error(err.message || '启动生成失败');
      setGeneratingTasks(prev => {
        const next = new Map(prev);
        next.delete(sceneId);
        return next;
      });
    }
  };

  // 生成道具图
  const handleGenerateProp = async (propId: string) => {
    if (isGenerating(propId)) return;
    try {
      setGeneratingTasks(prev => new Map(prev).set(propId, { progress: 0 }));
      await generatePropImage(projectId, propId, ttiConfigId);
    } catch (err: any) {
      message.error(err.message || '启动生成失败');
      setGeneratingTasks(prev => {
        const next = new Map(prev);
        next.delete(propId);
        return next;
      });
    }
  };

  const getRoleTag = (role: string) => {
    switch (role) {
      case 'protagonist': return <Tag color="blue">主角</Tag>;
      case 'antagonist': return <Tag color="red">反派</Tag>;
      default: return <Tag>配角</Tag>;
    }
  };

  const getTimeEmoji = (time: string) => {
    switch (time) {
      case 'day': return '☀️';
      case 'night': return '🌙';
      default: return '🌇';
    }
  };

  // 角色弹窗处理
  const handleOpenCharacterDetail = useCallback((char: Character) => {
    setSelectedCharacter(char);
    setIsDetailModalOpen(true);
  }, []);

  const handleCharacterUpdate = useCallback((updated: Character) => {
    setCharacters(prev => prev.map(c => c.id === updated.id ? updated : c));
  }, []);

  const handleCharacterDelete = useCallback(async (characterId: string) => {
    const updatedList = characters.filter(c => c.id !== characterId);
    await saveCharacters(projectId, updatedList);
    setCharacters(updatedList);
    message.success('角色已删除');
  }, [characters, projectId, message]);

  const handleCharacterCreate = useCallback((newChar: Character) => {
    setCharacters(prev => [...prev, newChar]);
    // 创建后自动打开详情弹窗
    setSelectedCharacter(newChar);
    setIsDetailModalOpen(true);
  }, []);

  // 角色网格
  const renderCharacters = () => (
    <Row gutter={[16, 16]}>
      {filteredCharacters.map((char) => {
        const generating = isGenerating(char.id);
        const progress = getProgress(char.id);
        const hasImage = !!char.costumePhotoPath;
        const imageUrl = hasImage ? electronService.fs.toLocalUrl(char.costumePhotoPath!) : null;

        return (
          <Col key={char.id} xs={12} sm={8} md={6} lg={4} xl={3}>
            <Card
              hoverable
              onClick={() => !generating && handleOpenCharacterDetail(char)}
              cover={
                <div className="assetImageContainer">
                  {/* 图片或占位图 */}
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={char.name}
                      preview={false}
                      style={{ aspectRatio: '1/1', objectFit: 'cover', objectPosition: 'top' }}
                    />
                  ) : (
                    <div className="assetPlaceholderWrap">
                      <PlaceholderImage type="character" />
                    </div>
                  )}

                  {/* 角色标签 */}
                  <div className="assetRoleTag">{getRoleTag(char.role)}</div>

                  {/* 生成中覆盖层 */}
                  {generating && <GeneratingOverlay progress={progress} />}

                  {/* 操作按钮 */}
                  {!generating && (
                    <div className="assetOverlay">
                      {hasImage && (
                        <Button
                          type="primary"
                          shape="circle"
                          icon={<EyeOutlined />}
                          onClick={(e) => { e.stopPropagation(); setPreviewUrl(imageUrl!); }}
                        />
                      )}
                      <Tooltip title={hasImage ? '重新生成' : '生成定妆照'}>
                        <Button
                          type="primary"
                          shape="circle"
                          icon={hasImage ? <RefreshCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                          onClick={(e) => { e.stopPropagation(); handleGenerateCharacter(char.id); }}
                          style={{ marginLeft: hasImage ? 8 : 0 }}
                        />
                      </Tooltip>
                    </div>
                  )}
                </div>
              }
              styles={{ body: { padding: '8px 12px' } }}
            >
              <Card.Meta
                title={<span className="assetTitle">{char.name}</span>}
                description={<span className="assetDesc">{char.appearance}</span>}
              />
            </Card>
          </Col>
        );
      })}
      {/* 添加角色按钮 */}
      <Col xs={12} sm={8} md={6} lg={4} xl={3}>
        <Card className="assetAddCard" hoverable onClick={() => setIsCreateModalOpen(true)}>
          <div className="assetAddContent">
            <PlusOutlined style={{ fontSize: 24 }} />
            <span>新建角色</span>
          </div>
        </Card>
      </Col>
    </Row>
  );

  // 场景网格
  const renderScenes = () => (
    <Row gutter={[16, 16]}>
      {filteredScenes.map((scene) => {
        const generating = isGenerating(scene.id);
        const progress = getProgress(scene.id);
        const hasImage = !!scene.imagePath;
        const imageUrl = scene.imagePath ? electronService.fs.toLocalUrl(scene.imagePath) : null;

        return (
          <Col key={scene.id} xs={12} sm={8} md={6} lg={4} xl={3}>
            <Card
              hoverable
              cover={
                <div className="assetImageContainer">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={scene.name}
                      preview={false}
                      onClick={() => !generating && setPreviewUrl(imageUrl)}
                      style={{ aspectRatio: '1/1', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      className="assetPlaceholderWrap"
                      onClick={() => !generating && handleGenerateScene(scene.id)}
                    >
                      <PlaceholderImage type="scene" />
                    </div>
                  )}

                  <div className="assetTimeTag">{getTimeEmoji(scene.time)}</div>

                  {generating && <GeneratingOverlay progress={progress} />}

                  {!generating && (
                    <div className="assetOverlay">
                      {hasImage && (
                        <Button
                          type="primary"
                          shape="circle"
                          icon={<EyeOutlined />}
                          onClick={(e) => { e.stopPropagation(); setPreviewUrl(imageUrl!); }}
                        />
                      )}
                      <Tooltip title={hasImage ? '重新生成' : '生成场景图'}>
                        <Button
                          type="primary"
                          shape="circle"
                          icon={hasImage ? <RefreshCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                          onClick={(e) => { e.stopPropagation(); handleGenerateScene(scene.id); }}
                          style={{ marginLeft: hasImage ? 8 : 0 }}
                        />
                      </Tooltip>
                    </div>
                  )}
                </div>
              }
              styles={{ body: { padding: '8px 12px' } }}
            >
              <Card.Meta
                title={<span className="assetTitle">{scene.name}</span>}
                description={<span className="assetDesc">{scene.mood}</span>}
              />
            </Card>
          </Col>
        );
      })}
      <Col xs={12} sm={8} md={6} lg={4} xl={3}>
        <Card className="assetAddCard" hoverable>
          <div className="assetAddContent">
            <PlusOutlined style={{ fontSize: 24 }} />
            <span>新建场景</span>
          </div>
        </Card>
      </Col>
    </Row>
  );

  // 道具网格
  const renderProps = () => (
    <Row gutter={[16, 16]}>
      {filteredProps.length > 0 ? filteredProps.map((prop) => {
        const generating = isGenerating(prop.id);
        const progress = getProgress(prop.id);
        const hasImage = !!prop.imagePath;
        const imageUrl = prop.imagePath ? electronService.fs.toLocalUrl(prop.imagePath) : null;

        return (
          <Col key={prop.id} xs={12} sm={8} md={6} lg={4} xl={3}>
            <Card
              hoverable
              cover={
                <div className="assetImageContainer propContainer">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={prop.name}
                      preview={false}
                      onClick={() => !generating && setPreviewUrl(imageUrl)}
                      style={{ aspectRatio: '1/1', objectFit: 'contain', padding: 8 }}
                    />
                  ) : (
                    <div
                      className="assetPlaceholderWrap"
                      onClick={() => !generating && handleGenerateProp(prop.id)}
                    >
                      <PlaceholderImage type="prop" />
                    </div>
                  )}

                  <div className="assetPropTag"><Tag>{prop.type}</Tag></div>

                  {generating && <GeneratingOverlay progress={progress} />}

                  {!generating && (
                    <div className="assetOverlay">
                      {hasImage && (
                        <Button
                          type="primary"
                          shape="circle"
                          icon={<EyeOutlined />}
                          onClick={(e) => { e.stopPropagation(); setPreviewUrl(imageUrl!); }}
                        />
                      )}
                      <Tooltip title={hasImage ? '重新生成' : '生成道具图'}>
                        <Button
                          type="primary"
                          shape="circle"
                          icon={hasImage ? <RefreshCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                          onClick={(e) => { e.stopPropagation(); handleGenerateProp(prop.id); }}
                          style={{ marginLeft: hasImage ? 8 : 0 }}
                        />
                      </Tooltip>
                    </div>
                  )}
                </div>
              }
              styles={{ body: { padding: '8px 12px' } }}
            >
              <Card.Meta
                title={<span className="assetTitle">{prop.name}</span>}
                description={<span className="assetDesc">{prop.description}</span>}
              />
            </Card>
          </Col>
        );
      }) : (
        <Col span={24}>
          <Empty description="未检测到关键道具" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Col>
      )}
      <Col xs={12} sm={8} md={6} lg={4} xl={3}>
        <Card className="assetAddCard" hoverable>
          <div className="assetAddContent">
            <PlusOutlined style={{ fontSize: 24 }} />
            <span>新建道具</span>
          </div>
        </Card>
      </Col>
    </Row>
  );

  const tabItems = [
    { key: 'characters', label: <span><UserOutlined /> 角色</span>, children: renderCharacters() },
    { key: 'scenes', label: <span><EnvironmentOutlined /> 场景</span>, children: renderScenes() },
    { key: 'props', label: <span><InboxOutlined /> 道具</span>, children: renderProps() },
  ];

  return (
    <div className="assetManagerContainer">
      <Tabs
        items={tabItems}
        tabBarExtraContent={
          <Space>
            {episodeId && (
              <Space size="small">
                <FilterOutlined />
                <span style={{ fontSize: 12, color: '#a1a1aa' }}>仅当前分集</span>
                <Switch
                  size="small"
                  checked={showCurrentEpisodeOnly}
                  onChange={setShowCurrentEpisodeOnly}
                  disabled={!episodeAnalysis}
                />
              </Space>
            )}
            <Tooltip title="批量生成素材">
              <Button icon={<ThunderboltOutlined />}>批量生成</Button>
            </Tooltip>
          </Space>
        }
      />

      {/* 底部操作栏 */}
      <div className="assetFooter">
        <Button
          type="primary"
          size="large"
          icon={isGeneratingShots ? <LoadingOutlined /> : <ArrowRightOutlined />}
          onClick={handleNextAndGenerateShots}
          loading={isGeneratingShots}
          className="assetNextBtn"
        >
          {isGeneratingShots ? 'AI 分镜生成中...' : '下一步：生成 AI 分镜'}
        </Button>
      </div>

      {/* 全图预览 */}
      <Modal
        open={!!previewUrl}
        onCancel={() => setPreviewUrl(null)}
        footer={null}
        centered
        width="auto"
        styles={{ body: { padding: 0 } }}
      >
        {previewUrl && <img src={previewUrl} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '85vh' }} />}
      </Modal>

      {/* 角色详情弹窗 */}
      <CharacterDetailModal
        open={isDetailModalOpen}
        character={selectedCharacter}
        projectId={projectId}
        theme={theme}
        stylePrompt={stylePrompt}
        ttiConfigId={ttiConfigId}
        itvConfigId={itvConfigId}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedCharacter(null);
        }}
        onUpdate={handleCharacterUpdate}
        onDelete={handleCharacterDelete}
      />

      {/* 新建角色弹窗 */}
      <CreateCharacterModal
        open={isCreateModalOpen}
        projectId={projectId}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCharacterCreate}
      />
    </div>
  );
};
